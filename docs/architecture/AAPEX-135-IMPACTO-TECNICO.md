# AAPEx 1.3.5 — Impacto Técnico

**Status:** análise · **nenhum código escrito**
**Data:** 01/08/2026 · base `8ffc49a` · migrations 0001–0035 · versão 1.3.4
**Fonte canônica:** [Decisões Empresariais](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) · [Modelo Operacional](../business/AAPEX-135-MODELO-OPERACIONAL.md)

O que existe, o que é tocado, o que fica intacto.

---

## 1. Inventário atual

### 1.1 Banco

**31 tabelas** em `public`, todas com RLS **habilitada e forçada**:

```
action_plans · audit_items · audit_logs · audit_template_versions · audit_templates
best_practices · calendar_exceptions · coordinations · diagnoses
evaluation_answer_evidence · evaluation_answers · evaluations · evidence_files
evidence_upload_reservations · indicator_definitions · indicator_results
indicator_versions · measurements · official_snapshots · operation_assignments
operations · organizations · regions · sync_operations · units · user_scopes
users · validations · visit_reports · visit_rules · visits
```

**12 enums** em `app`, dos quais interessam aqui:

| Enum | Valores | Nota |
|---|---|---|
| `role_code` | admin, regional, coordinator, channel_manager | **os quatro papéis de D7 já existem** |
| `visit_type` | weekly, monthly | frequência do ciclo |
| `evaluation_status` | draft, submitted, returned, approved, superseded | |
| `action_status` | open, in_progress, blocked, done, overdue, cancelled_justified (+ `validated`, `waiting_partner`) | **todos os estados de D6 já existem** |
| `indicator_direction` | higher_better, lower_better, **target_band** | ⚠️ o terceiro não tem regra em D2 |
| `traffic_light` | green, yellow, red, not_evaluated, not_applicable | usado no checklist legado |
| `indicator_lifecycle` | draft, active, inactive | reutilizável para temas e critérios |

**9 views de projeção:** `ui_action_plans`, `ui_admin_partners`, `ui_evaluation_people`,
`ui_evaluations`, `ui_evidences`, `ui_indicators`, `ui_operation_people`, `ui_operations`,
`ui_users`.

**39 RPCs públicas** e ~52 funções internas em `app`.

### 1.2 Aplicação

**14 telas** em `src/screens/`: `ActionsScreen`, `AdminScreen`, `AgendaScreen`, `DashboardScreen`,
`EvaluationScreen`, `InitialPasswordScreen`, `LoginScreen`, `OperationDetailScreen`,
`OperationsScreen`, `PerformanceMatrixScreen`, `PerformanceScreen`, `ProfileScreen`,
`SetPasswordScreen`, `ValidationsScreen`.

`src/domain/report/officialAuditReport.ts` — `REPORT_FORMAT_VERSION = '1.3.3'` (linha 34).

### 1.3 O que a base já resolve

Não precisa ser construído:

- **versionamento de indicador** — `indicator_versions` com `version_number`, `effective_from`,
  `target`, `yellow_tolerance`, `weight`, `direction`, `unit`, `limitations`;
- **os quatro papéis** e escopo por região/coordenação/unidade (`user_scopes`, `app.has_role`,
  `app.resolve_area_scope`, `app.scoped_region_ids`, `app.scoped_coordination_ids`);
- **motor único de planos** com FKs de origem anuláveis, anti-auto-validação (`app.can_validate`),
  `overdue` derivado da data;
- **congelamento por uso** — `app.lock_template_on_use` já congela versões de template usadas;
- **guardas de exclusão com histórico** — `app.guard_indicator_delete`,
  `app.guard_indicator_version_delete` (0022);
- **trilha imutável** — `app.write_audit` + três gatilhos de proteção;
- **timezone** — `units.timezone` já tem default `America/Sao_Paulo`.

### 1.4 O que falta

| Lacuna | Consequência |
|---|---|
| **Não existe entidade de tema** | papel exercido por `audit_items.pillar` (texto), `audit_items.code` projetado como `themeId`, e `action_plans.theme_code` (texto) |
| **Indicador não tem tema** | nenhum vínculo indicador↔tema em lugar nenhum |
| **Não existem as flags de módulo** | nada distingue indicador de Gestão Assistida de indicador auditável |
| **Não existem critérios de processo** | a auditoria só tem o checklist `audit_items` |
| **Não existe ciclo semanal com semântica própria** | `evaluations` com `frequency='weekly'` faz o papel |
| **Competência vem do relógio (O-06)** | `start_evaluation` deriva `cycle_label`/`period_start`/`period_end` de `now()` (`0006:85-96`); idempotência por `(operação, frequência)` só em rascunho (`0006:72-78`) |
| **Sem ponderação configurável** | não há tabela de pesos por região |
| **Sem parâmetro de cutover** | não há onde guardar a data |

