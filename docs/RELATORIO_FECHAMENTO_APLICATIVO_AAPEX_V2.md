# Relatório de Fechamento Funcional — AAPEX / AACE Excelência V2

**Branch:** `aapex-v2-implantacao-corporativa`
**Data:** 2026-07-22
**Escopo desta sessão:** conectar a autenticação corporativa real à interface (fluxo vertical nº 1 do §28) e verificar o funcionamento **em runtime**, não apenas por testes estáticos.

> **Aviso de honestidade (obrigatório).** Este ambiente de desenvolvimento **não possui
> Docker, Supabase CLI, `psql` nem credenciais** (só `.env.example`). Logo, GoTrue (Auth),
> PostgREST e Storage **não podem ser exercitados em runtime aqui**, e não há preview
> Vercel. A camada de banco é validada com **PGlite** (PostgreSQL real em WASM). Nada
> abaixo declara Auth/Storage remotos como concluídos. Ver `env-no-docker-supabase`.

---

## 1. Estado inicial (HEAD `1b2f94e`)

- Fundação corporativa **real e testada**, porém **desligada das telas**:
  - `AuthController` + `authFactory` + `AuthProvider` (orquestração de sessão) — testados, mas **nenhuma tela os consumia**;
  - `LoginScreen` fazia login **fictício** via `AppContext` (só e-mail, sem senha, com seletor de perfil demonstrativo no caminho principal);
  - migrations 0001–0003 + RLS + triggers testados em PGlite;
  - domínio puro completo (workflow, calendário, scoring, submissão, validação, outbox, authz, indicadores) testado.
- Todas as telas operacionais liam o `AppContext` monolítico (seed `mock.ts` + `AsyncStorage`).
- Baseline: **202 testes**, typecheck limpo, build web OK.

O problema objetivo: **o login não era real** e a identidade das telas vinha de um atalho demonstrativo, não de uma sessão autenticada.

---

## 2. O que foi feito nesta sessão (fluxo vertical nº 1: autenticação real)

Substituição do login demonstrativo pelo **fluxo corporativo real de ponta a ponta**,
mantendo a estratégia *strangler* (§9.3): a mesma UI usa `SupabaseAuthRepository` em
produção e `DemoAuthRepository` em dev, **sem mudança de tela**.

| # | Mudança | Arquivo |
|---|---------|---------|
| 1 | Ponte de identidade demo→sessão corporativa (diretório de perfis derivado do seed operacional; alinha id/e-mail/escopo) | `src/data/demoDirectory.ts` (novo) |
| 2 | `resolveOperationalUser` — resolução pura e testável da sessão → `User` operacional | `src/data/demoDirectory.ts` |
| 3 | `AppContext`: `currentUser` derivado da **sessão autenticada**; `logout` delega ao `AuthController`; remoção do login/atalho demonstrativo | `src/context/AppContext.tsx` |
| 4 | `AppNavigator`: navegação bloqueada sem sessão (`initializing`/`anônimo`/`autenticado`) + estado **"perfil sem vínculo"** (§7) | `src/navigation/AppNavigator.tsx` |
| 5 | `LoginScreen`: e-mail+senha reais, estados `busy`/erro, **recuperação de senha**; atalhos demo **estritamente** gated ao modo demo, com banner | `src/screens/LoginScreen.tsx` |
| 6 | 4º perfil **Administrador** no modelo/seed; `roleLabel` completo | `src/types`, `src/data/mock.ts`, `src/utils/format.ts` |
| 7 | `authFactory` aceita diretório demo injetado (não-quebra os testes existentes) | `src/services/auth/authFactory.ts` |
| 8 | `AuthProvider` injeta o diretório operacional e expõe `requestPasswordReset` | `src/context/AuthProvider.tsx` |
| 9 | 12 testes novos da ponte de identidade e do escopo derivado | `src/data/demoDirectory.test.ts` (novo) |

**Efeito:** ao entrar como `coordenador@aace.app`, a UI recebe uma **sessão corporativa**
cujo `session.user.id === 'U02'`; o escopo das telas passa a derivar dessa identidade.
Em produção, o `SupabaseAuthRepository` ocupa exatamente o mesmo ponto.

---

## 3. Evidência de funcionamento (runtime, não só testes)

Build web servido estaticamente (`dist/`) e dirigido no navegador. Verificação pela
árvore de acessibilidade do app **de produção** (web export):

