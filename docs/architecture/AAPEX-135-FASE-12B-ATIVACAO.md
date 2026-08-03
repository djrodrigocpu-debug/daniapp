# AAPEx 1.3.5 — Fase 12-B: decisões empresariais e ativação operacional

> # BACKFILL CONCLUÍDO · GESTÃO ASSISTIDA ATIVADA
>
> As decisões pendentes foram tomadas pelo responsável em 02/08/2026 e registradas em
> [`AAPEX-135-DECISOES-EMPRESARIAIS.md §9`](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md).
> O backfill do catálogo legado foi executado em `plnbgdabciwygsmnyddy` e é
> **comprovadamente idempotente**. Nenhum valor empresarial foi arbitrado: metas,
> tolerâncias e pesos são **cópia bit a bit** do catálogo já publicado e em uso.
>
> **Cutover permanece desativado, ponderação permanece vazia, os quatro rascunhos
> permanecem intactos** — por decisão expressa, não por omissão.

Data: 02/08/2026 · `main` `e964488` · **nenhuma alteração de código**

---

## 1. Decisões aprovadas

Resposta consolidada do responsável: `T: A ; M: A ; A-04: A ; A-02: A ; A-03: A`

| ID | Decisão | Efeito |
|---|---|---|
| **T** | Um tema global único, código `GERAL` | Satisfaz a obrigatoriedade estrutural sem arbitrar taxonomia |
| **M** | Somente Gestão Assistida | Auditoria Mensal fica desligada até haver critérios |
| **A-04** | Ponderação **não** publicada | Índice consolidado não é calculado; servidor não inventa |
| **A-02** | Cutover **desativado** | Auditoria Semanal segue integralmente operável |
| **A-03** | Rascunhos **como estão** | Único caminho que não fabrica dado nem cria funcionalidade |

### O que eu não perguntei, e por quê

Três coisas que pareciam decisão e não eram:

- **Metas, tolerâncias e pesos** já estavam publicados em `indicator_versions` e em uso pela
  Auditoria Semanal. Levá-los para a configuração regional **preserva o comportamento**; pedir
  que fossem redigitados seria criar risco de divergência sem criar informação.
- **A-01** (`target_band`) é **inerte**: 10 `higher_better` + 3 `lower_better`, zero `target_band`.
- **Os 40 códigos** e a **carga de dados** não são necessários à ativação. Não foram criados.

---

## 2. Matriz decisão → tabela → efeito → rollback

| Decisão | Tabela / campo | Efeito | Rollback |
|---|---|---|---|
| **T** | `themes` (1), `theme_versions` (1) | tema `GERAL` global publicado | inativar por `catalog_set_theme_lifecycle` |
| **M** | `indicator_regional_config_versions.include_in_assisted_management = true`, `.include_in_monthly_audit = false` | os 13 entram na Gestão Assistida; nenhum na Mensal | nova versão da configuração com as flags invertidas |
| **BACKFILL** | `indicator_regional_configs` (13), `indicator_regional_config_versions` (13) | catálogo legado ganha configuração operacional na região RPS | inativar as configurações; a Auditoria Semanal nunca dependeu delas |
| **A-04** | `region_weightings` | **nada escrito** | n/a |
| **A-02** | `system_settings.weekly_audit_cutover_date` | **nada escrito**, segue JSON null | n/a |
| **A-03** | `evaluations` | **nada escrito** | n/a |

> **Reverter é inativar, não apagar.** Os gatilhos de 0036/0037 impedem excluir versão
> publicada — de propósito. O modelo de catálogo foi desenhado para nunca reescrever
> histórico, e o rollback correto respeita isso.

---

## 3. Backup de pré-ativação

`E:\AACE_Backups\producao-pre-135-ativacao-20260802-2146` · **cópia espelho verificada** em
`C:\Users\Asus\Documents\AACE_Backups_espelho\producao-pre-135-ativacao-20260802-2146`

