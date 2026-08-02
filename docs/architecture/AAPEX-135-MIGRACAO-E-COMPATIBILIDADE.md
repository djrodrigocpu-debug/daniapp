# AAPEx 1.3.5 — Migração e Compatibilidade

**Status:** plano · **nenhuma migration escrita, nenhuma aplicada**
**Data:** 01/08/2026 · migrations atuais **0001–0035** · **próximo número livre: 0036**
**Fonte canônica:** [Decisões Empresariais](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) · [Contratos de Dados](AAPEX-135-CONTRATOS-DE-DADOS.md)

---

## 1. Regra que governa tudo

> **Toda migration é ADITIVA.**

Nenhum `UPDATE` ou `DELETE` retroativo em `evaluations`, `official_snapshots`,
`evaluation_answers`, `evaluation_answer_evidence`, `evidence_files`, `audit_items` ou `audit_logs`.

**Por quê:** D5 preserva o histórico integralmente; os snapshots são imutáveis por gatilho
(0033/0034); e o **código de integridade é determinístico sobre o conteúdo** — comprovado 40/40 na
simulação de dois meses. Reescrever qualquer coisa a montante invalidaria uma prova já obtida.

## 2. Migrations propostas

Numeração contígua a partir de **0036**. Fatiadas para que cada uma seja revisável e reversível
por si.

| # | Nome proposto | Conteúdo | Depende de |
|---|---|---|---|
| **0036** | `themes_and_versions` | `themes`, `theme_versions`, guardas de exclusão com histórico, RLS + grants restritos | — |
| **0037** | `indicator_theme_and_module_flags` | 5 colunas em `indicator_versions`; defaults `include_in_assisted_management = true`, `include_in_monthly_audit = false` | 0036 |
| **0038** | `audit_criteria_and_versions` | `audit_criteria`, `audit_criteria_versions`, guarda “não publicar indicador auditável sem critério ativo” | 0037 |
| ~~0039~~ ✅ | `assisted_management_core` | **APLICADA LOCALMENTE.** Enums, `app.assisted_week_start`, `app.assisted_today`, `app.assisted_status_of`, `app.assisted_rule_version`, `app.is_assisted_operator`, `assisted_cycles` (**unique `(operation_id, week_start_date)`** + CHECK de segunda-feira), `assisted_cycle_entries`, cinco gatilhos, RLS forçada | 0037 |
| ~~0040~~ ✅ | `action_plan_assisted_source` | **APLICADA LOCALMENTE.** `app.action_source`, `assisted_entry_id` + `source` + CHECK, índice único parcial, gatilho de coerência, `save_action_plan` estendida, `ui_action_plans` +2 colunas. **Nome e ordem diferem do proposto:** os planos precisam existir antes das RPCs, porque `close_assisted_cycle` valida contra `assisted_entry_id` | 0039 |
| ~~0041~~ ✅ | `assisted_management_rpcs` | **APLICADA LOCALMENTE.** DTOs, `open_assisted_cycle`, `save_assisted_entry`, `close_assisted_cycle`, `get_assisted_cycle`, `list_assisted_cycles`, trilha | 0040 |
| **0042** | `monthly_audit_competence` | `start_monthly_audit` com **período por parâmetro** (fecha O-06); `evaluation_criteria` + materialização; guarda de imutabilidade | 0038 |
| **0043** | `system_settings_and_cutover` | `system_settings`; semente `weekly_audit_cutover_date = null`; guarda **inerte** em `start_evaluation` | 0042 |
| **0044** | `region_weightings` | tabela com CHECK `soma = 100`; **nenhuma linha semeada** | 0036 |
| **0045** | `dashboard_and_export_rpcs` | agregações e datasets de exportação, todos com escopo server-side | 0039–0044 |
| **0046** | `ui_projections_135` | novas views `ui_*` e colunas nas existentes | 0045 |

> Números são **propostos**, não reservados. A ordem real será confirmada na sessão de
> implementação, conforme o [Plano de Implementação](AAPEX-135-PLANO-DE-IMPLEMENTACAO.md).

