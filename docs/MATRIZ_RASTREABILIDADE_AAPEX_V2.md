# Matriz de Rastreabilidade — AAPEX / AACE V2.0

> Rastreia cada requisito do Masterplan até implementação, teste e evidência.
> Atualizada a cada fase. Fonte normativa: [`masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md`](masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md).

## Legenda de classificação

| Classificação | Significado |
| --- | --- |
| **Aprovado** | Decisão confirmada (D-01..D-08) ou requisito direto do Masterplan sem pendência |
| **Hipótese de implementação** | Solução técnica proposta para atender o requisito, sujeita a ajuste |
| **Recomendação técnica** | Sugerido pelo Masterplan como recomendação, não decisão fechada |
| **Decisão corporativa pendente** | Depende de aprovação registrada em `DECISOES_PENDENTES_AAPEX_V2.md` (P01–P15) |
| **Fora do escopo do piloto** | Escopo diferido (Masterplan §3.2) |
| **Bloqueado por dependência externa** | Requer credencial, contrato ou dado que a equipe técnica não possui |

## Legenda de status

`CONCLUÍDO` · `CONCLUÍDO COM RESSALVA` · `BLOQUEADO POR DEPENDÊNCIA EXTERNA` · `DECISÃO CORPORATIVA PENDENTE` · `FORA DO ESCOPO DO PILOTO` · `NÃO CONCLUÍDO` · `EM ANDAMENTO`

---

## A. Fundação, arquitetura e ambiente

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-F-01 | Congelar baseline do código antes de refatorar | §24.2 | Alta | Repo | Branch `aapex-v2-implantacao-corporativa` a partir de `3051ef3` | — | CONCLUÍDO | git log; commit docs inicial |
| REQ-F-02 | Incorporar Masterplan + auditoria ao repositório com hashes | Ordem CLAUDE.md §4 | Alta | docs | `docs/masterplan/`, `docs/auditorias/` + SHA-256 no README | — | CONCLUÍDO | `docs/masterplan/README.md` |
| REQ-F-03 | Configuração tipada de ambiente com validação | §10.3 Entrega | Alta | `src/config` | `src/config/env.ts` + `.env.example` | `env.test.ts` | CONCLUÍDO | — |
| REQ-F-04 | Cliente Supabase centralizado, sem service role no bundle | §10.2 [R8]; §13.3 | Crítica | `src/services` | `src/services/supabase/client.ts` (anon apenas) | `supabase-client.test.ts` (guarda anti-service-role) | CONCLUÍDO | T03 |
| REQ-F-05 | Tratamento de erros padronizado (domínio) | §12; §16.2 | Alta | `src/domain/errors` | `AppError`, `Result<T>` | `result.test.ts` | CONCLUÍDO | — |
| REQ-F-06 | Contratos de repositório (strangler) desacoplando UI de dados | §9.3 | Alta | `src/domain/repositories` | Interfaces `AuthRepository`, `VisitsRepository`, `IndicatorsRepository`, `ActionsRepository`, `SyncService` | — | CONCLUÍDO | — |
| REQ-F-07 | Feature flags para ambiente demo vs corporativo | §9.3 | Média | `src/config` | `src/config/featureFlags.ts` | `featureFlags.test.ts` | CONCLUÍDO | — |
| REQ-F-08 | Arquitetura Expo + Supabase + Vercel | §10; D-08 | Alta | Global | Estrutura + migrations + client | build web | CONCLUÍDO COM RESSALVA | Provedor pende P09 |
| REQ-F-09 | Não atualizar SDK Expo sem justificativa (manter 57) | §18.4 [R11] | Alta | package.json | Mantido `expo ~57.0.4` | typecheck | CONCLUÍDO | package.json |