| | |
|---|---|
| Momento | depois de `0001–0051`, **antes** da primeira escrita da 12-B |
| Arquivos | **66** (65 JSON + `README_RESTORE.txt`), com `SHA256SUMS.txt` |
| Tabelas | **45** · **193 linhas** |
| Verificação | hash, tamanho, JSON válido e contagem **relidos do disco**, nas **duas** cópias |
| Backup anterior | `producao-pre-135-20260802-2013` reconferido: **continua íntegro** |

A diferença entre os dois backups é exatamente **1 linha** — a semente
`weekly_audit_cutover_date` criada pela 0047. Os dois são preservados: o primeiro reverte a
1.3.5 inteira, o segundo reverte apenas a ativação.

**PITR continua desabilitado e não há backup físico.** Estes exports são o único recurso.

> **Um defeito do meu verificador, corrigido:** ele fazia `JSON.parse` de todo arquivo do
> pacote e acusava `README_RESTORE.txt` como "JSON inválido". O backup estava certo; a
> checagem é que estava errada. Passou a parsear apenas os `.json`.

---

## 4. Simulação antes de gravar

O mesmo script calcula o plano nos dois modos, então **simulação e execução não podem
divergir**. A simulação devolveu:

```
JA CONFIGURADOS: 0   A CRIAR: 13      TEMA 'GERAL': sera criado
themes 0->1 · theme_versions 0->1 · configs 0->13 · versoes_config 0->13
region_weightings 0->0 · audit_criteria 0->0 · evaluations 4->4 · cutover null->null
```

**Guardas de sanidade no próprio script**, que abortam antes de qualquer escrita: se houver
mais de uma região (o plano aprovado cobre a região única) ou se os indicadores ativos
publicados não forem exatamente 13.

---

## 5. Execução

Tudo pelas RPCs canônicas (`catalog_create_theme`, `catalog_add_theme_version`,
`catalog_publish_theme_version`, `catalog_save_regional_config_draft`,
`catalog_publish_regional_config_version`), sob a conta do **proprietário**, que autorizou a
ativação — a trilha do catálogo registra `created_by`/`published_by` reais. **Nenhum SQL
manual contornou as regras.**

| Indicador | Meta | Tolerância | Peso | Ordem |
|---|---:|---:|---:|---:|
| IND-001 BL na Renovação | 30 | 10 | 5 | 1 |
| IND-002 Domínio de Portfólio | 85 | 10 | 4 | 2 |
| IND-003 Venda de SDs | 25 | 15 | 5 | 3 |
| IND-004 Venda de Avançadas | 100 | 15 | 5 | 4 |
| IND-005 Convergência | 35 | 10 | 5 | 5 |
| IND-006 Churn | 1 | 20 | 5 | 6 |
| IND-007 % Quebra | 10 | 15 | 5 | 7 |
| IND-008 Delta Ticket | 0 | 10 | 4 | 8 |
| IND-009 Renovação | 82 | 8 | 5 | 9 |
| IND-010 Aparelhos | 100 | 15 | 3 | 10 |
| IND-011 Gestão de Prospecção | 90 | 10 | 5 | 11 |
| IND-012 Gestão de Funil | 3 | 15 | 5 | 12 |
| IND-013 Taxa de FPD | 15 | 18 | 5 | 13 |

### Contagens antes → depois

| Tabela | Antes | Depois |
|---|---:|---:|
| `themes` · `theme_versions` | 0 · 0 | **1 · 1** |
| `indicator_regional_configs` | 0 | **13** |
| `indicator_regional_config_versions` | 0 | **13** |
| `region_weightings` | 0 | **0** |
| `audit_criteria` | 0 | **0** |
| `evaluations` · `evaluation_answers` | 4 · 48 | **4 · 48** |
| `official_snapshots` · `action_plans` | 0 · 1 | **0 · 1** |
| `assisted_cycles` | 0 | **0** |
| `weekly_audit_cutover_date` | null | **null** |

