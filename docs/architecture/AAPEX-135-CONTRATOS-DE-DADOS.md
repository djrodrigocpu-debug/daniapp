# AAPEx 1.3.5 — Contratos de Dados

**Status:** parcialmente IMPLEMENTADO · §2, §3, §4 e §5 executados nas migrations 0036–0041
**Data:** 01/08/2026 · base `8ffc49a`, migrations 0001–0041, **próximo número livre: 0042**

> ⚠️ **Onde este documento foi superado pela implementação.** §2, §3 e §6 foram escritos antes de
> A-08 e ficam superados pelo [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md) §4. O §4 (Gestão
> Assistida) foi implementado nas 0039/0041 com **mais** campos do que o proposto — sete FKs de
> proveniência em vez de duas, e `diagnosis` na própria entrada. O §5 (origem dos planos) foi
> implementado na 0040 na alternativa **A**, com duas diferenças registradas em
> [ADR-135-002](ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md): `monthly_audit_id` **ainda não existe**
> (fica no residual da Fase 4) e o vínculo é **um-para-um**, por índice único parcial.
**Fonte canônica:** [Decisões Empresariais](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) · [Modelo Operacional](../business/AAPEX-135-MODELO-OPERACIONAL.md)

Modelo de dados proposto. Toda estrutura aqui é **aditiva**: nada existente é reescrito.

---

## 1. Princípios que restringem o desenho

1. **Aditivo.** Nenhum `UPDATE`/`DELETE` retroativo em `evaluations`, `official_snapshots`,
   `evaluation_answers` ou vínculos históricos. Snapshots são imutáveis por gatilho (0033/0034) e o
   código de integridade é determinístico — provado 40/40. Reescrever a montante quebraria a prova.
2. **Materialização no fechamento.** Meta, tolerância, peso, tema e regra de cálculo são **copiados**
   para o registro, não lidos por referência na exibição.
3. **Integridade referencial real.** Origem de plano por **FK verificada**, nunca `source_type` +
   UUID solto.
4. **Autorização server-side.** Toda tabela nova nasce com RLS **habilitada e forçada**, no padrão
   das 31 atuais.

## 2. Temas

Não existe entidade de tema hoje. O papel é exercido por `audit_items.pillar` (texto),
`audit_items.code` projetado como `themeId`, e `action_plans.theme_code` (texto).

Proposta: espelhar o padrão **definição + versões** que `indicator_definitions`/`indicator_versions`
já usa e que funciona.

```
themes
  id            uuid pk
  code          text unique          -- estável, ex.: TEMA-003
  lifecycle     app.indicator_lifecycle   -- draft | active | inactive (reuso)
  created_at, created_by

theme_versions
  id              uuid pk
  theme_id        uuid fk -> themes(id)
  version_number  int
  name            text                -- nome vigente NESTA versão
  description     text
  sort_order      int                 -- ordenação
  effective_from  timestamptz
  active          boolean
  created_at
  unique (theme_id, version_number)
```

**Por que o nome fica na versão, não na definição:** D3 exige preservar *"o nome do tema vigente na
data do registro"*. Se o nome estivesse na definição, renomear um tema reescreveria a leitura de
todo o histórico.

**Exclusão:** bloqueada por gatilho quando houver histórico, no padrão de
`app.guard_indicator_delete` / `app.guard_indicator_version_delete` (0022).

## 3. Indicadores — extensão do que já existe

`indicator_versions` **já é versionada** e já carrega `unit`, `direction`, `target`,
`yellow_tolerance`, `weight`, `effective_from`, `limitations`. Faltam quatro coisas.

```
alter table indicator_versions add:
  theme_version_id              uuid fk -> theme_versions(id)
  orientation                   text        -- orientação de preenchimento (D1)
  description                   text
  include_in_assisted_management boolean not null default true
  include_in_monthly_audit       boolean not null default false
```

### Por que as flags ficam na VERSÃO e não na definição

Decisão técnica, com fundamento na decisão empresarial:

- D3 diz que indicadores são *"editáveis por nova versão"* e que *"alterações futuras não modificam
  ciclos ou auditorias encerrados"*;
- se a flag estivesse na definição, marcar um indicador para auditoria mudaria retroativamente a
  composição de auditorias já criadas;
- na versão, a auditoria de março continua sabendo quais indicadores eram auditáveis **em março**.