## B. Modelo de dados e integridade histórica

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-D-01 | Todas as entidades do Anexo (organizations..sync_operations) | §11.2 | Crítica | `supabase/migrations` | `0001_core_schema.sql` | `db/migrations.test.ts` (estático) + **`db/schema.integration.test.ts` (Postgres real/PGlite)** | CONCLUÍDO | 28 tabelas criadas e interrogadas em banco real; `db reset` idempotente |
| REQ-D-02 | UUIDs, timestamps UTC, created_by/updated_by | §11.1 | Alta | migrations | Colunas padrão em todas as tabelas | migration test | CONCLUÍDO | — |
| REQ-D-03 | Versionamento de indicadores (definition + versions + measurement→version_id) | §8.1; §11.3 | Crítica | migrations + domínio | `indicator_definitions`, `indicator_versions`, `measurements` | `indicators.test.ts` | CONCLUÍDO | T05 |
| REQ-D-04 | Inativar indicador usado sem delete físico | §8.1; D-05; Anexo B | Crítica | migrations + domínio | Trigger de bloqueio de delete; estado `active/inactive` | `indicator-lifecycle.test.ts` | CONCLUÍDO | T05 |
| REQ-D-05 | Template versionado imutável após uso | §6.1; §11.4 | Crítica | migrations | `audit_templates`, `audit_template_versions`, `audit_items` | `template-version.test.ts` | CONCLUÍDO | T06 |
| REQ-D-06 | Snapshots oficiais não recalculados retroativamente | §11.4 | Crítica | migrations + domínio | `official_snapshots` (append) | `snapshot.test.ts` | CONCLUÍDO | T07 |
| REQ-D-07 | Evidências: metadados + hash + bucket privado; sem sobrescrita | §11.5 | Crítica | migrations + storage | `evidence_files` (sha256, retention_until) | `evidence.test.ts` | CONCLUÍDO COM RESSALVA | Bucket real pende P09 |
| REQ-D-08 | idempotency_key e row_version | §11.1; §12.3 | Alta | migrations | `sync_operations.idempotency_key`, `row_version` nas tabelas mutáveis | `sync.test.ts` | CONCLUÍDO | T08, T24 |
| REQ-D-09 | Seeds identificáveis e revisáveis (24 temas, 12 indicadores) | §3.3; §9.4 | Alta | `supabase/seed` | `0002_seed_catalog.sql` a partir dos catálogos | — | CONCLUÍDO COM RESSALVA | Conteúdo pende P05 |
| REQ-D-10 | Constraints, índices e uniqueness | §11.1 | Alta | migrations | PK/FK/unique/index | migration test | CONCLUÍDO | — |

## C. Autenticação, RBAC e RLS

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-A-01 | Remover senha demo `Aace@2026` e perfis demonstrativos do bundle | §7.1; §9.2; T30 | Crítica | `src/data`, Login | Remoção de `demoPassword`; login sem atalhos | `no-demo-secret.test.ts` | CONCLUÍDO | T30 |
| REQ-A-02 | Login individual (Supabase Auth) | §7.1; D-03 | Crítica | `src/services/auth` | `SupabaseAuthRepository` + `AuthController` + `authFactory` + `AuthProvider` (UI) | `AuthController.test.ts`, `authFactory.test.ts`, `db/auth-session.integration.test.ts` | CONCLUÍDO COM RESSALVA | Orquestração conectada à UI e testada; login runtime contra GoTrue pende DEP-01 |
| REQ-A-03 | Sessão, logout, sessão expirada, reset de senha | §7.1; T10 | Alta | auth + UI | `AuthController` (restore/logout/expiração) + `AuthProvider` | `AuthController.test.ts` (restauração e expiração reais) | CONCLUÍDO COM RESSALVA | Reset de senha real e persistência de sessão dependem do GoTrue (DEP-01) |
| REQ-A-04 | 4 perfis: admin, regional, coordenador, GC | §5; D-03/D-04 | Crítica | domínio | enum `roles`, `user_scopes` | `rbac.test.ts` | CONCLUÍDO | — |
| REQ-A-05 | RBAC + escopo (o que × sobre quais dados) | §5.1 | Crítica | domínio | `src/domain/authz/policy.ts` | `authz-matrix.test.ts` | CONCLUÍDO | Anexo B |
| REQ-A-06 | RLS deny-by-default em todas as tabelas expostas | §5.1; §13.3 | Crítica | migrations | `0002_rls_policies.sql` | **`db/rls.integration.test.ts` (Postgres real, `SET ROLE authenticated` + JWT)** | CONCLUÍDO | 28 tabelas com RLS forçada; isolamento positivo/negativo por perfil testado no banco; paridade Supabase gerenciado pende DEP-03 |
| REQ-A-07 | GC não acessa operação de outra carteira (positivo/negativo) | §8 CLAUDE; T01 | Crítica | RLS + policy | Policy por `user_scopes` | `authz-isolation.test.ts` | CONCLUÍDO | T01 |
| REQ-A-08 | Ninguém aprova a própria submissão | §5.3; T02 | Crítica | domínio + RLS | Regra em `validation.ts` + constraint | `validation-self-approve.test.ts` | CONCLUÍDO | T02 |
| REQ-A-09 | MFA para Admin/Regional/Coordenador | §13.3 [R10] | Alta | auth | Documentado; ativação server-side | — | DECISÃO CORPORATIVA PENDENTE | P10 |
| REQ-A-10 | Funções privilegiadas server-side (criar usuário) | §5.2; §10.3; Anexo B | Alta | edge/rpc | Especificado em runbook | — | BLOQUEADO POR DEPENDÊNCIA EXTERNA | Requer projeto Supabase |

