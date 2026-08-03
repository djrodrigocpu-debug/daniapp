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

## 6-A. Uma região, três unidades — confirmado pelo responsável

Confirmação expressa em 02/08/2026: **não existem regiões separadas; tudo é a mesma região.**

| Unidade | Região | Parceiros |
|---|---|---|
| `PR CAPITAL` | `RPS` | 4 |
| `PR INTERIOR` | `RPS` | 6 |
| `SANTA CATARINA` | `RPS` | 4 |

**Paraná e Santa Catarina são nomes de UNIDADE, nunca de região.** Isso importa porque a
configuração operacional da 1.3.5 tem chave `(region_id, indicator_definition_id)` — é **por
região**. Logo, o único conjunto de 13 configurações publicado atende **as 14 operações**, no PR
e em SC igualmente. Configurar "por estado" criaria estrutura que o modelo não tem.

### O alcance de cada papel, medido em produção

| Papel | Operações | Configurações | Consultar ciclo |
|---|---:|---:|---|
| **Admin** | **14/14** | **13/13** | **global** |
| Regional | 14/14 | 13/13 | permitido |
| Coordenador | 4 | 13/13 | só na coordenadoria |
| Gerente de Canal | 2 | 13/13 | só nos seus parceiros |

> **O Administrador vê tudo, mas não lança nada na Gestão Assistida.**
> `app.is_assisted_operator` exige papel `channel_manager` **e** vínculo com a operação;
> `app.is_admin()` **deliberadamente não é atalho**, e isso é testado. Abrir, registrar e fechar
> ciclo é exclusivo do GC responsável — leitura por `app.has_operation_access`, execução por
> `app.is_assisted_operator`. Está na Matriz de Permissões §3.
>
> **Consequência que gera falso defeito:** um admin que abra a ficha de um parceiro vê o bloco
> da Gestão Assistida **vazio enquanto nenhum GC tiver aberto o primeiro ciclo**. Não é falha de
> escopo nem de backfill. Fazer o admin lançar seria a regra de negócio da nota ¹ da matriz —
> *"ainda não declarada, não presumir"* — e portanto **mudança funcional**, fora da 12-B.

---

## 7. O que NÃO foi exercitado, e por quê

**A projeção do ciclo da Gestão Assistida em produção, pela interface, com um Gerente de
Canal.** `get_assisted_cycle` devolve nulo porque `assisted_cycles = 0`, e só o GC responsável
pode abrir o primeiro ciclo.

**Limitação declarada pelo responsável em 02/08/2026:** as credenciais dos Gerentes de Canal
não foram localizadas, e o responsável **não autorizou** redefinir senha de usuário real nem
criar conta artificial em produção apenas para o teste. A decisão é acertada — as duas
alternativas eram pior do que a lacuna: uma altera credencial de terceiro, a outra injeta dado
sintético em base real.

**O que ficou provado no lugar, e o que não ficou:**

| Camada | Situação |
|---|---|
| Regra de projeção, cálculo e status | ✅ suíte automatizada, 2.305 testes contra PGlite com as mesmas 51 migrations |
| Autorização e alcance dos quatro papéis em produção | ✅ por impersonação de papel, com as contas reais |
| Configuração visível ao GC em produção | ✅ 13/13 lidas com as claims de um GC real |
| **Abertura e preenchimento de ciclo pela interface, em produção** | ❌ **NÃO EXERCITADO** |

Fica declarado como **não exercitado**, não como verde. **O primeiro ciclo real de Gestão
Assistida em produção ainda não existe**, e a primeira vez que um GC abrir a tela será a
primeira execução real desse caminho.

> É o mesmo tipo de lacuna já registrada na 1.3.3, quando o Relatório Oficial em PDF nunca havia
> rodado sobre dado real de produção. Registrar vale mais do que mascarar: quem ler depois
> precisa saber que essa prova é devida.

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

---

## 9. Smoke humano

**Caminho A — Administrador**, escolhido pelo responsável. Confirmado em 02/08/2026:

