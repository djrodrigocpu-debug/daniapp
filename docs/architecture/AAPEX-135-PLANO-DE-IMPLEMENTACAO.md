# AAPEx 1.3.5 — Plano de Implementação

**Status:** plano · **nenhuma linha de código funcional escrita**
**Data:** 01/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit` · base `8ffc49a`
**Fonte canônica:** [Decisões Empresariais](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) · [Contratos de Dados](AAPEX-135-CONTRATOS-DE-DADOS.md) · [Migração](AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md)

---

## 1. Restrições permanentes

Valem em **todas** as fases:

| ⛔ | Restrição |
|---|---|
| Fixture | `SIM-AAPEX-134-2MESES-20260801-1520` **congelada**. Nada de mutação, nada de usar como ambiente de desenvolvimento, nada de trocar a interface em `localhost:8100` — a revisão precisa continuar vendo a **1.3.4** |
| Ambientes | **Sem `db push`** em staging ou produção. Desenvolvimento **local** (PGlite) |
| Build | **Nenhum build distribuído** antes da homologação |
| Migrations | **Aditivas.** Nenhum `UPDATE`/`DELETE` retroativo |
| Versão | permanece **1.3.4**. Bump para 1.3.5 só na homologação. **1.4.0** e **2.0.0** reservadas |
| Git | autoria exclusiva `djrodrigocpu-debug <djrodrigocpu@gmail.com>`; **sem menção a IA**; sem `amend`/`rebase`/`squash`/`force push`/`reset --hard`; **sem merge**; **sem push de `main`** |
| Achados | **O-05, O-14, O-15**, `AuthModeBanner` e logout dos GCs **não são corrigidos** |

## 2. Fases

Cada fase tem **critério de saída verificável**. Fase sem critério cumprido não libera a seguinte.

---

### Fase 0 — Consolidação documental ✅ **CONCLUÍDA**

Sete documentos produzidos, revisados entre si, commitados. Nenhum código.

**Saída:** ✅ documentos versionados · ✅ pendências nomeadas · ✅ fixture/staging/produção intactos.

---

### Fase 1 — Fundação do catálogo: temas e indicadores versionados ✅ **CONCLUÍDA** (01/08/2026)

**Entregue de fato:** migrations **0036, 0037 e 0038** · escopo `global`/`regional` em temas e
indicadores · **configuração operacional regional versionada** · **critérios de processo por
região** · `app.reaches_region` e `app.can_manage_catalog` · 14 RPCs `catalog_*` · domínio,
repositórios e aba administrativa **“Catálogo regional”** · 1488 testes verdes.

Cresceu além do escrito abaixo porque **A-08** foi aprovada durante a fase. Ver
[ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md) e o checkpoint
`E:\AACE_Backups\AAPEx-135-FASE-1-FUNDACAO-20260801-2238\`.

**Critério de saída:** cumprido, com **uma ressalva nomeada** — os *40 códigos de integridade*
foram medidos contra o **staging** na 1.3.4 e **não puderam ser remedidos** aqui, porque staging e
fixture estão fora de alcance por decisão. O que foi provado localmente é o conjunto de invariantes
de determinismo do relatório (`src/db/official_audit_report.integration.test.ts`, verde), que é
condição necessária, não a mesma medição. **A remedição dos 40 códigos fica devida à primeira
sessão que tiver staging liberado.**

<details>
<summary>Texto original da fase, preservado</summary>

**Por que primeiro:** tudo depende do catálogo. `assisted_cycle_entries` referencia
`indicator_versions` **e** `theme_version_id`; critérios pendem de indicador; a Auditoria Mensal
seleciona por `include_in_monthly_audit`. Começar por qualquer outro ponto cria dependência
reversa.

**Entrega:** migrations 0036–0037 · `themes` + `theme_versions` · 5 colunas em
`indicator_versions` · guardas de exclusão com histórico · RLS forçada e `revoke` de `anon` · RPCs
`admin_create_theme`, `admin_add_theme_version`, `admin_deactivate_theme` · projeção `ui_indicators`
estendida.

**Critério de saída**
- [ ] criar, versionar, reordenar e inativar tema — provado local;
- [ ] excluir tema com histórico → **recusado por gatilho**;
- [ ] nova versão de indicador **não altera** ciclo fechado nem auditoria aprovada;
- [ ] defaults corretos: `include_in_assisted_management = true`, `include_in_monthly_audit = false`;
- [ ] tabelas novas com RLS **forçada** e `anon` **sem grants** (mitiga O-10 na superfície nova);
- [ ] testes negativos **19, 20, 21, 22, 25, 26** verdes;
- [ ] **40 códigos de integridade reproduzidos idênticos**.

> ✅ **Bloqueio de entrada levantado.** **A-08** foi aprovada em 01/08/2026 — modelo híbrido,
> [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md). A entrega da Fase 1 cresce em relação ao que
> está escrito acima: além de temas e indicadores versionados, entram **escopo global/regional**,
> **configuração operacional regional versionada** e **critérios por região** — porque o ADR ancora
> critérios e flags de módulo na configuração regional (D-A, D-B), e não em `indicator_versions`.

</details>

---

### Fase 2 — Critérios de processo ✅ **ABSORVIDA PELA FASE 1** (01/08/2026)

> **Nada foi renumerado.** A Fase 2 continua sendo a Fase 2; o que mudou é **quando** ela foi
> entregue, e o motivo é rastreável a uma decisão, não a uma conveniência.
>
> **Por que foi absorvida.** A decisão **D-A** do [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md)
> ancorou os critérios na **configuração regional**, e não em `indicator_definitions` como os
> Contratos de Dados §6 propunham antes de A-08. Com isso a Fase 2 deixou de ser separável: um
> critério só existe pendurado numa configuração regional, e a configuração regional passou a ser
> entrega da Fase 1. Entregar as duas em sessões diferentes exigiria criar a tabela de critérios sem
> a chave estrangeira que a define — ou seja, criar errado para corrigir depois.
>
> **Migration:** `0038_regional_audit_criteria.sql`, exatamente o número previsto.

**Critério de saída — verificado**

- [x] critério criado, versionado, com os dez campos de D4
      (`src/db/catalog_audit_criteria.integration.test.ts`);
- [x] marcar `include_in_monthly_audit = true` sem critério ativo → **recusado** por gatilho,
      inclusive contra escrita direta como superusuário;
- [x] `audit_items` **intacto**; nenhuma conversão automática — provado por teste que conta as duas
      estruturas lado a lado;
- [x] nenhum critério gerado a partir do nome do indicador — provado por teste que exige zero
      critérios após criar indicador e configuração;
- [x] teste negativo **27** verde.

<details>
<summary>Texto original da fase, preservado</summary>

### Fase 2 — Critérios de processo

**Entrega:** migration 0038 · `audit_criteria` + `audit_criteria_versions` · guarda “não publicar
indicador auditável sem critério ativo” · RPCs de gestão de critério.

**Critério de saída**
- [ ] critério criado, versionado, com os dez campos de D4;
- [ ] marcar `include_in_monthly_audit = true` sem critério ativo → **recusado**;
- [ ] `audit_items` **intacto**; nenhuma conversão automática;
- [ ] nenhum critério gerado a partir do nome do indicador;
- [ ] teste negativo **27** verde.

</details>

---

### Fase 3 — Gestão Assistida: unidade VERTICAL ✅ **CONCLUÍDA** (01/08/2026)

> **A Fase 3 foi entregue VERTICAL, absorvendo o mínimo indispensável da Fase 4.** Decisão do
> proprietário, registrada em [ADR-135-002](ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md).
>
> **Por que.** O fechamento do ciclo exige plano de ação para todo desvio (D2). O vínculo íntegro do
> plano estava planejado para a Fase 4. A separação deixava só duas saídas, ambas proibidas por D6:
> plano como texto solto, ou UUID sem verificação. Entregar as duas juntas era a única forma de o
> fechamento validar contra algo que o banco conhece.

**Entregue de fato:** migrations **0039, 0040 e 0041** · `assisted_cycles` com unique
`(operation_id, week_start_date)` e CHECK de segunda-feira · `assisted_cycle_entries` com os campos
de D1 e sete FKs de proveniência · `app.assisted_status_of`, `app.assisted_week_start`,
`app.assisted_today`, `app.assisted_rule_version`, `app.is_assisted_operator` · cinco gatilhos ·
`action_plans.assisted_entry_id` + `source` + CHECK + índice único parcial · `save_action_plan`
estendida · RPCs `open_assisted_cycle`, `save_assisted_entry`, `close_assisted_cycle`,
`get_assisted_cycle`, `list_assisted_cycles` · domínio, policy, repositórios e a tela
`AssistedCycleScreen` · **1651 testes verdes** (eram 1488).

**Ordem das migrations, e por quê.** 0040 (planos) vem **antes** de 0041 (RPCs) porque
`close_assisted_cycle` valida contra `action_plans.assisted_entry_id`. A divisão sugerida
originalmente exigiria uma migration referenciando coluna inexistente.

**Critério de saída — verificado** (`src/db/assisted_management.integration.test.ts`, 67 casos)

- [x] dois ciclos na mesma semana → **recusa da constraint do banco**, não da aplicação (teste 28);
- [x] `open_assisted_cycle` idempotente: reabrir devolve o mesmo ciclo, e a trilha registra a
      abertura **uma vez**;
- [x] `week_start_date` é sempre segunda, em `America/Sao_Paulo`, com CHECK no banco;
- [x] status calculado server-side, conferindo com a tabela de D2 — e **impossível de forjar**:
      `UPDATE` direto gravando `conforme` é sobrescrito pelo gatilho;
- [x] `target_band` → falha explícita citando **A-01**, sem conversão (A-01 **continua aberta**);
- [x] fechar com desvio sem diagnóstico/plano/responsável/prazo → recusado, com o indicador
      nomeado na mensagem (teste 29);
- [x] alterar a meta na configuração regional depois do fechamento **não muda** o status histórico;
- [x] `sem_dado` distinto de não conformidade — e **impede o fechamento**, sem virar não
      conformidade (regra provisória, ver §8 abaixo);
- [x] GC abre ciclo só nos próprios parceiros; ADMIN, REGIONAL e COORDENADOR **consultam e não
      executam** (teste 30);
- [x] `anon` e `PUBLIC` sem grant nas tabelas novas; `authenticated` só com `SELECT`; RLS forçada.

**Regra provisória declarada — `sem_dado` no fechamento.** Nenhum documento canônico define o que
fazer com item obrigatório sem resultado no momento de fechar. Adotado o comportamento
conservador: **salvar rascunho é permitido, fechar não**. Não se converte ausência em não
conformidade (Modelo Operacional §2.4 é expresso), e não se fecha com lacuna silenciosa. Se a
decisão empresarial vier a permitir, o lugar de mudá-la é `close_assisted_cycle`, e só ele.

---

### Fase 4 — Planos: origem com integridade referencial ⚠️ **PARCIALMENTE ABSORVIDA** pela Fase 3

> **Nada foi renumerado.** A Fase 4 continua sendo a Fase 4; o que mudou é **quanto** dela já foi
> entregue, e por quê.

**Já entregue na 0040:** `app.action_source` (com os três valores de D6) · `assisted_entry_id` com
FK · CHECK de exclusividade · índice único parcial (um plano por item) ·
`app.guard_action_plan_assisted_link` (coerência de operação, imutabilidade do vínculo, recusa de
vínculo em ciclo fechado) · `save_action_plan` estendida · `ui_action_plans` com `source` e
`assistedEntryId`.

**Escopo residual, ainda devido:**

- [ ] coluna `monthly_audit_id` com FK a `evaluations`;
- [ ] relaxar o CHECK para aceitar a terceira origem — hoje `source = 'monthly_audit'` é **recusado**,
      deliberadamente: aceitá-lo sem coluna de origem seria um plano afirmando vir da Auditoria
      Mensal sem que o banco pudesse verificar de qual;
- [ ] **teste dirigido do O-11**: plano em `completed`, criador tenta validar → recusa **por regra de
      ator**, não por máquina de estados (teste 31).

**Critério de saída — verificado** (o residual foi entregue na Fase 5, 02/08/2026)
- [x] `source` inconsistente com as FKs → recusado pelo CHECK (teste 6 de migração);
- [x] planos existentes com `source = 'legacy'` **por default de coluna**, sem `UPDATE` semântico;
- [x] os estados de D6 preservados; anti-auto-validação intacta — provada sobre um plano da Gestão
      Assistida **e** sobre um plano da Auditoria Mensal;
- [x] `overdue` segue derivado; gravação manual recusada (teste 36);
- [x] **teste dirigido do O-11 — FECHADO na Fase 5**, em duas formas: com o plano em `done` (a
      transição que a máquina de estados **permite**), o criador é recusado por **regra de ator**
      com a mensagem literal *"apenas coordenacao, regional ou administracao registram validado"*;
      e um coordenador que criou o plano recebe *"quem criou o plano nao pode valida-lo"*. Nenhuma
      regra foi enfraquecida para o teste passar.

> ⚠️ **A coluna prevista era `monthly_audit_id`, e estava errada.** Corrigida por
> [ADR-135-003, D-Q](ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md): seria redundante com
> `action_plans.evaluation_id`, que existe desde `0001:334`, e não diria **qual não conformidade**
> originou o plano. A coluna entregue é `monthly_criterion_answer_id`, FK à **resposta do
> critério**, e o vínculo é **N:1** — uma não conformidade de processo pode exigir mais de uma ação.

---

### Fase 5 — Auditoria Mensal por competência ✅ **CONCLUÍDA** (02/08/2026)

> **Entregue VERTICAL**, e absorvendo o residual da Fase 4. Decisão registrada em
> [ADR-135-003](ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md).
>
> **Quatro lacunas do plano anterior foram corrigidas ANTES da migration:**
> `evaluation_answers.item_id` é `not null` e só responde a `audit_items`; não havia onde responder
> aos critérios materializados; `template_version_id` era `not null` nos dois lugares; e
> `monthly_audit_id` seria redundante com `evaluation_id`.

**Entregue de fato:** migrations **0042, 0043 e 0044** · `app.evaluation_model` com default que
preserva a história · `app.criterion_answer_status` (quatro valores, sem o amarelo) ·
`evaluation_criteria`, `evaluation_criterion_answers`,
`evaluation_criterion_answer_evidence` · `app.monthly_audit_score` (provisória, **A-10**) ·
`action_plans.monthly_criterion_answer_id` + CHECK com as três origens · RPCs
`start_monthly_audit`, `save_criterion_answer`, `submit_monthly_audit`, `get_monthly_audit`,
`list_monthly_audits`, `get_monthly_audit_snapshot` · `validate_evaluation` com ramo mensal ·
domínio, policy, repositórios e a tela `MonthlyAuditScreen` · **1818 testes verdes** (eram 1651).

**Critério de saída — verificado** (`src/db/monthly_audit.integration.test.ts`, 76 casos)

- [x] **auditoria de competência PASSADA registrável pelo caminho oficial — fecha o O-06**: a
      competência vem por parâmetro, e `2025-11` foi criada com `period_start`/`period_end`
      corretos;
- [x] uma auditoria oficial por parceiro por competência, com **índice único parcial no banco** —
      o insert direto de uma segunda é recusado. O legado **não** herda a restrição;
- [x] só entram configurações regionais publicadas, vigentes, ativas, com
      `include_in_monthly_audit`, da região da operação, e com critério publicado e ativo;
- [x] critérios **materializados** na criação; publicar nova versão do critério depois **não muda**
      a auditoria (teste 32);
- [x] aprovação gera snapshot imutável, com `evaluation_model = 'monthly_criteria'` e
      `template_version_id` nulo;
- [x] **nenhum `audit_item` nem template artificial criado** — provado por contagem antes e depois;
- [ ] **40 códigos de integridade**: dívida **não remedida** — a medição é contra staging, que
      segue fora de alcance por decisão. O que foi provado localmente é que o caminho legado é
      **literalmente a mesma função** (wrapper por `pg_get_functiondef`) e que
      `official_audit_report.integration.test.ts` continua verde.

**Regra provisória declarada — pontuação (A-10).** Critérios não têm peso: os dez campos de D4 não
incluem um. `evaluations.score` da auditoria mensal guarda **proporção simples de conformidade**,
com `nao_aplicavel` fora do numerador e do denominador. **Não é ponderação e não é o Índice de
Excelência**, e a tela diz isso.

**Fronteira do relatório.** `get_official_audit_report_data` **recusa** o modelo novo citando
**A-05**, em vez de devolver um relatório sintaticamente válido e vazio. A interface **não oferece**
PDF para a Auditoria Mensal, e explica a ausência em texto.

---

### Fase 6 — Autorização server-side com escopo regional ✅ **CONCLUÍDA** (02/08/2026)

> **Entregue como AUDITORIA, não como construção.** `app.can_manage_catalog` já existia desde a
> Fase 1 e já guardava as 14 RPCs de catálogo. O que faltava era **provar** — sobre a superfície
> inteira, e do lado do banco.

**Entregue de fato:** inventário extraído do **catálogo de um PostgreSQL real** (`pg_proc`,
`pg_class`, `pg_policies`, `information_schema`), não do texto das migrations · 83 casos novos em
`src/db/authorization_surface.integration.test.ts` · migration **0045** com a correção mínima de
dois defeitos reais · **1901 testes verdes** (eram 1818).

**Três achados, nenhum vindo de leitura de documentação — os três nasceram como teste vermelho:**

| # | Achado | Estado |
|---|---|---|
| **O-16** | os *wrappers* de 0044 (`submit_evaluation`, `get_official_audit_report_data`) liam `evaluation_model` **antes** de verificar escopo. Varrer UUIDs distinguia inexistente de auditoria mensal alheia, revelando existência **e** modelo | ✅ **0045** |
| **O-17** | `authenticated` retinha `REFERENCES` e `TRIGGER` nas seis tabelas de catálogo (0036–0038, que revogaram por lista em vez de `revoke all`). **Medido:** um GC cria gatilho em `public.themes` | ✅ **0045** |
| **O-18** | `submit_evaluation`/`remove_evidence`/`reserve_evidence_upload` distinguem `avaliacao inexistente` de `sem permissao` | ⚠️ **herdado de 0006/0025/0027/0028, registrado, NÃO corrigido** |

**Critério de saída — verificado**

- [x] **testes negativos 19–36 verdes**, com mensagem literal registrada — Matriz §8;
- [x] ordem `ator → papel → escopo → estado → efeito` conferida nas 25 RPCs novas — **duas violações
      encontradas e corrigidas** (O-16);
- [x] regional editando fora da própria região → fora do escopo (testes 23, 24), e editando
      **dentro** dela → permitido: a recusa não é indiscriminada;
- [x] zero vazamento de escopo nos quatro papéis, em **duas regiões espelhadas** — com um catálogo
      só, *"não vazou"* seria indistinguível de *"não havia o que vazar"*;
- [x] nenhuma `security definer` sem `search_path` fixo — **121 verificadas, zero exceções**;
- [x] nenhuma RPC nova executável por `anon` ou `PUBLIC`; nenhuma tabela nova com grant de `anon`;
- [x] **escrita direta recusada** nas onze tabelas novas, no próprio escopo e para o ADMIN;
- [x] **zero efeito lateral**: cada recusa comparada contra um retrato de 30 campos do banco;
- [x] **os 18 testes originais continuam verdes** — 34 arquivos de banco, 751 casos;
- [x] typecheck limpo; export web sem erro, bundle em 1.3.4 e sem segredo privilegiado.

**Ressalva nomeada.** O **teste 35** só foi medido na forma disponível: `export_dataset` é da Fase 9
e **não existe**. O que foi provado é que as RPCs de listagem recusam operação fora do escopo e que
a leitura direta sob RLS devolve conjunto vazio. **A forma canônica do teste 35 continua devida à
Fase 9.**

---

### Gate 0 — Achado **O-18** ✅ **FECHADO** (02/08/2026)

> Não é uma fase do plano original: é a dívida que a Fase 6 registrou e não pôde pagar, e que
> precisava ser paga **antes** da Fase 7 — a Fase 7 transforma `start_evaluation` em wrapper, e
> empilhar wrapper sobre um caminho que ainda vaza existência só afastaria o conserto.

**Entregue:** migration **0046** · `submit_evaluation`, `remove_evidence` e
`reserve_evidence_upload` passam a responder `avaliacao inexistente ou fora do escopo`, com
`insufficient_privilege`, tanto para UUID inexistente quanto para UUID fora do alcance.

A frase **não é nova**: é a de 0031 e 0035. E a fronteira uniformizada é o **escopo**, e só ele —
quem alcança a operação já enxerga a linha por RLS, e continua recebendo `sem permissao` quando não
é o autor.

**Wrapper, nunca cópia.** As duas RPCs de evidência foram **movidas** para `app.*_legacy` por
`pg_get_functiondef`. `app.submit_evaluation_legacy` e `app.official_audit_report_legacy` **não
foram tocadas** — RT-01 intacto.

**Critério de saída — verificado** (`src/db/legacy_error_uniformity.integration.test.ts`, 25 casos)
- [x] teste **vermelho** anterior documentado — 10 de 25 falhando no commit `0966afd`;
- [x] as três RPCs, com UUID inexistente e com UUID alheio, dão a **mesma frase e o mesmo SQLSTATE**;
- [x] auditoria **mensal** alheia indistinguível do inexistente — o modelo deixou de ser observável;
- [x] **zero efeito lateral** em toda recusa, contra um retrato de 14 campos;
- [x] o caminho autorizado **não muda**: envio, fronteira de modelo, mensagens de estado e de item;
- [x] as cinco guardas de 0025/0027 conferidas **dentro** do `prosrc` da função legada.

---

### Fase 7 — Cutover parametrizável ✅ **CRIADO E NÃO ATIVADO** (02/08/2026)

**Entregue:** migration **0047** (e não 0043 — a numeração real seguiu o que as fases anteriores
consumiram) · `public.system_settings` com `key`, `value jsonb`, `client_readable`, `description`,
`updated_at`, `updated_by` · semente `weekly_audit_cutover_date` = **JSON null** ·
`app.weekly_audit_cutover_date()` · `public.get_system_settings()` ·
`public.admin_set_weekly_audit_cutover(date, boolean)` · `start_evaluation` transformada em
**wrapper**.

**Duas decisões de desenho, registradas:**

1. **"sem data" é JSON null, não SQL null.** `value` é `not null` de propósito, e um CHECK por chave
   garante que o valor do cutover só possa ser JSON null ou `YYYY-MM-DD`. Data malformada **não
   chega a existir** na tabela, e portanto não chega à guarda;
2. **`client_readable`** existe para que *"leitura mínima"* seja verificável pelo banco em vez de
   por disciplina — a mesma disciplina que o **O-17** mostrou não bastar. A policy é
   `using (client_readable)`, e chave futura nasce invisível porque o default é `false`.

**A guarda NÃO bloqueia ciclo semanal reaproveitável.** `start_evaluation` é idempotente; sem essa
condição, ativar o cutover deixaria os rascunhos semanais **órfãos** — e D5 dá aos quatro drafts de
produção a saída *"concluir como legado"*, que só existe se o rascunho continuar abrindo.

**Critério de saída — verificado** (`src/db/weekly_audit_cutover.integration.test.ts`, 38 casos)
- [x] com data nula, `start_evaluation` idêntico ao atual, **inclusive na idempotência**;
- [x] com data futura, `weekly` permitido; com data vencida **ou de hoje**, recusado com mensagem
      nominal;
- [x] `monthly` **nunca** afetado; Gestão Assistida e Auditoria Mensal por critérios intocadas;
- [x] histórico semanal legível; rascunho e devolvida continuam abrindo;
- [x] escopo **antes** do cutover: quem não alcança a operação recebe `operacao fora do escopo`;
- [x] não-ADMIN não configura; escrita direta recusada **até para o ADMIN**; `anon` e `PUBLIC` fora;
- [x] `updated_by` derivado por gatilho; trilha com o valor de antes e o de depois;
- [x] **cutover DESATIVADO ao fim**, provado **duas vezes**: dentro da suíte e por script
      independente sobre as 47 migrations.

---

### Fase 8 — Ponderação, Dashboard e Matriz ✅ **CONCLUÍDA** (02/08/2026)

**Entregue:** migration **0048** · `public.region_weightings` versionada, com vigência, **sem uma
linha semeada** · `catalog_save_region_weighting_draft` · `catalog_publish_region_weighting` ·
`get_weighting_status` · `get_dashboard_aggregates` · `get_matrix_dataset` · domínio, policy,
repositório, adapters e a tela `ManagementDashboardScreen`.

**Os quadrantes foram INVENTARIADOS, não inventados.** Os limites saíram de
`src/domain/dashboard/performanceMatrix.ts` e de `app.score_traffic_light` (0004): processo bom ⟺
semáforo verde (≥ 80); desempenho bom ⟺ todos os indicadores medidos no alvo, com um vermelho
vencendo. Os cinco nomes de D10 preservados letra por letra. O que muda é **de onde** cada eixo vem.

> ⭐ **PENDÊNCIA NOVA: A-11.** O eixo de **desempenho** não tem número definido em documento
> nenhum — a Gestão Assistida produz *status*, não nota. Adotado o mesmo caminho que a Fase 5
> adotou para A-10: a **mesma forma** de proporção simples (`conforme / (conforme + atencao +
> nao_conforme) × 100`, com `sem_dado` fora dos dois lados), declarada **PROVISÓRIA** e registrada
> como pendência empresarial nova. **Não é decisão tomada.** A proveniência viaja em toda resposta
> com `proporcao-simples-desempenho/A-11-pendente` e as três pendências abertas nomeadas.

**Critério de saída — verificado** (`src/db/dashboard_matrix_weighting.integration.test.ts`, 55 casos)
- [x] sem ponderação → dois eixos + **“Ponderação não configurada”**, **sem** índice;
- [x] pesos 99 e 101 recusados pela RPC **e** pelo CHECK, inclusive contra superusuário;
- [x] módulo ausente → dados insuficientes, **sem renormalizar** — medido com um parceiro que teria
      índice 100 se houvesse renormalização;
- [x] cinco quadrantes preservados, com os limites de 0004 conferidos no próprio banco;
- [x] agregações **server-side**, com ordenação explícita e determinismo medido;
- [x] filtro alheio recusado com a frase do inexistente; filtro **parcialmente** alheio devolve o
      permitido; filtro desconhecido recusado **por nome**;
- [x] **cada gráfico com alternativa tabular acessível**, sempre presente — não um modo que se ativa.

---

### Fase 9 — Exportação CSV/XLSX ✅ **CONCLUÍDA** (02/08/2026)

**Entregue:** migration **0049** · `export_dataset(module, filters)` como **porta única**, com
quatro corpos internos · escritores `csv.ts` e `xlsx.ts` · `ExportRepository` · fluxo mínimo de
exportação no painel gerencial.

**Colunas tipadas são segurança, não estética.** Cada dataset declara `type ∈ {text, number, date,
boolean}`: é o que permite o XLSX preservar tipos **e** a neutralização de CSV injection aplicar-se
somente a `text` — sem o tipo, prefixar todo campo iniciado por `-` corromperia todo número negativo
real.

**Critério de saída — verificado** (`export_dataset.integration.test.ts` 33 casos ·
`exportWriters.test.ts` 39 casos)
- [x] quatro módulos exportáveis com os oito filtros; módulo e filtro desconhecidos recusados **por
      nome**, e filtro com tipo errado também;
- [x] abas exatas e **nesta ordem**: `Gestao_Assistida`, `Auditoria_Mensal`, `Planos`, `Resumo`,
      `Filtros_Aplicados` — módulo ausente **não some**, vira aba com aviso;
- [x] **CSV injection neutralizada** em `=` `+` `-` `@`, inclusive atrás de espaço, tabulação,
      quebra de linha e caractere de controle — e **sem corromper** número negativo, data ou
      booleano;
- [x] **zero fórmulas e zero hyperlinks** no XLSX, medidos por varredura de todas as partes do zip;
      content-type de pasta **sem macros**;
- [x] escopo e filtros **server-side** — **teste 35 na forma canônica**, nos quatro módulos: parceiro
      fora do escopo responde como o inexistente, zero linhas voltam com o erro, e o retrato de nove
      campos do banco fica idêntico;
- [x] nenhum segredo no arquivo: sem URL assinada, token, e-mail ou caminho de objeto; solicitante
      pelo **nome de exibição**.

---

### Fase 10 — Interface, relatório mensal e acessibilidade ✅ **CONCLUÍDA** (02/08/2026)

> **A Fase 10 cresceu além do acabamento.** As quatro pendências que travavam o produto —
> **A-05, A-06, A-10 e A-11** — foram confirmadas pelo proprietário em 02/08/2026, e a fase passou
> a incluir congelá-las no código. Registradas em
> [ADR-135-004](ADR-135-004-PONTUACOES-RESUMO-E-RELATORIO-MENSAL.md), **escrito antes de qualquer
> migration**.

**Entregue de fato:** migrations **0050** e **0051** · regra definitiva de processo (A-10) com a
borda do `coalesce` corrigida · regra definitiva de desempenho (A-11), 100/50/0 ponderada pelo peso
materializado · Resumo definitivo (A-06) com doze itens e sete proibições ·
`get_monthly_audit_report_data` · `MONTHLY_REPORT_FORMAT_VERSION = 1.3.5` com a **1.3.3
preservada** · modelo, gerador de PDF e ordem de exportação do relatório mensal · três blocos
visualmente separados · terminologia D8 corrigida onde ainda escorregava · auditoria integral de
acessibilidade como teste · **2305 testes verdes** (eram 2145).

**Critério de saída — verificado**

- [x] **O-12 fechado nos DOIS blocos.** O bloco legado ainda listava avaliação aprovada **sem rota
      nenhuma** — o padrão exato do achado. Agora todo item listado tem ação;
- [x] teste de UI: todo ciclo e toda competência listada têm rota de abertura;
- [x] nenhum controle sem `accessibilityRole` + `tabIndex` + `focusable` — a garantia passou a morar
      em `AppButton`, e não dispersa pelas telas, que foi o que produziu o **O-13**;
- [x] os três blocos visualmente distintos, com faixa e borda de cor própria;
- [x] terminologia D8 aplicada **e testada**;
- [x] **`REPORT_FORMAT_VERSION` 1.3.3 preservada**, e A-05 decidida e registrada **antes** do código;
- [x] `0001`–`0049` idênticas por blob; cutover **nulo** e `region_weightings` **vazia**, provados
      por script independente.

**Gate manual declarado, e não cumprido:** contraste em pixel, ordem de foco percebida, navegação
sem mouse, as três larguras, PDF em leitor real e XLSX no Excel real. Pacote pronto no checkpoint.

---

### Fase 11 — Homologação controlada e release candidate ⛔ **NÃO INICIADA** (NO-GO, 02/08/2026)

> **NO-GO, e a razão é objetiva.** Não existe project ref identificado como
> homologação/disposable/temporário em nenhuma configuração local ou documento. O único ref
> vinculado (`supabase/.temp/project-ref`) é o **staging congelado**, que não pode ser mutado.
>
> Parou-se depois da Fase 10. Nenhum projeto foi criado, nenhum ambiente foi improvisado, o staging
> **não foi consultado**. A ausência do ambiente **não invalida a Fase 10**.

**Entrega:** homologação em ambiente remoto **separado** · fixture sintética nova · os quatro papéis
em runtime real · CSV, XLSX e PDF em aplicativo real · release candidate congelado · bump para
**1.3.5**.

**Bloqueio de entrada:** um project ref de homologação, distinto de `qcixfsdyfpankpatbays` e de
`plnbgdabciwygsmnyddy`, com autorização explícita do proprietário.

**Critério de saída:** os 25 gates do escopo integrado. Prompt autônomo em
`PROMPT-PROXIMA-SESSAO.md`.

---

### Fase 12 — Produção e documentação pública

**Não pertence a esta sessão nem à Fase 11.** Exige autorização literal do proprietário sobre um
release candidate homologado, e o plano selado da Fase 11.

**Entrega:** merge em `main` · migrations em produção · deploy no domínio produtivo · atualização
dos **seis artefatos públicos** · decisão nominal dos quatro drafts · backfill real · ativação do
cutover, se e quando A-02 for definida.

---

## 3. Dependências

```
Fase 1 (catálogo)
  ├─> Fase 2 (critérios) ──> Fase 5 (auditoria mensal)
  └─> Fase 3 (gestão assistida) ──> Fase 4 (planos)
                                      │
        Fases 2,3,4,5 ────> Fase 6 (autorização)
                                      │
                              Fase 7 (cutover)
                                      │
                     Fases 8, 9 (dashboard, exportação)
                                      │
                              Fase 10 (interface)
                                      │
                              Fase 11 (homologação)