Mesmo raciocínio para `theme_version_id`: mover um indicador de tema é **nova versão**, e o
histórico continua apontando para a associação vigente à época — atendendo à exigência de preservar
a associação **na data do registro** *e* **na data da auditoria**.

> ⚠️ Esta é a única escolha de modelagem deste documento que não é ditada literalmente pelas
> decisões; é **derivada** delas. Está sinalizada para aprovação explícita.

## 4. Gestão Assistida — domínio próprio

D1 é expressa: **domínio e estruturas próprias**, sem sobrecarregar `evaluations`.

```
assisted_cycles
  id                uuid pk
  operation_id      uuid fk -> operations(id)
  week_start_date   date not null        -- SEGUNDA-feira da semana
  status            app.assisted_cycle_status  -- draft | closed  (enum novo)
  author_user_id    uuid fk -> users(id)
  closed_at         timestamptz
  closed_by         uuid fk -> users(id)
  rule_version      text                 -- regra de status materializada no fechamento
  row_version       int
  created_at, updated_at
  unique (operation_id, week_start_date)      <-- IDEMPOTÊNCIA SERVER-SIDE
  check  (extract(isodow from week_start_date) = 1)   <-- é sempre segunda
```

A unicidade é **constraint de banco**, não verificação de aplicação. É o que fecha a lacuna do
achado **O-06**, em que a idempotência dependia de `(operação, frequência)` limitada a rascunho.

```
assisted_cycle_entries
  id                    uuid pk
  cycle_id              uuid fk -> assisted_cycles(id) on delete cascade
  indicator_version_id  uuid fk -> indicator_versions(id)     -- versão usada
  theme_version_id      uuid fk -> theme_versions(id)         -- tema à época

  -- valores copiados no ato do registro (materialização)
  target                numeric(14,4)
  tolerance             numeric(14,4)
  unit                  text
  direction             app.indicator_direction
  orientation           text
  weight                numeric(6,2)

  -- o que o GC informa
  actual                numeric(14,4)          -- null = sem dado
  source_period         text not null          -- período da FONTE externa
  source_consulted_at   date not null          -- data da consulta
  source_reference      text                   -- referência textual, opcional
  observation           text

  -- o que o servidor calcula
  status                app.assisted_status    -- enum novo: conforme|atencao|nao_conforme|sem_dado

  recorded_by           uuid fk -> users(id)   -- ator
  recorded_at           timestamptz            -- data de registro
  unique (cycle_id, indicator_version_id)
```

Os 16 campos exigidos por D1 estão todos presentes. `target`/`tolerance`/`unit`/`direction`/
`orientation`/`weight`/`theme_version_id` são **cópias**, não referências vivas.

### Enums novos

```
app.assisted_cycle_status  as enum ('draft', 'closed')
app.assisted_status        as enum ('conforme', 'atencao', 'nao_conforme', 'sem_dado')
```

### Regra de status — server-side e materializada

Função `app.assisted_status_of(direction, target, tolerance, actual)`:

- `actual is null` → `sem_dado`;
- `higher_better`: `actual >= target` → conforme; `actual >= target - tolerance` → atenção; senão
  não conforme;
- `lower_better`: `actual <= target` → conforme; `actual <= target + tolerance` → atenção; senão
  não conforme;
- **`target_band` → ver pendência A-01. Não há regra definida.** A função **deve falhar
  explicitamente**, não escolher um comportamento por conta própria.

`assisted_cycles.rule_version` grava qual versão da regra fechou o ciclo, atendendo a *"materializar
a regra vigente para impedir recálculo histórico"*.

### Guarda de desvio

Ao fechar o ciclo, gatilho recusa se alguma entrada em `atencao` ou `nao_conforme` não tiver
diagnóstico, plano, responsável e prazo. Para `conforme`, opcional.

## 5. Planos de ação — modelagem de origem ⚠️ decisão exigida por D6

`action_plans` **já é um motor único** e **já usa FK anuláveis** para origem: `evaluation_id` e
`item_id`.

| Alternativa | Integridade | Veredito |
|---|---|---|
| **A — colunas FK anuláveis + CHECK de exclusividade** | ✅ real, pelo banco | **ESCOLHIDA** |
| B — tabelas de ligação por origem | ✅ real | rejeitada: 3 tabelas a mais, joins em todo lugar, sem ganho |
| C — `source_type` + UUID sem FK | ❌ nenhuma | **proibida por D6** |

**Alternativa A, em detalhe:**

