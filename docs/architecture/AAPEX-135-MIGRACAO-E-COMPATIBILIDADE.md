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
| ~~0042~~ ✅ | `monthly_audit_model` | **APLICADA LOCALMENTE.** `app.evaluation_model` e `app.criterion_answer_status`; discriminador em `evaluations` e `official_snapshots` com CHECK **mais forte** que o `not null` que substitui; `evaluation_criteria`, `evaluation_criterion_answers`, `evaluation_criterion_answer_evidence`; `evidence_upload_reservations` com dois destinos; `app.monthly_audit_score` (provisória, A-10) | 0038 |
| ~~0043~~ ✅ | `action_plan_monthly_source` | **APLICADA LOCALMENTE.** `monthly_criterion_answer_id` (**não** `monthly_audit_id` — ver ADR-135-003, D-Q), CHECK com as três origens, gatilho de coerência, `save_action_plan` estendida | 0042 |
| ~~0044~~ ✅ | `monthly_audit_rpcs` | **APLICADA LOCALMENTE.** `start_monthly_audit` com **período por parâmetro** (fecha O-06), respostas, evidências, submissão, `validate_evaluation` com ramo mensal, consulta e as duas fronteiras legadas | 0043 |
| ~~0045~~ ✅ | `authorization_hardening` | **APLICADA LOCALMENTE.** Correção mínima de dois defeitos reais achados pela auditoria da Fase 6: os *wrappers* `submit_evaluation` e `get_official_audit_report_data` passam a verificar escopo **antes** da fronteira de modelo (**O-16**); e as seis tabelas de catálogo de 0036–0038 passam a ter `authenticated` com **exatamente `SELECT`** (**O-17**). **Não cria tabela, coluna, tipo, gatilho, policy nem índice** | 0044 |
| ~~0046~~ ✅ | `authorization_uniform_legacy_errors` | **APLICADA LOCALMENTE.** Fecha o achado **O-18**: `submit_evaluation`, `remove_evidence` e `reserve_evidence_upload` respondem `avaliacao inexistente ou fora do escopo` para inexistente **e** para fora do alcance. As duas de evidência viram wrapper por `pg_get_functiondef`. **Não cria tabela, coluna, tipo, gatilho, policy nem índice** | 0045 |
| ~~0047~~ ✅ | `system_settings_and_cutover` | **APLICADA LOCALMENTE.** `system_settings` (com `client_readable` e CHECK de forma por chave); semente `weekly_audit_cutover_date` = **JSON null**; `get_system_settings`; `admin_set_weekly_audit_cutover`; guarda **inerte** em `start_evaluation`, que vira wrapper | 0046 |
| ~~0048~~ ✅ | `region_weightings_and_dashboard` | **APLICADA LOCALMENTE.** `region_weightings` versionada com CHECK `soma = 100` e **nenhuma linha semeada**; dois gatilhos (vigência sem sobreposição, versão publicada imutável); `catalog_save_region_weighting_draft`; `catalog_publish_region_weighting`; `get_weighting_status`; `get_dashboard_aggregates`; `get_matrix_dataset`. **A ponderação e as agregações vieram JUNTAS**, e não em duas migrations: a Matriz consulta as duas na mesma função | 0039–0047 |
| ~~0049~~ ✅ | `export_dataset` | **APLICADA LOCALMENTE.** `export_dataset(module, filters)` como porta única, com quatro corpos internos e **colunas tipadas**. Só funções — nenhuma estrutura | 0048 |
| ~~0050~~ ✅ | `definitive_scoring_rules` | **APLICADA LOCALMENTE.** A-10, A-11 e A-06 no banco. `score` deixa de ser `not null` em `evaluations` e `official_snapshots`, com CHECK por modelo **mais forte** que a restrição que substitui (técnica da D-M); `app.monthly_audit_score` perde o `coalesce(...,0)`; `app.assisted_performance_dto` e `app.monthly_process_dto`; proveniências definitivas; `export_dataset` vira **wrapper**. **O `ui_projections_135` previsto NÃO foi necessário** — as projeções `ui_*` existentes já bastavam, e migration sem conteúdo é proibida |
| ~~0051~~ ✅ | `monthly_audit_report_contract` | **APLICADA LOCALMENTE.** `get_monthly_audit_report_data`; `app.monthly_report_format_version` = **1.3.5**; as duas fronteiras legadas reapontadas **só na mensagem**; `get_monthly_audit_snapshot` vira **wrapper**. Só funções |
| **0052** | — | **próximo número livre** | 0049 |

