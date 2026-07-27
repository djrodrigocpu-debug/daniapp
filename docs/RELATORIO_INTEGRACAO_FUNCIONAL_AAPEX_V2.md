# Relatório de Integração Funcional — AAPEX / AACE V2.0

> Sessão de continuação. Branch `aapex-v2-implantacao-corporativa`.
> Baseline recebido: HEAD `3207f73`. HEAD ao final desta sessão: ver `git log`.
> Data: 2026-07-22. Autoria assistida (Claude Opus 4.8) sob revisão humana.

Este relatório é **honesto por exigência do escopo**: separa o que foi de fato
executado do que permanece simulado ou bloqueado, com códigos de bloqueio e o
work-around local adotado. A recomendação final **não** declara prontidão para
piloto — ver §12.

---

## 1. Baseline encontrado

O relatório anterior (`RELATORIO_FINAL_IMPLEMENTACAO_AAPEX_V2.md`) entregou uma
fundação técnica boa, porém reconhecia explicitamente que:

- as telas legadas ainda usam o `AppContext` demonstrativo (`src/data/mock.ts`);
- a integração das telas com os repositórios ficou pendente;
- **migrations não foram executadas em banco**; RLS/Storage/Auth não validados
  em banco real;
- Supabase e Vercel não provisionados.

Verificação objetiva desta sessão confirmou o diagnóstico: 151 testes verdes,
mas os de banco (`src/db/migrations.test.ts`) eram **estáticos** — apenas
`readFileSync` + regex sobre o texto SQL, sem nenhum Postgres no circuito.

## 2. Ambiente desta máquina (verificado, sem expor segredos)

| Recurso | Estado |
| --- | --- |
| Node / npm | v24.18.0 / 11.16.0 — OK |
| Docker / Docker Compose | **ausente** (`command not found`) |
| Supabase CLI | **ausente** |
| `psql` / Postgres nativo | **ausente** |
| `.env` (credenciais Supabase) | **ausente**; só `.env.example` |
| `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` | não definidas |
| `SUPABASE_SERVICE_ROLE_KEY` | não definida (correto — jamais no cliente) |

Consequência direta: **não é possível**, nesta máquina, subir o stack Supabase
local (precisa de Docker) nem falar com um projeto Supabase remoto (sem
credenciais). Isso bloqueia a execução *em runtime* de GoTrue (Auth), PostgREST e
Storage, e o deploy na Vercel.

## 3. Decisão-chave: banco REAL sem Docker nem credenciais (work-around)

Para não repetir a lacuna anterior (“migrations não executadas”), adotou-se
**PGlite** (`@electric-sql/pglite`) — o **PostgreSQL real compilado para WASM**
(reporta `PostgreSQL 18.3`) — rodando em processo dentro dos testes.

- Extensão `pgcrypto` real carregada via `@electric-sql/pglite/contrib/pgcrypto`,
  de modo que **as migrations 0001/0002/0003 rodam SEM qualquer alteração** nos
  arquivos versionados (preserva rastreabilidade — §28).
- Camada de compatibilidade mínima (`src/db/testing/supabase_compat.sql`):
  papéis `anon`/`authenticated`/`service_role`, schema `auth`, `auth.users`,
  `auth.uid()` lendo o claim JWT da sessão — exatamente o que o PostgREST injeta.
- RLS é **de fato aplicada**: cada teste entra numa transação com
  `set local role authenticated` + `request.jwt.claims`, e o Postgres decide.
  Prova empírica: superuser vê todas as linhas; cada usuário vê só as suas.

Isto **não** substitui uma homologação em Supabase real (Auth/Storage/PostgREST
não estão no circuito), mas valida de verdade a camada de banco (esquema, DDL,
constraints, triggers e **políticas RLS**), que antes só existia como texto.

## 4. O que esta sessão executou de fato

### 4.1 Banco executável + RLS + integridade (commit `test: … PGlite`)
- `src/db/testing/harness.ts` — sobe PGlite, aplica compat + `0001→0003` + seed;
  `asUser()/asAnon()` executam sob RLS; `reset()` testa `db reset`.
- `src/db/testing/fixtures.ts` — cenário corporativo fictício (2 GCs em escopos
  distintos, admin, regional, 2 coordenadores, template travado, indicador usado,
  avaliação submetida).
- `src/db/schema.integration.test.ts` (10) — 28 tabelas, RLS forçada em todas,
  57 policies, 26 triggers, constraints (PR/SC, FK, unique, `idempotency_key`),
  `db reset` idempotente.
- `src/db/rls.integration.test.ts` (15) — isolamento entre GCs (T01), escopo de
  coordenador/regional, admin-only em indicadores (D-05), **sem autoaprovação**
  (T02), anônimo não lê nada.
- `src/db/triggers.integration.test.ts` (10) — indicador usado não deletável
  (T05), template travado/itens imutáveis (T06), avaliação aprovada imutável
  (T07), `audit_logs`/snapshots append-only (T25), `row_version`/`updated_at`.