```
alter table action_plans add:
  assisted_entry_id  uuid fk -> assisted_cycle_entries(id)
  monthly_audit_id   uuid fk -> evaluations(id)
  source             app.action_source  -- enum: assisted | monthly_audit | legacy

  check (
    (source = 'assisted'      and assisted_entry_id is not null and monthly_audit_id is null)
    or (source = 'monthly_audit' and monthly_audit_id is not null and assisted_entry_id is null)
    or (source = 'legacy'        and assisted_entry_id is null and monthly_audit_id is null)
  )
```

**Por que A:** continua o padrão que o schema já adota; o banco **verifica a existência** do
registro de origem (é isso que D6 exige e que C não dá); o CHECK garante **exatamente uma** origem;
e planos legados permanecem válidos com `source = 'legacy'` e as FKs antigas intactas.

**Backfill:** planos existentes recebem `source = 'legacy'` por default na própria migration —
aditivo, sem reescrever semântica.

**Estados preservados sem alteração:** o enum `app.action_status` já contém
`open, in_progress, blocked, done, overdue, cancelled_justified` e recebeu `validated` e
`waiting_partner`. **Nada a mudar.** Anti-auto-validação (`app.can_validate`), `validated_by`,
`validated_at` e o `overdue` derivado da data permanecem como estão.

## 6. Auditoria Mensal e critérios

A Auditoria Mensal **continua em `evaluations`** com `frequency = 'monthly'`. D1 proíbe sobrecarregar
`evaluations` **para a Gestão Assistida**; a auditoria mensal já é o que `evaluations` significa.

### Critérios versionados

```
audit_criteria
  id                       uuid pk
  indicator_definition_id  uuid fk -> indicator_definitions(id)
  code                     text
  lifecycle                app.indicator_lifecycle
  created_at, created_by
  unique (indicator_definition_id, code)

audit_criteria_versions
  id                    uuid pk
  criterion_id          uuid fk -> audit_criteria(id)
  version_number        int
  question              text not null      -- pergunta
  description           text
  guidance              text               -- orientação
  sort_order            int                -- ordem
  required              boolean            -- obrigatório
  evidence_required     boolean            -- evidência obrigatória
  allows_na             boolean            -- permite N/A
  requires_justification boolean           -- exige justificativa
  effective_from        timestamptz        -- vigência
  active                boolean            -- ativo/inativo
  unique (criterion_id, version_number)
```

Os dez campos exigidos por D4 estão presentes.

### Materialização na criação da auditoria

```
evaluation_criteria            -- cópia congelada, criada junto com a auditoria
  id                       uuid pk
  evaluation_id            uuid fk -> evaluations(id) on delete cascade
  criterion_version_id     uuid fk -> audit_criteria_versions(id)
  indicator_version_id     uuid fk -> indicator_versions(id)
  theme_version_id         uuid fk -> theme_versions(id)
  question, description, guidance, sort_order,
  required, evidence_required, allows_na, requires_justification   -- COPIADOS
  unique (evaluation_id, criterion_version_id)
```

Guarda de imutabilidade no padrão de `app.lock_template_on_use` (0001), que já congela
`audit_template_versions` após uso. **Alteração posterior do catálogo não toca auditoria existente.**

**Guarda de publicação:** gatilho impede marcar `include_in_monthly_audit = true` numa versão de
indicador sem **ao menos um critério ativo**.

**Proibições respeitadas:** nenhuma geração automática de critério a partir do nome do indicador;
nenhuma conversão automática de `audit_items` em critérios. `audit_items` permanece **intacto**,
servindo o histórico legado.

## 7. Cutover parametrizável — criado e DESATIVADO

```
system_settings
  key         text pk
  value       jsonb not null
  updated_at, updated_by
```

Semente: `weekly_audit_cutover_date = null`. Enquanto for nulo, **nada muda** — auditorias semanais
continuam podendo ser criadas. Guarda em `start_evaluation` recusa `frequency = 'weekly'` apenas
**quando a data existir e já tiver passado**.

**Estrutura criada; cutover não ativado.** A data é a pendência **A-02**.

