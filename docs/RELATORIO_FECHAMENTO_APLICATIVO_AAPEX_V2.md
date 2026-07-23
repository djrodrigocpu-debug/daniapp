# Relatório de Fechamento Funcional — AAPEX / AACE Excelência V2

**Branch:** `aapex-v2-implantacao-corporativa`
**Data:** 2026-07-23
**Objeto:** eliminação do `AppContext`/`mock.ts` como fonte das telas e migração de
todos os fluxos operacionais para uma camada de repositórios, com autenticação
corporativa real e verificação **em runtime** por perfil.

> **Aviso de honestidade (obrigatório).** Este ambiente de desenvolvimento **não
> possui Docker, Supabase CLI, `psql` nem credenciais** (só `.env.example`). Logo,
> Auth/Storage/PostgREST **não são exercitados em runtime aqui**, e não há preview
> Vercel. A base é validada com **PGlite** (PostgreSQL real em WASM). As
> classificações abaixo seguem: **CONCLUÍDO** (real remoto exercitado),
> **CONCLUÍDO LOCALMENTE** (persistência local executável), **BLOQUEADO PARA
> AMBIENTE REMOTO** (pronto, depende de Supabase), **NÃO CONCLUÍDO**.

---

## 1. Resumo executivo

Partindo de `1b2f94e` (login fictício, telas sobre `AppContext`/`mock`), a branch
agora tem **todas as telas operacionais servidas por repositórios** com persistência
local real e a **autenticação corporativa real ligada à interface**. O `AppContext`
(a última ponte demonstrativa) foi **removido**. Nenhuma tela de produção importa
`useApp` ou `mock.ts`.

**Métrica de remoção do legado (verificada):**

| Métrica | Antes | Agora |
| ------- | ----: | ----: |
| `useApp()` em `src/screens`/`src/components` | 9 | **0** |
| Imports de `mock.ts` em telas | vários | **0** |
| `AppContext` como banco | sim | **removido** |
| Testes | 202 | **263** |

`mock.ts` sobrevive apenas como **seed de desenvolvimento** em `localStore` e
`demoDirectory` (nunca importado por telas). Modo demo é impossível em produção
(`resolveFeatureFlags` + `authFactory`), sem senha embutida (T30) e sem
`service_role` no cliente (T03).

---

## 2. Arquitetura entregue

**Store** — `src/data/store/localStore.ts`: fonte única persistente (AsyncStorage),
`useSyncExternalStore`. Seed de dev na primeira hidratação.

**Repositórios** (contrato + `Local` REAL LOCAL + `Supabase` REAL REMOTO pronto):
Operations, Evaluations, Actions, Validations, Admin (Users + Indicators),
Performance, Evidence. Seleção por ambiente em `RepositoryProvider`.

**Providers/hooks de tela** (consomem repositórios, nunca o store como banco na UI):
`AuthProvider`, `RepositoryProvider`, `SyncProvider`, `OperationsProvider`
(`useOperations`/`useDashboard`), `EvaluationsProvider`, `ActionsProvider`,
`ValidationsProvider`, `AdminProvider`, `usePerformance`, `useOperationalUser`.

**Regras de negócio reusadas do domínio testado:** `canSubmit` (§7.4),
`calculateScore`, `assertCanPhysicallyDelete` (T05), `subjectFromSession`/authz,
`enqueue` outbox (idempotência §12.3).

---

## 3. Verificação em runtime (build web servido, por perfil)

1. **Autenticação real** — login por AuthController; GC vê 2 operações do seu escopo
   (sem aba Validações), Coordenador vê 3 + aba Validações, Admin vê 6 + aba Admin;
   logout limpa a sessão. Isolamento real entre perfis.
2. **Dashboard** — índice médio 73/75 calculado pelo repositório sobre o escopo
   (não constante); próximas auditorias ordenadas.
3. **Auditoria** — abrir operação → iniciar auditoria (ciclo real "Semana de
   22/07/2026") → classificar item → conclusão 0%→6%, nota 0→7 (persistido, nota
   recalculada pelo domínio).
4. **Validação** — Coordenador aprova E01/Beta; fila e métrica do dashboard vão de
   1→0 (reatividade entre providers via store compartilhado).
5. **Administração** — aba Admin só para admin; criar indicador IND-099 → aparece na
   lista e **persiste** (localStorage: IND-012, IND-045, IND-099).
6. **Offline** — Perfil exibe "Salvo neste dispositivo"; teste automatizado: editar
   offline → reabrir → rascunho preservado → sem duplicidade.

---

## 4. Tabela de telas

