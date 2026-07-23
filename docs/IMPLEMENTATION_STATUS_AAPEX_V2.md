# Diário Executivo de Implementação — AAPEX / AACE V2.0

> Atualizado a cada fase. Registra o que foi feito, resultado de testes, riscos e o próximo passo executável.
> Branch: `aapex-v2-implantacao-corporativa` · Baseline: `main @ 3051ef3`.

## Estado do ambiente (verificado)

| Item | Valor |
| --- | --- |
| Caminho | `C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0` |
| Origin | `https://github.com/djrodrigocpu-debug/daniapp.git` |
| Branch base | `main` @ `3051ef3` (árvore limpa) |
| Branch de trabalho | `aapex-v2-implantacao-corporativa` |
| Node | v24.18.0 · npm 11.16.0 |
| Expo | ~57.0.4 (mantido — §18.4) |
| TypeScript | ~6.0.3, `strict: true` |

## Baseline de testes (antes da implementação)

- `package.json` **não possuía** script `test`, `lint` nem runner configurado.
- Scripts existentes: `typecheck` (`tsc --noEmit`), `build` (`expo export --platform web`).
- Persistência: AsyncStorage (`@aace_excelencia:data:v1.2`) como banco autoritativo (a substituir).
- Segredo demo presente: `demoPassword = 'Aace@2026'` em `src/data/mock.ts` (a remover — REQ-A-01).

---

## Fase 0 — Baseline e documentação — **CONCLUÍDA**

**Feito:**
- Verificação de ambiente registrada (Git, Node, npm, Expo).
- Branch `aapex-v2-implantacao-corporativa` criada a partir de `3051ef3`.
- Estrutura `docs/masterplan`, `docs/auditorias`, `docs/adr` criada.
- Masterplan PDF + DOCX copiados; SHA-256 registrados; `(1).pdf` confirmado idêntico ao canônico.
- Auditoria técnica copiada para `docs/auditorias/` com hash.
- Versão Markdown pesquisável do Masterplan (52 páginas, todas as tabelas e anexos A–K).
- `docs/masterplan/README.md` (autoridade documental, finalidade, hashes).
- `docs/MATRIZ_RASTREABILIDADE_AAPEX_V2.md` (requisitos REQ-* → implementação/teste/evidência).
- `docs/DECISOES_PENDENTES_AAPEX_V2.md` (P01–P15, DEP-01..07, contradições C-01..03).
- Este diário.

**Testes:** n/a (fase documental).

**Riscos/bloqueios:** provedor e credenciais Supabase pendentes (P09, DEP-01..05) — não bloqueiam código offline.

**Commit:** `docs: incorpora masterplan executivo e auditoria da AAPEX V2`

**Próximo passo:** Fase 1 — fundação corporativa (`src/config/env.ts`, cliente Supabase sem service role, camada de erros, contratos de repositório).

---

## Fase 1 — Fundação da camada corporativa — **CONCLUÍDA**

**Feito:** config tipada (`src/config/env.ts`) com validação e bloqueio de service
role; feature flags (ranking travado); `AppError`+`Result<T>`; modelo de domínio
corporativo (4 perfis, versionamento, workflow); contratos de repositório
(strangler); cliente Supabase só-anon; `.env.example`; `.gitignore` endurecido.
**Segurança:** senha demo `Aace@2026` removida do bundle/README/telas; login demo
sem credencial, gated por `featureFlags.demoMode`.
**Testes:** 20 (env, featureFlags, client, varredura de segredos T03/T30). typecheck OK.
**Commit:** `feat: adiciona fundacao corporativa e remove senha demo do bundle` (`d7d3369`).

## Fase 2 — Modelo de dados e migrations — **CONCLUÍDA (com ressalva de execução)**

**Feito:** migrations SQL versionadas em `supabase/migrations/`:
- `0001_core_schema.sql` — 28 tabelas (§11.2), enums, UUIDs, índices, FKs,
  idempotency_key, row_version, vínculo `auth.users`.