> ✅ **IMPLEMENTADO na 0047**, com **duas diferenças** em relação ao desenhado acima, e as duas
> registradas:
>
> 1. **`value` ganhou `client_readable boolean not null default false` e `description text`.** A
>    coluna de visibilidade existe para que *"`authenticated` apenas com leitura mínima"* seja
>    verificável pelo banco — a policy é `using (client_readable)` — em vez de virar disciplina, que
>    foi o que o achado **O-17** mostrou não bastar;
> 2. **"sem data" é JSON null (`'null'::jsonb`), não SQL NULL.** `value` é `not null` de propósito, e
>    um CHECK por chave garante que o valor do cutover só possa ser JSON null ou uma string
>    `YYYY-MM-DD`. Data malformada **não chega a existir** na tabela, e portanto não chega à guarda.
>
> A guarda em `start_evaluation` recusa `weekly` quando a data existe, já venceu **e** não há ciclo
> semanal reaproveitável naquela operação — a terceira condição impede que ativar o cutover deixe
> rascunhos órfãos, que D5 precisa que continuem abrindo.

## 8. Ponderação por região

```
region_weightings
  id              uuid pk
  region_id       uuid fk -> regions(id)
  version_number  int
  assisted_weight numeric(5,2)
  audit_weight    numeric(5,2)
  effective_from  timestamptz
  active          boolean
  created_by
  unique (region_id, version_number)
  check (assisted_weight + audit_weight = 100)     <-- pesos somam 100%
```

**Nenhuma linha é semeada** — D10 diz que **não há peso padrão aprovado** (pendência A-04). Sem
linha ativa para a região, o servidor devolve `"Ponderação não configurada"`, entrega os dois eixos
e **não calcula** índice consolidado. Faltando um módulo: dados insuficientes, **sem renormalizar**.

> ✅ **IMPLEMENTADO na 0048**, com **três acréscimos** ao desenho acima:
>
> 1. **`effective_to date`** — `null` significa vigente. Publicar uma versão nova **fecha** a
>    anterior aqui, e isso não é reescrever histórico: é registrar quando ela deixou de valer. Os
>    pesos publicados **nunca** mudam, e um gatilho recusa alterá-los;
> 2. **`status app.catalog_status` + `published_by`/`published_at`** — o mesmo ciclo
>    rascunho → publicado do catálogo, em vez de `active boolean`. Um `boolean` não distingue
>    "ainda não publicado" de "publicado e encerrado";
> 3. **um índice único parcial por região** (`status = 'published' and effective_to is null`) e um
>    gatilho de **vigência sem sobreposição** — "uma publicada e vigente por região" passa a ser
>    propriedade do banco, e não do código que escreve.
>
> ⭐ **E uma pendência nova, A-11.** O índice ponderado precisa de um número em cada eixo. O mensal
> tem um, provisório (A-10). O eixo de **desempenho não tinha nenhum**: a Gestão Assistida produz
> *status* por indicador, não nota. Adotada a **mesma forma** de A-10, declarada **provisória**, e a
> proveniência viaja em toda resposta. Ver Decisões Empresariais §5.

## 9. Resumo das estruturas

| Tabela | Natureza |
|---|---|
| `themes`, `theme_versions` | **nova** |
| `assisted_cycles`, `assisted_cycle_entries` | **nova** |
| `audit_criteria`, `audit_criteria_versions` | **nova** |
| `evaluation_criteria` | **nova** (materialização) |
| `system_settings` | **nova** |
| `region_weightings` | **nova** |
| `indicator_versions` | **estendida** (4 colunas) |
| `action_plans` | **estendida** (3 colunas + CHECK) |
| `evaluations`, `official_snapshots`, `audit_items`, `evaluation_answers`, `audit_logs` | **intactas** |

Enums novos: `app.assisted_cycle_status`, `app.assisted_status`, `app.action_source`.

**Nenhuma tabela existente perde coluna, muda tipo ou tem dado reescrito.**

## 10. Decisões de dados ainda em aberto

| # | Pendência |
|---|---|
| **A-01** | Regra de status para `target_band` — a função **deve falhar**, não inventar comportamento |
| **A-04** | Pesos de `region_weightings` — nenhuma linha semeada |
| **A-06** | Colunas exatas da aba `Resumo` da exportação |
| **A-07** | Se a autoridade regional se resolve apenas por `user_scopes.region_id` |
| ~~**A-08**~~ ✅ | **Resolvida em 01/08/2026 — modelo híbrido.** Ver [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md). §2, §3 e §6 deste documento foram escritos **antes** da decisão e ficam **superados** naquilo que o ADR §4 substitui: critérios pendem da configuração regional (D-A), e tema/meta/tolerância/peso/ordem/flags moram na versão da configuração regional, não em `indicator_versions` (D-B) |
| ~~**A-09**~~ ✅ | **Resolvida por consequência de A-08** — as flags ficam na versão da configuração regional |