---

## 6. Provas

### A que mais importa — nada foi inventado

```
total 13 · identicos 13 · divergentes 0
```

Comparação campo a campo entre o que foi gravado na configuração regional e o que já estava
publicado em `indicator_versions`. **Treze de treze idênticos.**

### Integridade referencial

| | |
|---|---|
| Apontam para versão de indicador **publicada e vigente** | **13/13** |
| Apontam para versão de tema **publicada** | **13/13** |
| Configurações sem versão · versões órfãs · duplicadas | **0 · 0 · 0** |

### Idempotência

Reexecução em simulação depois da gravação:

```
JA CONFIGURADOS: 13   A CRIAR: 0   TEMA 'GERAL': ja existe
IDEMPOTENTE: nada a fazer. Uma nova execucao produziria ZERO alteracoes.
```

### A Auditoria Semanal continua operável

| | |
|---|---|
| `weeklyAuditClosed` | **false** |
| `weeklyAuditCutoverDate` | **null** |
| Itens do checklist semanal | **16**, intactos |
| Os 4 rascunhos | **intactos** — 2 `green`, 45 `not_evaluated`, 1 `not_applicable` |

### Escopo, RLS e autorização

| Prova | Resultado |
|---|---|
| GC enxerga as 13 configurações e o tema | ✅ |
| GC enxerga **1** operação · Admin enxerga **14** | ✅ |
| `anon` lê `indicator_regional_config_versions` / `theme_versions` | ✅ `42501 permission denied` |
| GC publica configuração regional | ✅ recusado |
| GC cria tema | ✅ `sem permissao para administrar o catalogo desta regiao` |
| RLS habilitada e **forçada** | **45/45** |
| `anon` com grant nas tabelas novas | **0** |
| Gatilhos desabilitados | **0** de 71 |

### Ponderação — o servidor não inventa

```
get_weighting_status() -> configured: false · "Ponderacao nao configurada"
```

### Gate técnico

| | |
|---|---|
| Suíte | **2.305 verdes em 136 arquivos** — sem regressão |
| `tsc --noEmit` | ✅ |
| `migration list` | **51/51, zero divergência** |
| Arquivos de código alterados | **nenhum** — logo, sem rebuild e sem mudança de bundle |

---

## 7. O que NÃO foi exercitado, e por quê

**A projeção do ciclo da Gestão Assistida em produção.** `get_assisted_cycle` devolve nulo
porque nenhum ciclo está aberto, e abrir um criaria dado operacional em nome de um gerente de
canal real — que ninguém pediu. A lógica de projeção está coberta pela suíte automatizada
contra PGlite com as mesmas migrations; **em produção, quem a exercita é o smoke humano.**

Fica declarado como **não exercitado**, não como verde.

---

## 8. Pendências reais remanescentes

| Pendência | Estado | O que falta |
|---|---|---|
| **Critérios da Auditoria Mensal** | 0 em produção | definição empresarial dos critérios por indicador/região |
| **M = B** (ligar a Mensal) | bloqueada | depende dos critérios acima |
| **A-04** (pesos) | não configurada, por decisão | os dois pesos, quando fizer sentido medir os dois eixos |
| **A-02** (cutover) | desativado, por decisão | confiança operacional na Gestão Assistida com dado real |
| **A-03** (rascunhos) | em rascunho, por decisão | migration nova, se um dia se quiser cancelar/arquivar formalmente |
| **A-07** | aberta | sem mudança |
| **Gate 17 · Etapa B** | devido | leitor de tela, dívida conhecida da 1.3.5 |
| **Os 40 códigos** | não tratados | exigiriam o staging congelado |

**A ordem obrigatória foi respeitada:** `BACKFILL → A-04 → A-02 → A-03`. O backfill foi
executado; as três seguintes foram decididas como *não ativar*, o que é uma decisão tomada, e
não uma etapa pulada.