## 2. Tabelas afetadas

| Tabela | Impacto | Detalhe |
|---|---|---|
| `indicator_versions` | **estendida** | +`theme_version_id`, `orientation`, `description`, `include_in_assisted_management`, `include_in_monthly_audit` |
| `action_plans` | ✅ **estendida** (0040) | +`assisted_entry_id`, +`source`, CHECK de exclusividade, índice único parcial e gatilho de coerência de operação. **`monthly_audit_id` NÃO foi criada** — fica no residual da Fase 4, e até lá `source = 'monthly_audit'` é recusado pelo CHECK. Ver [ADR-135-002](ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md) |
| `assisted_cycles`, `assisted_cycle_entries` | ✅ **novas** (0039) | domínio próprio da Gestão Assistida. `evaluations` **não foi tocada** — é o que D1 exige |
| `evaluations` | **lida**, não alterada | recebe guarda de cutover em `start_evaluation`; nenhuma coluna nova |
| `official_snapshots` | **intacta** | imutável por gatilho; conteúdo do payload muda apenas quando o novo formato for congelado (A-05) |
| `audit_items`, `audit_templates`, `audit_template_versions` | **intactas** | servem o histórico legado; **não convertidas em critérios** |
| `evaluation_answers`, `evaluation_answer_evidence`, `evidence_files` | **intactas** | |
| `audit_logs` | **intacta** | recebe eventos dos fluxos novos pelo mesmo `app.write_audit` |
| `indicator_results` | **coexiste** | `period` é `YYYY-MM`; a Gestão Assistida é semanal e usa estrutura própria. **Não migrar** |
| **11 tabelas novas** | criadas | ver [Contratos de Dados](AAPEX-135-CONTRATOS-DE-DADOS.md) §9 |

## 3. RPCs afetadas

### 3.1 Alteradas

| RPC | Mudança | Risco |
|---|---|---|
| `start_evaluation` | guarda de cutover: recusa `weekly` **se** a data existir e tiver passado. Enquanto nula, comportamento idêntico | baixo — enquanto o cutover não for ativado, nada muda |
| `get_official_audit_report_data` | passa a ler critérios materializados quando a auditoria os tiver | **médio** — o código de integridade é determinístico e está provado 40/40. Auditorias antigas **devem continuar gerando o mesmo código**. Ver §6 |
| `save_action_plan` | aceita e valida a nova origem | baixo |

### 3.2 Novas (nomes propostos)

**Gestão Assistida:** `open_assisted_cycle(operation_id, week_start_date)` (idempotente) ·
`save_assisted_entry(...)` · `close_assisted_cycle(cycle_id)` · `get_assisted_cycle(...)`

**Catálogo:** `admin_create_theme` · `admin_add_theme_version` · `admin_deactivate_theme` ·
`admin_create_criterion` · `admin_add_criterion_version` · `admin_deactivate_criterion` ·
`admin_set_region_weighting`

**Auditoria Mensal:** `start_monthly_audit(operation_id, competence)` — com **período por
parâmetro**, fechando o O-06 · `materialize_audit_criteria(evaluation_id)`

**Dashboard/Exportação:** `get_dashboard_aggregates(filtros)` · `export_dataset(modulo, filtros)`

### 3.3 Intactas

`submit_evaluation` · `validate_evaluation` · `reserve_evidence_upload` ·
`confirm_evidence_upload` · `remove_evidence` · `update_action_status` · toda a família
`admin_*` de usuários e parceiros · `activate_self` · fluxo de senha inicial.

## 4. Views de projeção

`ui_indicators` e `ui_action_plans` ganham colunas (tema, módulo, origem). As demais ficam.
Projeções novas: `ui_assisted_cycles`, `ui_assisted_entries`, `ui_audit_criteria`.

## 5. Aplicação