> **Estado real em 01/08/2026:** 0036–0041 escritas e aplicadas **somente em PGlite local**.
> Nenhuma foi enviada a staging ou produção. Próximo número livre: **0042**.
>
> **Uma ressalva de reversibilidade que a §9 não previa:** o teardown do harness
> (`supabase/rollback/0001_core_schema.down.sql`, **fora de `migrations/`**) precisou conhecer as
> tabelas e os enums novos. Sem isso as tabelas sobreviviam ao `drop schema app cascade`, mas
> perdiam as colunas tipadas pelos enums, e o `create table if not exists` da reaplicação não as
> recriava. O sintoma era opaco e aparecia numa RPC sem relação com o assunto. Toda migration nova
> que crie tabela com coluna de enum de `app` precisa entrar nesse arquivo.

## 3. Compatibilidade

### 3.1 O que continua funcionando sem alteração

| Fluxo | Por quê |
|---|---|
| Auditorias semanais em curso | `start_evaluation` só muda de comportamento **se** a data de cutover existir e tiver passado. Nasce nula |
| Auditorias mensais existentes | `evaluations` não perde nem muda coluna |
| Relatório Oficial de auditorias antigas | sem critérios materializados → **caminho antigo, byte a byte** |
| Planos existentes | ganham `source = 'legacy'` **por default de coluna**; FKs antigas intactas |
| Evidências | nenhuma alteração no caminho de upload |
| Trilha | mesma tabela, mesmos gatilhos, mesmo `app.write_audit` |
| Papéis e escopo | os quatro papéis e `user_scopes` já existem |

### 3.2 Compatibilidade do Relatório Oficial — o ponto mais sensível

`REPORT_FORMAT_VERSION` **permanece `1.3.3`** para documentos históricos (D8). A versão do novo
formato só será definida quando o contrato canônico do novo PDF for congelado — pendência **A-05**.

**Contrato de não-regressão:**

1. auditoria **sem** `evaluation_criteria` → percorre o caminho atual, **sem desvio**;
2. os **40 códigos de integridade** conhecidos devem ser reproduzidos **idênticos** após cada
   migration que toque o relatório;
3. o bloco de “planos atuais” continua **fora** do código oficial — comportamento já provado
   determinístico entre papéis e horários diferentes.

Se (2) falhar em qualquer momento, a migration está errada. Não é negociável.

### 3.3 Coexistência de estruturas paralelas

| Legado | Novo | Convivência |
|---|---|---|
| `audit_items.pillar` + `code` como tema | `themes` / `theme_versions` | **coexistem**. Nenhuma conversão automática |
| `audit_items` (checklist) | `audit_criteria` (processo) | **coexistem**. D4 proíbe conversão automática |
| `indicator_results` (`period` = `YYYY-MM`) | `assisted_cycle_entries` (semanal) | **coexistem**. Granularidades diferentes; **não migrar** |
| `evaluations` `frequency='weekly'` | `assisted_cycles` | **coexistem**. D1 proíbe conversão automática |

> Coexistência não é dívida — é o cumprimento literal de “não converter automaticamente”.

## 4. Os quatro drafts

### 4.1 Desambiguação obrigatória

Existem **dois conjuntos distintos de quatro rascunhos**. Confundi-los levaria a agir no ambiente
errado.

| | **Produção** (`plnbgdabciwygsmnyddy`) | **Staging** (`qcixfsdyfpankpatbays`) |
|---|---|---|
| Quantos | 4 | 4 |
| Natureza | **avaliações reais**, em rascunho | **rascunhos sintéticos** da fixture (ciclo de agosto, `[SIM]`) |
| Snapshots oficiais | **zero** | 40 |
| Tratamento | **decisão nominal antes do cutover** (D5) | congelados na fixture; **não tocar** |
| Fonte | memória de projeto e §5 das decisões | reconciliação **P-02** de 01/08/2026 |

**D5 se refere aos quatro de PRODUÇÃO.** Os quatro do staging não recebem decisão nominal: fazem
parte da fixture congelada.

### 4.2 Tratamento dos drafts de produção

**Não serão convertidos automaticamente.** Antes do cutover, **cada um** recebe decisão nominal:

1. **concluir como legado** — segue o fluxo semanal existente até a aprovação, virando histórico;
2. **cancelar formalmente** — encerramento registrado, com motivo, sem apagar;
3. **manter arquivado como draft legado** — permanece consultável, sem prosseguir.