```

**Caminho crítico:** 1 → 2 → 5. Fases 3 e 4 correm em paralelo a 2. **Fase 6 exige 2, 3, 4 e 5
prontas** — autorização se aplica sobre superfície existente.

## 4. Bloqueios de entrada

| # | Bloqueio | Bloqueia | Como sair |
|---|---|---|---|
| ~~**A-08**~~ ✅ | ~~Temas e indicadores são globais ou por região?~~ | ~~Fase 1 e Fase 6~~ | **RESOLVIDA em 01/08/2026** — modelo híbrido, [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md). Bloqueio levantado |
| **A-01** | Regra de status para `target_band` | Fase 3 (parcial) | Fase 3 pode entregar com falha explícita; a regra fica pendente |
| **A-04** | Pesos por região | Fase 8 (parcial) | Fase 8 entrega o mecanismo; sem pesos, “Ponderação não configurada” |
| **A-03** | Decisão nominal dos 4 drafts de produção | Ativação do cutover | Decisão individual, registrada na trilha |
| **A-02** | Data de cutover | Ativação | Estrutura pronta na Fase 7, desativada |
| **A-05** | Nova `REPORT_FORMAT_VERSION` | Novo formato de PDF | 1.3.3 permanece para o histórico |
| **BACKFILL** 🔴 | **Catálogo legado sem configuração regional** | **Ativação do cutover** | Mapear e publicar, região a região. Ver §7 abaixo |
| **40 códigos** | Remedição contra staging | Homologação | Devida à primeira sessão com staging liberado |
| **Fixture** | Congelada | Homologação remota | Frase de liberação do proprietário |

## 7. Backfill do catálogo legado — PENDENTE, bloqueia o cutover

Estado de fato, medido no código em 01/08/2026:

- os indicadores existentes permanecem **`scope_kind = 'global'`, `region_id` nulo**;
- **nenhum** possui configuração operacional regional;
- **nenhuma** participação em módulo foi ativada — nem Gestão Assistida, nem Auditoria Mensal;
- **nenhum backfill foi executado**, local ou remotamente.

Isso é o comportamento **correto** da decisão **D-G** do ADR: existir no catálogo não ativa nada; a
adoção é ato explícito e publicado de cada região.

E é também uma pendência real: **o cutover não pode ocorrer antes de as configurações regionais
serem mapeadas e publicadas**. Sem elas, desligar a auditoria semanal deixaria as regiões sem
indicador operável nenhum.

> **Nada disso pode ser inventado.** Tema, meta, tolerância, peso, ordem, flags de módulo e
> critérios são decisão empresarial de cada região. Um backfill que os arbitrasse produziria uma
> operação que ninguém aprovou, com aparência de configurada. O caminho é mapeamento nominal,
> região a região, com publicação explícita — trabalho a ser planejado e testado à parte.

> **A-08 é o único bloqueio que impede começar.** Os demais permitem entregar com o comportamento
> conservador já especificado.

## 5. Testes por fase

Cada fase entrega **teste positivo**, **teste negativo** e **teste de não-regressão**.

Invariantes verificados **em toda fase**:

1. **40 códigos de integridade idênticos**;
2. **18 testes negativos originais verdes**;
3. RLS forçada; `anon` sem grants nas tabelas novas;
4. gatilhos habilitados ao final;
5. nenhum `UPDATE`/`DELETE` retroativo em tabela histórica;
6. `overdue` derivado; anti-auto-validação intacta.

## 6. Commits

Pequenos, coerentes, um assunto cada. Prefixos: `docs:`, `feat:`, `fix:`, `test:`, `chore:`.

**Autoria exclusiva** `djrodrigocpu-debug <djrodrigocpu@gmail.com>`. **Nenhuma menção a IA** em
mensagem alguma. Sem merge, sem push de `main`, sem reescrita de histórico.

**Registrar cada fase concluída no worklog append-only do checkpoint** — a cada etapa, nunca só no
fim (lição L-01).