| # | Ponto | Resultado |
|---|---|---|
| 1 | Login | ✅ |
| 2 | **VERSÃO 1.3.5** | ✅ |
| 3 | Dashboard carrega | ✅ |
| 4 | As **14 operações** das três unidades | ✅ |
| 5 | As **13 configurações** | ✅ |

**Confirmação do proprietário:** *"caminho A, admin, tudo feito e ok"*.

Registrado com a redação literal que ele usou — não a frase-modelo `SMOKE ATIVAÇÃO APROVADO`.
Ele já havia instruído, na mensagem anterior, a concluir a fase depois deste smoke.

**A ausência de ciclo preenchido foi antecipada e aceita** como esperada, por `assisted_cycles = 0`
e porque o Administrador não é quem abre ciclo. Ver §6-A e §7.

---

## 10. Estado final

| | |
|---|---|
| Produção `plnbgdabciwygsmnyddy` | `0001–0051`, Local = Remote **51/51** |
| Catálogo ativado | tema `GERAL` + **13 configurações** publicadas na região `RPS` |
| Cobertura | as **14 operações**, nas três unidades |
| Gestão Assistida | **ATIVA** |
| Auditoria Mensal | **DESLIGADA** — `audit_criteria = 0` |
| Cutover | **DESATIVADO** — `weekly_audit_cutover_date` JSON null |
| Ponderação | **VAZIA** — `region_weightings = 0` |
| Os quatro rascunhos de 29/07 | **INTACTOS** — 4, ainda `draft`, respostas inalteradas |
| Auditoria Semanal | **operável, e agora provado em uso real** — ver §11 |
| Homologação `qjvpkaurihjvzktlinhp` | **sem nenhuma escrita**; CLI religada a ela ao final |
| Staging `qcixfsdyfpankpatbays` | **INTOCADO** |
| Backups | `producao-pre-135-20260802-2013` e `producao-pre-135-ativacao-20260802-2146` (+ espelho) |
| Credenciais | **nenhuma criada, lida, redefinida ou armazenada** |
| Fase 13 | **não iniciada** |

---

## 11. Um fato novo durante o smoke, e ele prova mais do que a minha checagem

Às **01:55 UTC de 03/08/2026** (22:55 local), durante o smoke do Administrador, o aplicativo
**criou uma nova Auditoria Semanal** ao abrir a ficha de um parceiro:

| | |
|---|---|
| Evento na trilha | `evaluation.created` · `evaluation` · **success** |
| Ator | conta de **administrador** |
| Registro | `Semana de 03/08/2026`, `weekly`, `legacy_template`, **`draft`** |
| Respostas | **+16** `not_evaluated` (48 → 64) |
| `audit_logs` | **0 → 1** — o **primeiro evento de trilha que a produção já teve** |
| `evaluations` | **4 → 5** |

**Não é defeito, e não é efeito do backfill.** É o fluxo legado da Auditoria Semanal fazendo o
que sempre fez: com `weekly_audit_cutover_date` nulo, `start_evaluation` abre o ciclo semanal
para quem tem acesso à operação. A guarda de cutover da 0047 é **inerte** enquanto a data for
nula, e ela é nula por decisão (A-02 = A).

**O que isso melhora no registro:** a minha prova de que "a Auditoria Semanal continua operável"
era de leitura (`weeklyAuditClosed: false`). Esta é **de uso real, em produção, depois do
backfill** — mais forte. O backfill não interferiu no caminho legado, como o contrato exigia.

**Os quatro rascunhos originais permanecem intactos**, conforme A-03: seguem 4, ainda em
`draft`, e as respostas deles não mudaram — as 2 `green` e a 1 `not_applicable` continuam lá.
As 61 `not_evaluated` são as 45 originais mais as 16 do registro novo.

> **Diferença de permissão que vale registrar:** no fluxo **legado**, `start_evaluation` exige
> apenas `app.has_operation_access` — por isso um administrador consegue abrir Auditoria
> Semanal. Na **Gestão Assistida**, `app.is_assisted_operator` exige `channel_manager` com
> vínculo, e o administrador **não** consegue abrir ciclo. Os dois modelos convivem de
> propósito, e confundi-los gera falso diagnóstico.