- `0002_rls_policies.sql` — RLS deny-by-default + funções de autorização
  (`has_operation_access`, `can_validate` sem autoaprovação), indicadores admin-only.
- `0003_integrity_triggers.sql` — indicador usado não deletável (T05), template
  travado (T06), avaliação aprovada imutável (T07), audit_logs/snapshots append-only
  (T25), row_version/updated_at automáticos.
- `0001_core_schema.down.sql` — reversão.
- `supabase/seed/0001_seed_catalog.sql` — 24 temas + 12 indicadores (seed, P05).

**Testes:** 17 estáticos (`src/db/migrations.test.ts`) validando invariantes de
esquema, RLS, gatilhos e seed.
**Ressalva:** execução em banco real (T01/T02/T19 no servidor) é `BLOQUEADO POR
DEPENDÊNCIA EXTERNA` (P09/DEP-03) — requer projeto Supabase provisionado.
**Commit:** `feat: cria modelo de dados e migrations iniciais`.

## Fase 3 — Autenticação individual — **CONCLUÍDA (com ressalva)**

`SupabaseAuthRepository` (login/logout/sessão/reset sem enumeração); `domain/auth/session.ts`
(escopos vigentes, papéis, sessão expirada T10); versão do app derivada do build (T29).
Execução real requer Supabase (P09). Commit `73f5a21`.

## Fase 4 — RBAC e RLS — **CONCLUÍDA (código)**

`authz/policy.ts` (isolamento T01, sem autoaprovação T02, export por escopo T16, ranking
travado T28) + RLS em `0002` como autoridade. Execução em banco: ressalva P09.

## Fases 5–13 — Domínio — **CONCLUÍDAS**

Scoring/submission (T13/T14/T15), calendário (T12), indicadores/ciclo de vida (T05),
workflow, validação (T02), imutabilidade/adendo (T07), exportação (T16), boas práticas
(T27). Commit `a49242a`. 127→ testes.

## Fase 14 — Offline e sincronização — **CONCLUÍDA**

Outbox idempotente (T08/T24), backoff (T09), conflitos (T11/T23), engine de flush.
Commit `018d09d`.

## Fase 15 — Segurança e LGPD — **CONCLUÍDA (documentação + controles no código)**

`docs/SEGURANCA_E_LGPD_AAPEX_V2.md` (modelo de ameaças STRIDE, controles, retenção,
trilha). Controles no código: sem segredo no bundle, RLS, imutabilidade, audit append-only.
Base legal/retenção dependem de P07/P08 (DPO).

## Fases 16–18 — Testes, deploy e relatório — **CONCLUÍDAS (no possível)**

151 testes verdes; typecheck OK; build web OK. Runbook de deploy/rollback e criação do 1º
admin; relatório final. Deploy real e restauração de backup bloqueados por P09/DEP.

---