## D. Modelo operacional e calendário

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-O-01 | Regra configurável: visita terça, auditoria 1ª segunda | §6.1; §7.3 | Alta | `src/domain/calendar` | `calendar.ts` (funções puras) | `calendar.test.ts` | CONCLUÍDO | T12 |
| REQ-O-02 | Exceções: feriado/reprogramação/cancelamento justificado | §6.2 | Alta | calendar | Estados + motivo | `calendar-exceptions.test.ts` | CONCLUÍDO | T12 |
| REQ-O-03 | Máquina de estados de visita/avaliação/plano | §6.3 | Alta | `src/domain/workflow` | `stateMachine.ts` | `state-machine.test.ts` | CONCLUÍDO | — |
| REQ-O-04 | Datas nunca hardcoded | §7.3; §9.2 | Alta | domínio | Derivadas de regras/relógio injetável | `calendar.test.ts` | CONCLUÍDO | — |
| REQ-O-05 | Regra exata de terça e rodízio | §6.1 | Alta | calendar | Parametrizável | — | DECISÃO CORPORATIVA PENDENTE | P06 |

## E. Auditoria, pontuação e evidências

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-E-01 | Pontuação ponderada determinística e versionada | §8.3 | Crítica | `src/domain/scoring` | `scoreEvaluation.ts` puro | `scoring.test.ts` | CONCLUÍDO | T15 |
| REQ-E-02 | Servidor recalcula; divergência bloqueia aprovação | §7.4; §8.3; T15 | Crítica | domínio + RPC | Contrato `recomputeScore` | `score-divergence.test.ts` | CONCLUÍDO COM RESSALVA | RPC real pende backend |
| REQ-E-03 | Envio exige completude total dos obrigatórios | §7.4; T14 | Alta | domínio | `canSubmit()` | `submit-rules.test.ts` | CONCLUÍDO | T14 |
| REQ-E-04 | Item vermelho exige plano de ação | §6.1; T13 | Alta | domínio | `canSubmit()` | `submit-rules.test.ts` | CONCLUÍDO | T13 |
| REQ-E-05 | Evidência obrigatória por tema conforme regra | §7.4; T14 | Alta | domínio | `canSubmit()` | `submit-rules.test.ts` | CONCLUÍDO | T14 |
| REQ-E-06 | Evidência: validação de MIME/tamanho; URL assinada curta | §11.5; §13.3; T04/T23 | Alta | storage + domínio | `evidencePolicy.ts` | `evidence-policy.test.ts` | CONCLUÍDO COM RESSALVA | Storage real pende |
| REQ-E-07 | Histórico imutável após fechamento; adendo | §11.4; T07 | Crítica | domínio + RLS | `addendum.ts` | `immutability.test.ts` | CONCLUÍDO | T07 |