1. **Boot / Login** — renderiza a nova tela: banner "Ambiente de demonstração", campos
   E-mail+Senha, "Esqueci minha senha", 4 perfis (incl. **Administrador**), aviso
   "sessão corporativa emulada, sem senha embutida".
2. **Login como GC** (`gerente@aace.app` → U03) → Dashboard "Olá, Gerente" (Curitiba),
   exibindo **apenas** Parceiro Alpha + Beta (as duas operações onde `managerId === U03`);
   **aba Validações ausente** (GC não valida).
3. **Perfil** reflete a identidade autenticada (`gerente@aace.app`, "Demonstração local").
4. **Logout** → limpa a sessão e retorna ao Login (gate `anônimo`).
5. **Login como Coordenação** (`coordenador@aace.app` → U02) → "Olá, Coordenação"
   (PR Capital), agora **três** operações (Gama, Beta, Alpha, `coordinatorId === U02`) —
   conjunto **diferente** do GC; **aba Validações aparece** (coordenador valida).
6. **Operações** renderiza a lista com busca e filtros de semáforo (3 operações).

Isto comprova em runtime: **login funcional**, **quatro perfis**, **escopo aplicado** e
**isolamento real entre usuários** (§25 nº 1, 2, 3, 19), além de navegação por papel.

---

## 4. Tabela de módulos

| Módulo | UI real | Persistência real | Escopo real | Teste real | Pronto |
| ------ | ------: | ----------------: | ----------: | ---------: | -----: |
| Autenticação (login/logout/sessão/recuperação) | ✅ | ⚠️ demo em memória · Supabase pronto p/ plugar | ✅ | ✅ unit + runtime | ⚠️ parcial (senha validada só no Supabase) |
| Operações (lista/escopo/busca/filtro) | ✅ | ⚠️ AsyncStorage local | ✅ (por identidade) | ⚠️ domínio + runtime | 🟡 local |
| Visita / Auditoria (rascunho→envio→devolução→aprovação) | ✅ | ⚠️ local | ✅ | ⚠️ domínio (workflow/submissão) sim; integração de tela não | 🟡 local |
| Evidências | ⚠️ picker | ❌ URI local (não é Storage) | ✅ | ⚠️ domínio | ❌ |
| Planos de ação (item vermelho obrigatório) | ✅ | ⚠️ local | ✅ | ✅ domínio (submissão) | 🟡 local |
| Validações (aprovar/devolver, sem autoaprovação) | ✅ | ⚠️ local | ✅ (`canValidate`) | ✅ domínio (authz) | 🟡 local |
| Dashboard (números do estado real) | ✅ | ⚠️ local | ✅ | ⚠️ | 🟡 local |
| Agenda | ✅ | ⚠️ local | ✅ | ⚠️ | 🟡 local |
| Administração (Usuários/Indicadores) | ❌ | ❌ | — | domínio (lifecycle) sim | ❌ |
| Offline / Sincronização | ❌ UI | ⚠️ outbox testada, não ligada à UI | — | ✅ domínio | ❌ |

Legenda: ✅ pronto · ⚠️ parcial/local · 🟡 funcional só localmente · ❌ pendente.

## 5. Tabela de telas

| Tela | Mock removido | Backend conectado | Testada | Observação |
| ---- | ------------: | ----------------: | ------: | ---------- |
| LoginScreen | ✅ (usa `useAuth`) | ✅ `AuthController` (Supabase-ready) | ✅ runtime + unit | senha real só com Supabase |
| AppNavigator | ✅ (gate por sessão) | ✅ sessão corporativa | ✅ runtime | + estado "perfil sem vínculo" |
| ProfileScreen | ⚠️ (identidade da sessão; logout via auth) | ⚠️ | ✅ runtime | dados operacionais ainda locais |
| DashboardScreen | ❌ (AppContext local) | ❌ | ✅ runtime (identidade real) | escopo por identidade real |
| OperationsScreen | ❌ (AppContext local) | ❌ | ✅ runtime | escopo por identidade real |
| OperationDetailScreen | ❌ | ❌ | — | — |
| EvaluationScreen | ❌ | ❌ | — | regras testadas no domínio |
| ValidationsScreen | ❌ | ❌ | — | `canValidate` real na navegação |
| ActionsScreen | ❌ | ❌ | — | — |
| AgendaScreen | ❌ | ❌ | — | — |
| PerformanceScreen | ❌ | ❌ | — | — |