> **Os quatro últimos foram RENUMERADOS**, e só eles: a Auditoria Mensal consumiu três migrations
> em vez de uma, porque o modelo precisou de tabelas de resposta e de vínculo de evidência que os
> Contratos §6 não previam. As já aplicadas (0036–0044) **não mudam de número**.

> Números são **propostos**, não reservados. A ordem real será confirmada na sessão de
> implementação, conforme o [Plano de Implementação](AAPEX-135-PLANO-DE-IMPLEMENTACAO.md).

> **Estado real em 02/08/2026 (fim da Fase 10):** **0036–0051** escritas e aplicadas **somente em
> PGlite local**. Nenhuma foi enviada a staging ou produção. Próximo número livre: **0052**.
> `0001`–`0049` conferidas **por blob Git** contra `6bd29e9`: idênticas.
>
> **Uma coluna histórica deixou de ser `not null`, e isso merece o registro completo.**
> `evaluations.score` e `official_snapshots.score` eram `not null default 0`. Enquanto fossem, a
> decisão A-10 era **inaplicável**: "nenhum critério aplicável" viraria nota zero **dentro do
> banco**, antes de qualquer camada de apresentação poder defender a ausência.
>
> `drop not null` **não reescreve linha nenhuma** — é alteração de catálogo. E o CHECK que entra no
> lugar é **mais forte** para o caminho legado, que continua obrigado a ter nota. É a mesma
> troca que a decisão **D-M** fez com `template_version_id`, pelo mesmo motivo: o modelo passa a
> declarar qual das duas formas vale, e a outra é impossível.
>
> **Risco assumido, registrado como RT-16:** todo consumidor futuro que fizer `Number(score)` sem
> checar `null` produzirá zero — que é exatamente o defeito que a mudança elimina. Mitigado hoje em
> quatro camadas; **recorrente por construção**.
>
> **Duas funções viraram wrapper, e as duas DELEGAM PRIMEIRO.** `export_dataset` e
> `get_monthly_audit_snapshot` precisavam de mudanças em literais **dentro** do corpo. Reescrevê-las
> é o caminho que a 0044 tentou com `submit_evaluation` e que custou, em silêncio, a guarda da 0027.
> Os corpos foram **movidos** por `pg_get_functiondef`, com `raise` se o corpo não for encontrado —
> a migration falha alto em vez de produzir função errada. São a **sexta e a sétima** camadas
> (RT-15), e as duas resolvem o O-16 na forma mais forte: delegam antes de tocar em qualquer coisa.
>
> **O teardown NÃO precisou mudar**: nenhuma tabela nova foi criada.
>
> **Uma armadilha nova, e ela custou um teste vermelho antes do commit.** Na resolução de filtros,
> `p_filters ? 'statuses'` é verdadeiro para `statuses: []` — e o `in (select ...)` sobre um array
> vazio não casa com nada. Resultado: **uma lista vazia esvaziava o painel inteiro em silêncio**,
> parecendo "não há dado no período". Lista vazia é **ausência de filtro**, não conjunto vazio, e a
> distinção passou a morar em `app.filter_len`. O sintoma seria interpretado como falta de operação,
> não como defeito de contrato — que é a pior classe de bug num painel.
>
> **Uma escolha de teardown que não é sobre enum.** `system_settings` entrou em
> `supabase/rollback/0001_core_schema.down.sql` **não** por ter coluna de enum de `app`, mas porque
> guarda **estado de configuração**: sobrevivendo ao teardown, uma data de cutover gravada por um
> teste vazaria para o teste seguinte, já que o `on conflict do nothing` da semente não a
> reescreveria. `region_weightings` entrou pelo motivo clássico (usa `app.catalog_status`).
>
> **Duas armadilhas novas, descobertas pela auditoria da Fase 6.**
>
> 1. **O wrapper roda antes da guarda.** A técnica de `pg_get_functiondef` preserva o corpo legado —
>    e por isso mesmo a fronteira nova escrita no wrapper passa à frente da autorização que mora
>    dentro da função legada. Foi o achado **O-16**: `submit_evaluation` e
>    `get_official_audit_report_data` diziam o **modelo** de uma auditoria a quem não alcançava a
>    operação. Todo wrapper futuro precisa verificar ator e escopo — ou delegar — **antes** de dizer
>    qualquer coisa sobre o objeto.
> 2. **Revogar por lista é antipadrão.** `revoke insert, update, delete, truncate … from
>    authenticated` deixa `REFERENCES` e `TRIGGER`, que o ambiente real concede a toda tabela nova
>    (O-10). Foi o achado **O-17**, e o efeito medido é um Gerente de Canal criando gatilho em
>    `public.themes`. O padrão correto, de 0039 em diante, é
>    `revoke all … from anon, public, authenticated` seguido de `grant select to authenticated`.
>
> **Técnica nova, e obrigatória daqui para a frente.** Estender função legada **copiando o corpo
> é proibido**: a primeira versão da 0044 reescreveu `submit_evaluation` a partir da 0025 e perdeu,
> em silêncio, a guarda de estado que a 0027 acrescentou. Cinco testes pegaram. O caminho é
> `pg_get_functiondef` renomear a função vigente para `app.*_legacy` e o wrapper novo só
> acrescentar a fronteira — assim *"o corpo legado é o mesmo"* deixa de ser promessa e vira
> propriedade do comando. Aplicado a `submit_evaluation` e a `get_official_audit_report_data`.
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