## F. Indicadores, validação e planos

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-I-01 | Meta × realizado, semáforo, atingimento (funções puras) | §7.5 | Alta | `src/domain/indicators` | `indicatorStatus.ts` | `indicators.test.ts` | CONCLUÍDO | — |
| REQ-I-02 | Somente Administrador cadastra/edita/ativa/inativa indicador | D-05; §8.1 | Crítica | policy + RLS | Policy admin-only | `authz-matrix.test.ts` | CONCLUÍDO | Anexo B |
| REQ-I-03 | Fila de validação: aprovar/devolver com motivo estruturado | §7.8 | Alta | domínio | `validation.ts` | `validation.test.ts` | CONCLUÍDO | — |
| REQ-I-04 | Proibir aprovação em lote no piloto | §7.8; R24 | Média | domínio | Bloqueio explícito | `validation.test.ts` | CONCLUÍDO | — |
| REQ-I-05 | Planos: origem, critério de conclusão, reabertura preserva histórico | §7.7 | Alta | domínio | `actionPlan.ts` | `action-plan.test.ts` | CONCLUÍDO | — |

## G. Offline e sincronização

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-S-01 | Outbox persistente com idempotency_key | §12.3 | Alta | `src/domain/sync` | `outbox.ts` | `outbox.test.ts` | CONCLUÍDO | T08, T24 |
| REQ-S-02 | Retry com backoff; processa uma vez | §12.3 | Alta | sync | `backoff.ts`, `syncEngine.ts` | `sync-engine.test.ts` | CONCLUÍDO | T09 |
| REQ-S-03 | Regras de conflito (row_version, bloqueio, revisão) | §12.4 | Alta | sync | `conflict.ts` | `conflict.test.ts` | CONCLUÍDO | T11, T23 |
| REQ-S-04 | Detecção de conectividade e estado visual | §12.1; §16.2 | Média | sync + UI | `connectivity.ts` | `connectivity.test.ts` | CONCLUÍDO | — |
| REQ-S-05 | Preservar trabalho após fechamento do app | §12.6; T22 | Alta | sync | Persistência do outbox | `outbox-persistence.test.ts` | CONCLUÍDO | T22 |

## H. Segurança, LGPD e auditoria

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-SEC-01 | Nenhum segredo no frontend/repo/logs | §13.3; §21.2; T03 | Crítica | Global | `.env` git-ignored; guarda anti-service-role | `no-demo-secret.test.ts` | CONCLUÍDO | T03, T30 |
| REQ-SEC-02 | Trilha de auditoria append-only | §15.1; §11.2 | Alta | migrations | `audit_logs` + trigger | **`db/triggers.integration.test.ts` (UPDATE/DELETE bloqueados no banco real)** | CONCLUÍDO | Append-only e snapshots imutáveis validados em Postgres real (T25) |
| REQ-SEC-03 | Modelo de ameaças resumido | §13; CLAUDE §15 | Alta | docs | `docs/SEGURANCA_E_LGPD_AAPEX_V2.md` | — | CONCLUÍDO | — |
| REQ-SEC-04 | Política de retenção parametrizável | §14.4 | Alta | docs + migrations | Documentada; campos `retention_until` | — | DECISÃO CORPORATIVA PENDENTE | P08 |
| REQ-SEC-05 | Base legal e aviso de privacidade | §14.1; §14.3 | Alta | docs | Placeholder documentado | — | BLOQUEADO POR DEPENDÊNCIA EXTERNA | P07 (DPO/Jurídico) |
| REQ-SEC-06 | Backups e restauração testados | §17.5; §19; T19 | Alta | runbook | Procedimento documentado | — | BLOQUEADO POR DEPENDÊNCIA EXTERNA | Requer projeto Supabase |

## I. UX, dashboard, agenda, relatórios, boas práticas