> "Backend conectado" refere-se a um **repositório/servidor autoritativo**. As telas
> marcadas ❌ continuam lendo o `AppContext` (seed `mock.ts` + persistência `AsyncStorage`)
> — **já dirigidas pela identidade autenticada real**, mas ainda sem a camada de
> repositório e sem backend remoto.

---

## 6. Providers, repositórios, Supabase, Auth, Storage

- **Providers:** `AuthProvider` é a fonte de verdade da sessão. O `AppContext` foi
  **reduzido** (deixou de autenticar; passou a consumir a sessão). A decomposição em
  `OperationsProvider`/`VisitsProvider`/… (§6) **ainda não foi feita** — é o próximo passo.
- **Repositórios operacionais:** ainda são **contratos** (`domain/repositories`), sem
  implementação `supabase-js` nem implementação local que as telas consumam. Pendente.
- **Supabase / Auth / Storage:** **não exercitados** (sem credenciais/Docker). O caminho
  de código existe e está testado por unidade; runtime remoto bloqueado.

---

## 7. Testes / build

- `typecheck` (tsc --noEmit): **limpo**.
- `vitest run`: **214 testes** (202 anteriores + 12 novos), todos verdes — inclui as
  integrações PGlite de RLS/triggers/schema.
- `expo export --platform web`: **OK** (bundle gerado em `dist/`).
- **Runtime**: fluxo de autenticação verificado no navegador (§3). Sem segredo no repo
  (só `.env.example`; guardas `assertNoPrivilegedSecrets` + `no-demo-secret.test`).
- **E2E Playwright**: não adicionado nesta sessão (o E2E completo depende do backend;
  as regras críticas estão cobertas no domínio: `submission`, `stateMachine`, `validation`).

---

## 8. Pendências (ordem recomendada para as próximas sessões)

1. **Camada de repositório consumível pelas telas** — implementar `LocalOperationsRepository`
   (AsyncStorage, mesma interface do contrato) e migrar `OperationsScreen`/`DashboardScreen`
   para consumi-lo; depois `SupabaseOperationsRepository` (plug-in, sem mudar UI).
2. **Decomposição do AppContext** em providers corporativos (§6).
3. **Telas administrativas** (Usuários + Indicadores versionados) — usar `domain/indicators/lifecycle`
   (já testado) e `canManageUsers`/`canManageIndicators`.
4. **Ligar a outbox à UI** (estados salvo/sincronizando/erro/conflito) — domínio pronto.
5. **Evidências**: adapter local com a interface de Storage; remoto só com Supabase.
6. **E2E web** (Playwright) sobre o fluxo crítico.
7. **Provisionar Supabase** (homologação) → Auth/Storage/RLS em runtime → preview Vercel.

## 9. Riscos e decisões

- **Risco:** telas operacionais ainda em `AppContext`/`AsyncStorage` — dados são reais e
  persistidos **localmente**, porém não isolados por RLS de servidor. Mitigação: RLS já
  existe e é testada; falta plugar os repositórios Supabase.
- **Decisão corporativa mantida:** modo demo é **impossível em produção** (`resolveFeatureFlags`
  + `authFactory`), sem senha embutida (T30), sem `service_role` no cliente (T03).
- **Decisão:** o diretório demo é derivado do seed operacional para alinhar identidade e
  escopo; em produção os mesmos ids/e-mails podem ser reaproveitados no provisionamento.

---

## 10. Veredito

> **APLICATIVO FUNCIONAL LOCALMENTE, COM AUTENTICAÇÃO CORPORATIVA REAL JÁ LIGADA À
> INTERFACE — MAS AINDA NÃO PRONTO PARA HOMOLOGAÇÃO.**

Justificativa objetiva (contra os critérios do §25): estão **verdadeiros** login funcional,
quatro perfis, escopo aplicado, isolamento real, build e ausência de segredo. **Ainda
faltam**: telas fora do `AppContext`/mock como fonte (repositórios), administração,
indicador versionado na UI, offline/sync na UI, evidências em Storage real, e todo o
runtime remoto (Auth/Storage/E2E/preview) — este último **bloqueado neste ambiente** por
falta de Docker/Supabase/credenciais.

**Próximo arquivo/fluxo exato:** criar `src/data/repositories/LocalOperationsRepository.ts`
(implementando `VisitsRepository.listVisibleOperations` + leitura de operações sobre o
mesmo estado persistido) e migrar `src/screens/OperationsScreen.tsx` para consumi-lo via
um `OperationsProvider`, mantendo o `SupabaseOperationsRepository` como alvo de plug-in.