Requisitos: decisão **individual e nominal** (não em lote), **registrada na trilha**, **antes** da
ativação do cutover. Enquanto não houver decisão para os quatro, **o cutover não deve ser ativado**.

Pendência **A-03**.

## 5. Cutover

### 5.1 Estrutura sim, ativação não

`system_settings.weekly_audit_cutover_date` nasce **nula**. Com valor nulo, a guarda em
`start_evaluation` é **inerte** — o comportamento é bit a bit o atual.

### 5.2 Pré-condições para ativar (nenhuma cumprida hoje)

- [ ] Gestão Assistida operacional e homologada;
- [ ] Auditoria Mensal com critérios configurados;
- [ ] catálogo de temas e indicadores revisado, com flags de módulo definidas;
- [ ] **decisão nominal dos quatro drafts de produção** (A-03);
- [ ] ponderação regional configurada **ou** decisão de operar sem índice (A-04);
- [ ] interface distinguindo legado · Gestão Assistida · Auditoria Mensal;
- [ ] **data definida** (A-02).

### 5.3 Depois do cutover

Nenhuma auditoria semanal nova. As existentes ficam **read-only**, acessíveis, nunca recalculadas.

## 6. Segurança

| Item | Exigência |
|---|---|
| RLS | **habilitada e forçada** em toda tabela nova, no padrão das 31 atuais |
| Grants | `revoke` explícito de `anon` nas tabelas novas — **mitiga o achado O-10** na superfície nova |
| `EXECUTE` | nenhuma RPC nova concede a `anon` nem a `PUBLIC` |
| Autorização | **server-side**, incluindo o novo recorte **regional** de D7 |
| Ator | nenhum `actor_id` vindo do cliente; guarda de ator nulo preservada (0030/0031) |
| Exportação | escopo e filtros resolvidos no servidor — **exportar não pode contornar a RLS** |
| Trilha | eventos novos pelo mesmo `app.write_audit`; imutabilidade intacta |

## 7. Testes de migração

Cada migration entra com: **teste positivo** (a estrutura existe e funciona), **teste negativo**
(escopo cruzado, papel indevido, `anon`), e **teste de não-regressão** (o que existia antes segue
idêntico).

Obrigatórios no conjunto:

1. **40 códigos de integridade reproduzidos idênticos** após cada migration que toque o relatório;
2. dois ciclos de Gestão Assistida na mesma semana para o mesmo parceiro → **recusa do servidor**;
3. auditoria mensal de **competência passada** registrável pelo caminho oficial (**fecha O-06**);
4. alterar tema/indicador → ciclo fechado e auditoria aprovada **não mudam**;
5. publicar indicador auditável **sem critério ativo** → recusa;
6. plano com `source` inconsistente com as FKs → recusa pelo CHECK;
7. cutover **nulo** → `start_evaluation` idêntico ao atual;
8. `anon` em toda tabela e RPC nova → conjunto vazio / 401;
9. tabelas novas: RLS **forçada**, `anon` sem grants;
10. CSV injection: texto iniciado por `=` `+` `-` `@` neutralizado;
11. exportação com papel de escopo restrito → só o próprio escopo.

## 8. Ambiente de desenvolvimento

- **Sem Docker** nesta máquina → sem runtime local do Supabase. Banco testado via **PGlite**.
- **Nenhum `db push`** em staging ou produção enquanto a fixture estiver congelada.
- Homologação remota só depois da aprovação e limpeza da fixture, **ou** em ambiente separado.
- O helper `q.ps1` tem guarda de ambiente que **recusa** rodar fora do alvo — manter o padrão,
  trocando o alvo para local.

## 9. Reversibilidade

Como tudo é aditivo, reverter é **descartar estruturas novas**, nunca restaurar dado.

| Fase | Como reverter |
|---|---|
| 0036–0038 (catálogo) | `drop` das tabelas novas; colunas novas em `indicator_versions` são anuláveis |
| 0039–0041 (Gestão Assistida) | `drop` das tabelas; colunas de `action_plans` anuláveis; `source` volta a `legacy` |
| 0042–0043 (auditoria/cutover) | `drop` de `evaluation_criteria`; guarda de cutover já é inerte |
| 0044–0046 | `drop` de tabelas e views |

**Nada em `evaluations`, `official_snapshots`, `evaluation_answers` ou `audit_logs` precisa ser
revertido — porque nada é alterado neles.**