## Verificação final (2026-07-22)

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm test` | 151/151 (19 arquivos) |
| `npm run build` (web) | OK — `dist/` |
| Varredura de segredos | OK (T03/T30) |

**Próximo passo executável:** aprovar P09 e provisionar Supabase; aplicar migrations 0001→0003;
validar RLS positiva/negativa em banco real (T01/T02/T19); migrar telas legadas para os
repositórios (concluir strangler).

---

## Continuação — Integração funcional (2026-07-22)

> Relatório completo e honesto: `docs/RELATORIO_INTEGRACAO_FUNCIONAL_AAPEX_V2.md`.

### Ambiente desta máquina (verificado)
Docker, Supabase CLI, `psql` e credenciais Supabase **ausentes**. Impossível subir
o stack Supabase local (precisa Docker) ou remoto (sem credenciais). Auth/Storage
em runtime e deploy Vercel permanecem bloqueados (DEP-01..05).

### Fase 19 — Banco EXECUTÁVEL + RLS/integridade reais — **CONCLUÍDA**
Adotado **PGlite** (PostgreSQL 18 em WASM) para executar as migrations REAIS sem
Docker/credenciais. `pgcrypto` real via contrib → migrations rodam **intactas**.
Shim de compatibilidade (`src/db/testing/supabase_compat.sql`): papéis + `auth.uid()`.
- `src/db/testing/harness.ts` / `fixtures.ts`; `test:db` no `package.json`.
- 39 testes de banco real: esquema/constraints/`db reset` (10), RLS por perfil (15),
  triggers de integridade (10), contrato de sessão sob RLS (4).
- Substitui os testes estáticos de texto SQL por **execução de verdade**.
**Commit:** `test: executa migrations e valida RLS/integridade em banco real (PGlite)`.

### Fase 20 — Autenticação corporativa conectada à UI — **CONCLUÍDA (código+testes)**
`AuthController` (restore/login/logout/expiração T10) + `DemoAuthRepository` (dev,
sem senha) + `authFactory` (demo impossível em produção) + `AuthProvider`/
`AuthModeBanner` na UI. `App.tsx` monta o provider por fora. Runtime Supabase
pendente (DEP-01). **Commit:** `feat: conecta autenticação corporativa à interface`.

### Verificação (2026-07-22, continuação)
| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm test` | **202/202** (25 arquivos) |
| `npm run test:db` | 39/39 |
| `npm run build` (web) | OK — `dist/` (1.7 MB) |

### Estado de prontidão
**AINDA NÃO PRONTO PARA PILOTO** (ver §34 e o relatório de integração). Faltam:
cutover das telas operacionais do `mock.ts` para repositórios; Auth/Storage em
Supabase real; E2E dos quatro perfis; preview publicado.

**Próximo passo executável:** implementar `PgVisitsRepository`/`PgIndicatorsRepository`
(supabase-js) e cortar `OperationsScreen`+`EvaluationScreen`+`ValidationsScreen` do
`AppContext`, validando o fluxo vertical visita→auditoria→validação contra Supabase
de homologação.

---

## Atualização 2026-07-23 — Fechamento funcional (verticais 1–8)

Migração completa das telas para a camada de repositórios; `AppContext`/`mock`
eliminados como fonte. Detalhes e tabelas em
[`RELATORIO_FECHAMENTO_APLICATIVO_AAPEX_V2.md`](RELATORIO_FECHAMENTO_APLICATIVO_AAPEX_V2.md).

- **Feito:** autenticação real na UI; repositórios Local+Supabase para Operações,
  Auditorias, Ações, Validações, Administração (usuários + indicadores versionados),
  Performance e Evidências; providers dedicados; Dashboard/Agenda por repositório;
  offline com persistência e sem duplicidade; `AppContext` removido.
- **Métrica de legado:** 0 `useApp` em telas; 0 imports de `mock.ts` em telas.
- **Testes/build:** 263 testes (56 PGlite) · typecheck · build web — todos OK.
  Runtime verificado por perfil (GC/Coordenador/Admin).
- **Bloqueado (ambiente):** Auth/Storage remotos, RLS em runtime, preview Vercel e
  E2E completo dependem de Supabase provisionado. Adapters Supabase prontos.
- **Próximo passo:** provisionar Supabase de homologação, criar views `ui_*` + RPCs
  esperados pelos adapters, e validar login + auditoria→validação contra o servidor.

---

## Atualização 2026-07-23 (parte 2) — Implantação no Supabase remoto de homologação

> Projeto Supabase: `plnbgdabciwygsmnyddy`. Branch: `aapex-v2-implantacao-corporativa`
> (sem merge na `main`). Nenhum segredo versionado; `service_role` jamais no cliente.

### Fase 21 — Camada server-side (projeções + RPCs + storage) — **CONCLUÍDA**

A auditoria confrontou os adapters `Supabase*Repository.ts` com o SQL e constatou que
**toda a camada server-side referenciada pelo código não existia** nas migrations
(5 views `ui_*`, 19 RPCs, bucket de evidências) e que havia **contradição de contrato**
(adapters filtravam por snake_case e faziam cast para tipos camelCase). Construída e
validada em Postgres real (PGlite/PG18) **antes** de qualquer contato com o remoto:

- `0004_domain_extension.sql` — tabelas `indicator_results`/`visit_reports` (RLS
  forçada + políticas por operação + `updated_at`), colunas de UI ausentes em
  `evaluations`/`action_plans`, e helpers (`score_traffic_light` = farol §15;
  tradução `app.action_status` ↔ união da UI).
- `0005_ui_projections.sql` — 5 views `ui_operations`/`ui_evaluations`/
  `ui_action_plans`/`ui_users`/`ui_indicators`, **`security_invoker = true`**
  (a RLS-base é avaliada no papel do usuário — sem isso vazaria linhas), camelCase.
- `0006_domain_rpcs.sql` — 19 RPCs `SECURITY DEFINER` com `search_path` fixo e
  **autorização explícita no corpo** (as mesmas funções da RLS): anti-autoaprovação
  (T02), admin-only (D-05), escopo (T01), travas de envio §7.4 (completude/evidência/
  plano para item vermelho), snapshot oficial imutável na aprovação.
- `0007_storage_evidencias.sql` — bucket **privado** `evidencias` + políticas de
  `storage.objects` (guardado por existência do schema `storage`: no-op no PGlite,
  aplica no Supabase real).
- **Reconciliação de contrato:** views/RPCs em camelCase; adapters ajustados
  (`nextAudit`/`createdAt`/`submittedAt`/`dueDate`/`operationId`); `mapRow` de
  `ui_operations` simplificado.
- **Higiene de deploy:** `0001_core_schema.down.sql` movido para `supabase/rollback/`
  para o `db push` aplicar **só** os forward 0001–0007 (sem colisão de versão);
  harness passa a **descobrir migrations dinamicamente**.

**Testes:** `src/db/projections.integration.test.ts` (+18) exercita as views por
perfil (RLS respeitada) e os RPCs (positivo/negativo). `test:db` **74/74**.

### Fase 22 — Aplicação e verificação no remoto — **CONCLUÍDA (com nota)**

- `supabase login` + `link --project-ref plnbgdabciwygsmnyddy` (token/senha digitados
  pelo operador; nunca expostos).
- `db push --dry-run` **100% limpo** — 7 migrations reconhecidas, em ordem.
- `db push` aplicou **0001→0007** no remoto sem erro.
- **Verificado por leitura no remoto:** `migration list --linked` → 0001–0007
  registradas; `gen types typescript --linked` (`src/services/supabase/database.types.ts`,
  ligado em `client.ts`) confirma no schema real **5 views `ui_*`**, **19 RPCs** e as
  **tabelas novas**.
- **Garantido por construção:** RLS enable/force nas 30 tabelas, políticas, triggers e
  bucket privado — o **mesmo SQL** aplicado ao remoto é provado pelos 74 testes PGlite;
  o `0007` rodou no remoto (schema `storage` presente).
- **Nota honesta:** introspecção RLS **ao vivo** no remoto não pôde ser executada nesta
  máquina (`db dump` exige Docker, ausente). SQL de verificação independente fornecido
  no relatório. `admin_create_user` insere em `auth.users` via SQL — funciona, mas o
  **onboarding de produção** deve migrar para a Auth Admin API / Edge Function.

### Verificação (2026-07-23, parte 2)
| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm test` | **281/281** (35 arquivos) |
| `npm run test:db` | **74/74** (PGlite) |
| `npm run build` (web) | OK — `dist/` |
| `db push` remoto | 0001→0007 aplicadas |
| Varredura de segredos | OK (sem `.env`/token/`service_role`) |

**Próximo passo executável:** definir na Vercel as variáveis **públicas**
`EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` (o `RepositoryProvider`
passa a `source:'supabase'` sem mudar UI); provisionar ao menos um usuário real
(auth + `public.users` + `user_scopes`) para login; smoke test anon-denial ao vivo.