`REPORT_FORMAT_VERSION` **permanece `1.3.3`** para documentos históricos (D8).

> ✅ **A-05 RESOLVIDA em 02/08/2026.** O formato mensal nasceu como
> **`MONTHLY_REPORT_FORMAT_VERSION = 1.3.5`**, em constante e caminho **independentes**. A histórica
> **não foi substituída**, e a razão é aritmética: ela participa da canonicalização dos quarenta
> documentos já emitidos, cujos códigos seguem sendo dívida não remedida. Trocá-la invalidaria uma
> prova para poupar uma linha. Ver [ADR-135-004](ADR-135-004-PONTUACOES-RESUMO-E-RELATORIO-MENSAL.md) §6.

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

## 8.1 Matriz Local × Homologação (Fase 11, 02/08/2026)

Ambiente separado: **AAPEx 1.3.5 Homologacao** (`qjvpkaurihjvzktlinhp`, ca-central-1), provisionado
do zero. `migration list` inicial: **51 locais, 0 remotas**. Depois do `db push`: **Local = Remote
em 0001–0051**.

A paridade não ficou no número de arquivos: a mesma consulta de catálogo rodou nos dois lados
(PGlite 18.3 × PostgreSQL 17.6) e foi comparada por hash.

| Categoria | Local | Homologação | Veredito |
|---|---:|---:|---|
| COLUMN | 572 | 572 | hash **idêntico** |
| ENUM | 19 | 19 | hash **idêntico** |
| GRANT | 914 | 914 | hash **idêntico** |
| INDEX | 120 | 120 | hash **idêntico** |
| **POLICY (RLS)** | 71 | 71 | hash **idêntico** |
| RLSENABLED | 45 | 45 | hash **idêntico** |
| TABLE | 45 | 45 | hash **idêntico** |
| TRIGGER | 71 | 71 | hash **idêntico** |
| VIEW (`ui_*`) | 9 | 9 | hash **idêntico** |
| CONSTRAINT | 587 | 226 | **PG 18 materializa `NOT NULL` em `pg_constraint`; o 17 não.** Fora `contype='n'`: 38/116/45/27 dos dois lados |
| FUNCTION | 232 | 195 | **as 37 a mais são pgcrypto em `public` (PGlite).** Zero funções só no remoto |
| FUNCGRANT | 464 | 390 | 74 = 2 papéis × as mesmas 37 |
| SCHEMAGRANT | 6 | 6 | o harness dá `usage on app` a `anon`/`service_role`; a homologação dá **só a `authenticated`** (0008). **O remoto é mais restrito** |

Nenhuma divergência é de domínio. Detalhamento em
[`AAPEX-135-FASE-11-HOMOLOGACAO.md`](AAPEX-135-FASE-11-HOMOLOGACAO.md).

> **Tipos gerados.** `src/services/supabase/database.types.ts` estava congelado antes das
> migrations 0036–0051 e não descrevia nenhuma tabela nem RPC da 1.3.5. Não quebrava o build
> porque os repositórios recebem `SupabaseClient` **sem** o genérico `<Database>`. Foi
> **regenerado** contra a homologação; `tsc --noEmit` segue verde.

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