| ID | Requisito | Origem | Prioridade | Módulo | Implementação | Teste | Status | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| REQ-UX-01 | Preservar identidade visual e componentes úteis | §9.1; §16 | Alta | `src/components` | Reaproveitados | build web | CONCLUÍDO | — |
| REQ-UX-02 | Dashboard separa rascunho de oficial; período/universo | §7.2; §15.3 | Alta | telas | Refino sobre dados de repositório | — | EM ANDAMENTO | — |
| REQ-UX-03 | Agenda hoje/7/30 derivada de regras | §7.3 | Alta | domínio + tela | `agenda.ts` derivado de calendar | `agenda.test.ts` | CONCLUÍDO | — |
| REQ-UX-04 | Semáforo com texto (não só cor) | §16.2; T21 | Média | UI | `StatusPill` já com rótulo | — | CONCLUÍDO | T21 |
| REQ-UX-05 | Ranking individual público proibido no piloto | §4; §8.5; D; T28 | Crítica | policy + UI | Ausência de ranking nominal; agregação | `ranking-ethics.test.ts` | CONCLUÍDO | T28 |
| REQ-UX-06 | Boas práticas com moderação; sem dados pessoais | §7.9; T27 | Média | domínio | `bestPractice.ts` | `best-practice.test.ts` | CONCLUÍDO | T27 |
| REQ-UX-07 | Exportação com autor/período/escopo/finalidade | §7.10; §5.3; T16 | Média | domínio | `exportGuard.ts` | `export-guard.test.ts` | CONCLUÍDO | T16 |
| REQ-UX-08 | Versão do app não hardcoded divergente do build | Auditoria §3.2; T29 | Baixa | config | Lê de `app.json`/env | `version.test.ts` | CONCLUÍDO | T29 |

## J. Escopo diferido (fora do piloto)

| ID | Requisito | Origem | Status |
| --- | --- | --- | --- |
| REQ-OUT-01 | Login de parceiros/operações (5º perfil) | §3.2; D-06 | FORA DO ESCOPO DO PILOTO |
| REQ-OUT-02 | Integração CRM/RH/BI | §3.2 | FORA DO ESCOPO DO PILOTO |
| REQ-OUT-03 | IA preditiva | §3.2; §8.6 | FORA DO ESCOPO DO PILOTO |
| REQ-OUT-04 | Ranking individual público | §3.2; §8.5 | FORA DO ESCOPO DO PILOTO |
| REQ-OUT-05 | Geolocalização contínua / áudio / vídeo | §3.2 | FORA DO ESCOPO DO PILOTO |
| REQ-OUT-06 | Migração massiva de dados legados | §3.2; §9.4 | FORA DO ESCOPO DO PILOTO |

---

## Resumo por status

Atualizado ao final de cada fase — ver [`IMPLEMENTATION_STATUS_AAPEX_V2.md`](IMPLEMENTATION_STATUS_AAPEX_V2.md) para o diário executivo.

---

## Atualização 2026-07-23 — Rastreabilidade da integração funcional

Requisitos operacionais do Masterplan agora atendidos **na interface** por
repositórios (não só no domínio):

| Requisito | Implementação (UI → repositório → persistência) | Teste | Estado |
| --------- | ------------------------------------------------ | ----- | ------ |
| §5.1 Escopo por perfil | `OperationsRepository.isOperationVisible` + providers | LocalOperationsRepository.test | CONCLUÍDO LOCALMENTE |
| §7.4 Trava de envio | `LocalEvaluationsRepository.submit` → `canSubmit` | LocalEvaluationsRepository.test | CONCLUÍDO LOCALMENTE |
| §14 / T02 Anti-autoaprovação | `LocalValidationsRepository.validate` | ValidationsRepository.test | CONCLUÍDO LOCALMENTE |
| §8.1 / T05 Indicador versionado | `AdminIndicatorsRepository` + `assertCanPhysicallyDelete` | AdminRepository.test | CONCLUÍDO LOCALMENTE |
| §12 Evidências | `EvidenceRepository` (Local URI/status; Supabase bucket) | EvidenceRepository.test | Local: CONCLUÍDO; Storage remoto: BLOQUEADO |
| §15 Dashboard real | `computeDashboardMetrics` via repositório | metrics.test | CONCLUÍDO LOCALMENTE |
| §17 Offline/reabrir/sem dup | `localStore` + idempotência de ciclo | offlineReopen.test | CONCLUÍDO LOCALMENTE |

Ver relatório completo: [`RELATORIO_FECHAMENTO_APLICATIVO_AAPEX_V2.md`](RELATORIO_FECHAMENTO_APLICATIVO_AAPEX_V2.md).