### 4.2 Autenticação corporativa conectada à UI (commit `feat: … AuthController`)
- `src/services/auth/AuthController.ts` — ciclo de vida da sessão (restauração,
  login, logout, expiração T10) sobre qualquer `AuthRepository`; **testado**.
- `src/services/auth/DemoAuthRepository.ts` — backend fictício **só de dev**, sem
  senha embutida (T30), quatro perfis alinhados ao cenário de RLS.
- `src/services/auth/authFactory.ts` — Supabase quando configurado; demo só em
  dev; `NullAuthRepository` recusa login em prod/homolog sem backend (**modo demo
  impossível em produção**, §8).
- `src/context/AuthProvider.tsx` + `src/components/AuthModeBanner.tsx` — provider
  é fonte de verdade da sessão (restore no boot); a tela de login identifica
  visualmente o ambiente. `App.tsx` monta o `AuthProvider` por fora.
- `src/db/auth-session.integration.test.ts` (4) — prova em banco real sob RLS o
  contrato de dados de `buildSession` (papéis/escopo por perfil; sem vazamento).

### 4.3 Verificação
| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm test` | **202/202** (25 arquivos) — inclui 39 testes de banco real |
| `npm run test:db` | 39/39 (schema+rls+triggers+auth-session) |
| `npm run build` (expo export web) | OK — bundle 1.7 MB em `dist/` |
| Varredura de segredos | OK (sem `.env`/`dist` versionados; sem service role) |

## 5. Divergências em relação ao relatório anterior

- Anterior: “migrations não executadas / RLS não testada” → **corrigido**: agora
  executadas e testadas em Postgres real (PGlite), 39 testes de banco.
- Anterior tratava vários itens de banco como “CONCLUÍDA (com ressalva)”. Esta
  sessão **rebaixa** o significado: só é “real” o que roda no banco/teste.

## 6. Auditoria de integração (estado REAL por fluxo)

Legenda: ✅ real/executado · ⚠️ parcial · ❌ ausente/bloqueado · N/A.

| Fluxo | Interface | Repositório | Banco | RLS | Teste E2E | Estado real |
| --- | --- | --- | --- | --- | --- | --- |
| Autenticação (login/logout/sessão) | ⚠️ provider + banner na UI; telas operacionais ainda no demo | ✅ `SupabaseAuthRepository` + demo | ✅ schema `users/scopes` | ✅ testada | ❌ (sem GoTrue local) | **Orquestração real e testada; runtime Supabase pendente** |
| Isolamento por escopo (RLS) | ⚠️ derivação de escopo no domínio | ✅ | ✅ | ✅ **testada** | ⚠️ integração DB | **Real no banco** |
| Estrutura organizacional | ❌ sem tela admin | ❌ | ✅ tabelas | ✅ | ❌ | Banco pronto; UI ausente |
| Administração de usuários | ❌ | ❌ | ✅ | ✅ (admin-only) | ❌ | Banco/RLS prontos; UI ausente |
| Indicadores versionados | ⚠️ tela legada (demo) | ❌ repo não implementado | ✅ | ✅ admin-only + T05 | ⚠️ DB | Banco/RLS/trigger reais; UI/repo ausentes |
| Visitas/auditorias | ⚠️ telas demo (AppContext) | ❌ | ✅ | ✅ | ❌ | Fluxo só no demo |
| Evidências / Storage | ⚠️ URI local no demo | ❌ | ✅ metadados | ✅ | ❌ | **Storage não executado (bloqueado)** |
| Planos de ação | ⚠️ tela demo | ❌ | ✅ | ✅ | ❌ | Só no demo |
| Validações (aprovar/devolver) | ⚠️ tela demo | ❌ | ✅ | ✅ **can_validate/T02** | ⚠️ DB | Regra real no banco; UI no demo |
| Dashboard / Agenda | ⚠️ números do demo | ❌ | ✅ | ✅ | ❌ | Só no demo |
| Offline / outbox | ❌ não ligado à UI | ✅ domínio (funções) | ✅ `sync_operations` | ✅ | ❌ | Domínio testado; sem UI |
| Boas práticas | ⚠️ tela demo | ❌ | ✅ | ✅ moderação | ❌ | Só no demo |

## 7. Testes reais de RLS (resumo do que passou no banco)

- GC A lê só a sua operação; **não** lê a do GC B; recíproco para GC B.
- GC A **não** cadastra/edita indicador (admin-only); **não** vê o admin;
  **não** aprova a própria avaliação (T02).
- Coordenador lê apenas a sua coordenadoria; **pode** validar avaliação de outro
  autor no seu escopo; **não** valida fora do escopo.
- Regional lê as duas coordenadorias da região; **não** cadastra indicador.
- Admin cria definição/versão de indicador e lê todos os usuários; **não**
  consegue apagar fisicamente indicador já usado (trigger T05).
- Anônimo não lê nada.

## 8. Usuários de homologação

O cenário de homologação vive em `src/db/testing/fixtures.ts` e no
`DEMO_DIRECTORY` (dev): Admin, Regional, Coordenador, GC A, GC B — **e-mails
fictícios** (`@fic.example` / `@demo.local`), **sem senha em Git**. Em Supabase
real, a criação de usuários exige GoTrue (bloqueado aqui); o procedimento fica
documentado em `OPERACAO_E_DEPLOY_AAPEX_V2.md` (senha via variável/tela, nunca
versionada).

## 9. O que permanece SIMULADO (demo) — não cutover

As telas operacionais (Dashboard, Operações, Agenda, Ações, Validações, Avaliação,
Performance, Perfil) continuam lendo o `AppContext`/`mock.ts`. A autenticação já
passa pelo `AuthProvider`, mas o **corte das telas para os repositórios não foi
feito** — é uma migração que precisa de runtime (device/Expo) e/ou Supabase para
ser verificada com honestidade, e não foi realizada às cegas.

## 10. Bloqueios (com código, dado necessário e work-around)

| Código | Descrição | Dado necessário | Work-around nesta sessão | Impacto |
| --- | --- | --- | --- | --- |
| DEP-01 | Auth em runtime (GoTrue) | Projeto Supabase + credenciais **ou** Docker p/ CLI | Contrato de sessão validado em banco real (RLS) | Login real ponta a ponta não demonstrado |
| DEP-02 | Storage de evidências | Bucket + políticas em Supabase | Metadados/políticas modelados; sem upload real | Evidência definitiva não exercitada |
| DEP-03 | Homologação de RLS em Supabase gerenciado | Projeto Supabase | RLS executada em Postgres real (PGlite) | Falta confirmar paridade no ambiente gerenciado |
| DEP-04 | Deploy/preview | Credenciais Vercel | `expo export web` OK; comando documentado | Sem URL de preview |
| DEP-05 | E2E de UI (Playwright) | App servido contra backend real | Testes de integração de banco no lugar | Sem E2E de tela |

Nenhum destes é “só precisa de credenciais” sem mais: cada um tem work-around
local e um teste/validação associado acima.

## 11. Riscos e observações

- **Paridade PGlite × Supabase**: PGlite é Postgres real, mas o gerenciado tem
  `auth`/`storage` próprios; as policies assumem `auth.uid()`/role `authenticated`
  — reproduzidos fielmente no shim, porém a confirmação final exige o ambiente
  gerenciado (DEP-03).
- **Strangler incompleto**: coexistência de `AuthProvider` (real) e `AppContext`
  (demo). É intencional e documentado, mas significa que a fonte de verdade das
  telas operacionais ainda é o mock.

## 12. Recomendação

**AINDA NÃO PRONTO PARA PILOTO.**

Avançou de forma concreta e verificável em dois eixos (banco executável + RLS
real; autenticação corporativa orquestrada e testada), mas os critérios do §34
que **ainda faltam**:

1. telas operacionais cortadas do `mock.ts` para os repositórios (visitas,
   auditorias, planos, validações, dashboard, agenda);
2. Auth/Storage exercitados em Supabase real (DEP-01/02/03);
3. evidências chegando ao Storage;
4. E2E dos quatro perfis em runtime;
5. preview publicado (DEP-04).

**Merge**: recomenda-se **não** fazer merge na `main` ainda. A branch pode ser
mesclada por *squash* para consolidar a fundação **de banco e autenticação**
somente após: (a) provisionar Supabase de homologação e reexecutar as migrations
+ RLS lá; (b) concluir o cutover de pelo menos um fluxo vertical (visita →
auditoria → validação) para os repositórios. Até lá, mantê-la como branch de
integração.

## 13. Prontidão por módulo

| Módulo | UI real | Banco real | RLS real | Teste real | Pronto para piloto |
| --- | ---: | ---: | ---: | ---: | ---: |
| Autenticação/sessão | ⚠️ parcial | ✅ | ✅ | ✅ | ❌ |
| Estrutura organizacional | ❌ | ✅ | ✅ | ✅ | ❌ |
| Administração de usuários | ❌ | ✅ | ✅ | ✅ | ❌ |
| Indicadores versionados | ❌ | ✅ | ✅ | ✅ | ❌ |
| Visitas/auditorias | ❌ (demo) | ✅ | ✅ | ⚠️ | ❌ |
| Evidências/Storage | ❌ | ✅ (metadados) | ✅ | ❌ | ❌ |
| Planos de ação | ❌ (demo) | ✅ | ✅ | ⚠️ | ❌ |
| Validações | ❌ (demo) | ✅ | ✅ | ✅ | ❌ |
| Dashboard/Agenda | ❌ (demo) | ✅ | ✅ | ❌ | ❌ |
| Offline/sincronização | ❌ | ✅ | ✅ | ✅ (domínio) | ❌ |

## 14. Próximo passo exato (retomada)

Ver `IMPLEMENTATION_STATUS_AAPEX_V2.md` › “Próximo passo executável”. Em resumo:
implementar `PgVisitsRepository`/`PgIndicatorsRepository` (via supabase-js) e
cortar `OperationsScreen` + `EvaluationScreen` + `ValidationsScreen` do
`AppContext` para esses repositórios, validando o fluxo vertical
visita→auditoria→validação primeiro contra Supabase de homologação.