| Tela | Mock removido | Repository | Persistência | Runtime testado | Estado |
| ---- | ------------: | ---------- | ------------ | --------------: | ------ |
| LoginScreen | ✅ | AuthController | sessão | ✅ | CONCLUÍDO LOCALMENTE |
| DashboardScreen | ✅ | Operations | local | ✅ | CONCLUÍDO LOCALMENTE |
| OperationsScreen | ✅ | Operations | local | ✅ | CONCLUÍDO LOCALMENTE |
| OperationDetailScreen | ✅ | Evaluations | local | ✅ | CONCLUÍDO LOCALMENTE |
| EvaluationScreen | ✅ | Evaluations + Evidence | local | ✅ | CONCLUÍDO LOCALMENTE |
| ActionsScreen | ✅ | Actions | local | ✅ | CONCLUÍDO LOCALMENTE |
| ValidationsScreen | ✅ | Validations | local | ✅ | CONCLUÍDO LOCALMENTE |
| AgendaScreen | ✅ | Operations + Actions | local | ✅ | CONCLUÍDO LOCALMENTE |
| AdminScreen | ✅ | AdminUsers + AdminIndicators | local | ✅ | CONCLUÍDO LOCALMENTE |
| PerformanceScreen | ✅ | Performance + Evaluations | local | parcial | CONCLUÍDO LOCALMENTE |
| ProfileScreen | ✅ | Auth + Operations + Sync | sessão/local | ✅ | CONCLUÍDO LOCALMENTE |

## 5. Tabela de módulos

| Módulo | UI | Local real | Supabase adapter | Supabase remoto testado | Pronto |
| ------ | -: | ---------: | ---------------: | ----------------------: | ------ |
| Autenticação/Sessão | ✅ | ✅ (demo dir.) | ✅ | ❌ | CONCLUÍDO LOCALMENTE |
| Operações + Dashboard | ✅ | ✅ | ✅ (view `ui_operations`) | ❌ | CONCLUÍDO LOCALMENTE |
| Visitas/Auditorias | ✅ | ✅ | ✅ (RPCs) | ❌ | CONCLUÍDO LOCALMENTE |
| Planos de ação | ✅ | ✅ | ✅ | ❌ | CONCLUÍDO LOCALMENTE |
| Validações | ✅ | ✅ (T02/escopo/imutável) | ✅ (RPC) | ❌ | CONCLUÍDO LOCALMENTE |
| Agenda | ✅ | ✅ | ✅ (via repos) | ❌ | CONCLUÍDO LOCALMENTE |
| Administração (usuários/indicadores) | ✅ | ✅ (T05) | ✅ (RPCs) | ❌ | CONCLUÍDO LOCALMENTE |
| Evidências | ✅ | ✅ (URI + status local) | ✅ (bucket + URL assinada) | ❌ | Storage: BLOQUEADO PARA AMBIENTE REMOTO |
| Offline/Sync | ✅ (indicador) | ✅ (persistência + reabrir) | outbox idempotente | ❌ | CONCLUÍDO LOCALMENTE (remoto: BLOQUEADO) |
| Auth/Storage remotos (GoTrue/Storage) | — | — | ✅ código | ❌ | BLOQUEADO PARA AMBIENTE REMOTO |
| Preview Vercel | — | — | — | ❌ | BLOQUEADO PARA AMBIENTE REMOTO |
| E2E Playwright | — | — | — | ❌ | NÃO CONCLUÍDO (domínio coberto por unit) |

---

## 6. Testes / build

- `typecheck`: limpo. `vitest run`: **263** testes (incl. 56 de banco PGlite:
  RLS/triggers/schema). Novos: metrics, localStore, offlineReopen, e repositórios
  Local (Operations, Evaluations, Actions/Validations, Admin, Evidence) + ponte de
  identidade.
- `expo export --platform web`: **OK** (`dist/`).
- `expo-doctor`: 2 avisos **pré-existentes** e não relacionados a esta entrega —
  schema de `app.json` (`newArchEnabled`/`splash`) e drift de versão de 3 pacotes
  (`react-native-screens`, `expo`, `expo-image-picker`). Não afetam o build web.
- Segurança: sem segredo no repo (só `.env.example`); guardas `assertNoPrivilegedSecrets`
  + `no-demo-secret.test`.

---

## 7. Pendências (para o ambiente remoto)

1. **Provisionar Supabase** (homologação): aplicar migrations, criar as projeções de
   leitura `ui_*` e os RPCs referenciados pelos adapters Supabase; validar RLS em
   runtime; então trocar `RepositoryProvider` para `source: 'supabase'` (sem mudar UI).
2. **Storage real** de evidências (bucket privado + URL assinada) — código pronto.
3. **E2E web (Playwright)** sobre o fluxo crítico com backend.
4. **Preview Vercel** com variáveis de homologação.
5. Higiene opcional: alinhar `app.json`/versões apontadas pelo expo-doctor.

---

## 8. Veredito

> **APLICATIVO FUNCIONAL LOCALMENTE.** Todos os fluxos operacionais (login, escopo,
> operações, auditoria, evidência local, plano vermelho obrigatório, validação com
> anti-autoaprovação, dashboard, agenda, administração de usuários e indicadores
> versionados, offline com persistência e sem duplicidade) rodam sobre a **camada de
> repositórios com persistência local real**, verificados em runtime por perfil.
>
> **AINDA BLOQUEADO PARA HOMOLOGAÇÃO REMOTA**: Supabase Auth/Storage, RLS em runtime,
> preview e E2E completo dependem de um backend provisionado — indisponível neste
> ambiente. Os adapters Supabase estão prontos para conexão sem alteração de UI.

**Próximo passo exato:** provisionar o Supabase de homologação, criar as views `ui_*`
e RPCs esperados pelos adapters (`src/data/repositories/Supabase*Repository.ts`),
definir `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`, e validar login + um fluxo vertical
(auditoria→validação) contra o servidor.