| Tela | Impacto |
|---|---|
| **Nova** — Gestão Assistida (ciclo semanal) | registro por indicador, status calculado, desvio → diagnóstico e plano |
| **Nova** — Administração de temas e critérios | dentro de `AdminScreen` ou tela irmã |
| `EvaluationScreen` | passa a distinguir **Auditoria Mensal** de **histórico semanal legado**; recebe a ação **“Ver auditoria”** que fecha o O-12 |
| `OperationDetailScreen` | separa visualmente os três blocos: legado · Gestão Assistida · Auditoria Mensal |
| `DashboardScreen` | agregações server-side; **alternativa tabular acessível** para cada gráfico |
| `PerformanceMatrixScreen` | eixos renomeados: desempenho = Gestão Assistida, processo = Auditoria Mensal; estado “Ponderação não configurada” |
| `ActionsScreen` | exibe a origem do plano |
| `AdminScreen` | temas, critérios, flags de módulo, ponderação regional |
| **Nova** — Exportação | CSV/XLSX com filtros server-side |

## 6. Riscos técnicos

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| **RT-01** | Alterar `get_official_audit_report_data` **quebra o determinismo já provado** (40/40 códigos, 40 distintos) | 🔴 alta | Auditorias sem critérios materializados devem percorrer **exatamente o caminho antigo**. Teste de regressão obrigatório: recalcular os 40 códigos conhecidos e exigir igualdade |
| **RT-02** | Tabelas novas **herdam os grants amplos de `anon`** (achado O-10) | 🟡 média | `revoke` explícito na própria migration; RLS habilitada **e forçada**; teste negativo por tabela nova |
| **RT-03** | `target_band` sem regra (A-01) | 🟡 média | ✅ **MITIGADO** — `app.assisted_status_of` falha citando A-01, no banco e no espelho de domínio. A-01 **continua aberta** |
| **RT-04** | Semana ISO vs. `week_start_date` divergindo por timezone | 🟡 média | ✅ **MITIGADO** — `app.assisted_week_start(date)` é `immutable` e opera sobre dia de calendário; o fuso entra só em `app.assisted_today()`. CHECK garante segunda-feira. O relógio do cliente nunca decide a semana |
| **RT-12** | Teardown do harness desconhecer tabela nova com coluna de enum de `app` | 🟡 média | ✅ **MITIGADO nesta fase, mas RECORRENTE** — `drop schema app cascade` derruba a coluna e o `create table if not exists` não a recria. Toda migration nova com esse formato precisa entrar em `supabase/rollback/0001_core_schema.down.sql` |
| **RT-05** | Guarda de cutover ativar cedo demais | 🟡 média | Nasce com valor **nulo**; guarda só age com data preenchida **e** vencida |
| **RT-06** | Telas novas repetirem o padrão dos achados **O-12/O-13** | 🟡 média | `role="button"` + `tabindex` obrigatórios; teste de UI garantindo rota de abertura para todo item listado |
| **RT-07** | CSV injection na exportação | 🟡 média | Prefixar textos iniciados por `=` `+` `-` `@`; **sem fórmulas** no XLSX; números e datas como tipos próprios |
| **RT-08** | Exportação virar caminho de contorno da RLS | 🔴 alta | Autorização, escopo e filtros **server-side**; testes negativos de escopo cruzado por módulo exportável |
| **RT-09** | Migration destrutiva por engano | 🔴 alta | Todas aditivas; nenhum `UPDATE`/`DELETE` retroativo em `evaluations`, `official_snapshots` ou `evaluation_answers` |
| **RT-10** | Volume do dashboard | ⚪ baixa | Agregação server-side com índices por `(operation_id, week_start_date)` e `(operation_id, period)` |
| **RT-11** | **Autoridade regional sobre catálogo global** | 🔴 alta | Temas e indicadores **não têm região**. D7 dá ao Regional gestão *“dentro da própria região”* — hoje inimplementável. **Pendência A-08**, bloqueia a Fase 1 |

## 7. Não-regressão obrigatória

Contratos medidos contra o staging real na 1.3.4 que **não podem quebrar**:

- **18/18 testes negativos** recusados pelo servidor;
- **zero vazamento de escopo** nos 8 papéis;
- **40/40 códigos de integridade determinísticos**, 40 distintos, sem vazar URL/caminho/e-mail;
- **trilha imutável** (403 no delete);
- **caminho de evidência** ponta a ponta pela interface real;
- **52/52 gatilhos** habilitados;
- **RLS forçada** nas 31 tabelas;
- **anti-auto-validação** e `overdue` derivado da data.

Toda RPC nova entra na bateria de testes negativos, **incluindo o recorte regional de D7**.

## 8. Achados que este trabalho NÃO corrige

Por decisão expressa: **O-05** (584/584 sem `sha256`) · **O-14** (7 resultados no IND-008) ·
**O-15** (relatórios de visita órfãos) · `AuthModeBanner` · logout dos quatro GCs.

**O-12** é tratado **junto com a nova navegação mensal**, não isoladamente.
