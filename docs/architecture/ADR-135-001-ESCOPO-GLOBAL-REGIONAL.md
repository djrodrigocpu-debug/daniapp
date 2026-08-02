# ADR-135-001 — Escopo global e regional de temas e indicadores

**Status:** aceito · decisão empresarial **A-08 aprovada pelo proprietário**
**Data:** 01/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit` · base `8ffc49a`
**Contexto canônico:** [Decisões Empresariais §5 / A-08](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) ·
[Matriz de Permissões §7.3](AAPEX-135-MATRIZ-DE-PERMISSOES.md) ·
[Contratos de Dados §2, §3, §6](AAPEX-135-CONTRATOS-DE-DADOS.md)

---

## 1. Contexto

A decisão **D7** dá ao Gerente Regional gestão de catálogo *“dentro da própria região”*. O modelo
da 1.3.4 não tem onde escrever isso: `indicator_definitions` e `indicator_versions` não possuem
região, e **tema não existe como entidade** — o papel é exercido por `audit_items.pillar` (texto),
`audit_items.code` projetado como `themeId` e `action_plans.theme_code` (texto).

A consequência é literal: com catálogo global e sem região, **qualquer Regional que editasse um
indicador alteraria a operação de todas as regiões** — exatamente o oposto de D7. Foi por isso que
a pendência **A-08** bloqueou a entrada da Fase 1, e não por preferência de modelagem.

O bloqueio foi resolvido pelo proprietário: vale o **modelo híbrido**.

## 2. Alternativas comparadas

### (a) `region_id` direto em `indicator_definitions` e `themes`

Cada tema e cada indicador pertence a uma região; `null` significa global.

| | |
|---|---|
| ✅ | mínima: duas colunas e uma constraint |
| ✅ | resolve a autoridade — o objeto sabe a que região pertence |
| ❌ | **não resolve o caso central**: um indicador global continua com **uma única meta, tolerância, peso, tema e ordem** para o país inteiro |
| ❌ | a única saída de uma região que precise de meta própria é **duplicar** o indicador global, e a série passa a ter dois códigos para o mesmo conceito |
| ❌ | marcar Auditoria Mensal viraria decisão nacional, não regional |

Resolve *quem edita*. Não resolve *o que cada região opera*.

### (b) Catálogo global duplicado por região

O ADMIN mantém um catálogo modelo; cada região recebe uma cópia física dos temas e indicadores.

| | |
|---|---|
| ✅ | isolamento total e trivial de provar |
| ✅ | cada região configura o que quiser sem afetar as demais |
| ❌ | **destrói a identidade conceitual**: “Conversão” em cinco regiões vira cinco indicadores distintos, e comparar regiões deixa de ser possível sem um mapa de equivalência inventado depois |
| ❌ | corrigir a definição de um indicador global exige propagar N cópias, com deriva garantida |
| ❌ | o volume de catálogo cresce com o número de regiões, sem ganho semântico |

Rejeitada: comparação entre regiões é razão de existir do Dashboard e da Matriz (D10).

### (c) Catálogo global com configuração regional, **sem conteúdo regional próprio**

Definição sempre global e administrada pelo ADMIN; cada região só escolhe metas, pesos, ordem e
participação em módulos.

| | |
|---|---|
| ✅ | identidade preservada; comparação entre regiões íntegra |
| ✅ | autonomia operacional real: meta de A não afeta B |
| ❌ | **uma região não consegue medir o que só existe nela** — um indicador ou tema local depende de fila no ADMIN |
| ❌ | D7 diz *“cria”*, não apenas *“configura”*; esta alternativa entrega metade da frase |

É a alternativa (b) da Matriz de Permissões §7.3 — autoridade regional só sobre critérios e
ponderação. Rejeitada por entregar menos do que D7 concede.

### (d) Modelo híbrido — **ESCOLHIDO**

```
CATÁLOGO GLOBAL  +  CONFIGURAÇÃO REGIONAL VERSIONADA  +  CONTEÚDO EXCLUSIVAMENTE REGIONAL
```

1. **Catálogo global** — temas e indicadores de escopo `global`, criados e alterados **somente pelo
   ADMIN**, disponíveis a qualquer região, com **identidade e definição semântica únicas**.
2. **Configuração operacional regional versionada** — cada região decide, para cada indicador que
   adote: se usa, em que tema apresenta, meta, tolerância, peso, ordem, participação na Gestão
   Assistida e na Auditoria Mensal, e os critérios de processo. **A configuração de uma região não
   alcança outra.**
3. **Conteúdo exclusivamente regional** — temas e indicadores de escopo `regional`, criados pelo
   ADMIN **ou** pelo Gerente Regional da própria região, invisíveis e inutilizáveis pelas demais.

## 3. Decisão

Adotado o **modelo híbrido (d)**, decisão empresarial **A-08**, canônica.

**Por que este e não os outros:** é o único que satisfaz as três exigências ao mesmo tempo —

| Exigência | (a) | (b) | (c) | (d) |
|---|---|---|---|---|
| Regional **cria** conteúdo próprio (D7) | ✅ | ✅ | ❌ | ✅ |
| Regional **configura** sem afetar outra região (D7) | ❌ | ✅ | ✅ | ✅ |
| Indicador global mantém **identidade comparável** (D10) | ✅ | ❌ | ✅ | ✅ |
| ADMIN mantém a **definição semântica global** (D7) | ✅ | ❌ | ✅ | ✅ |

O custo é conhecido e aceito: **uma camada a mais**. Um indicador global passa a ter *definição*
(global, versionada) e *configuração* (regional, versionada). Nada é operado sem configuração
regional — inclusive os indicadores globais.

## 4. Decisões derivadas

Todas consequência direta de A-08. Cada uma **substitui** o que os Contratos de Dados propunham
antes da decisão, e está aqui para que a diferença seja rastreável.

### D-A · Critérios de Auditoria Mensal pertencem à **configuração regional**

Contratos §6 ancorava `audit_criteria` em `indicator_definition_id`. Com A-08 isso é impossível: um
indicador global pode ser auditável em uma região e não em outra, e ter **critérios diferentes em
cada uma**. Os critérios passam a pender de `indicator_regional_configs`.

### D-B · Meta, tolerância, peso, tema, ordem e as duas flags de módulo ficam na **versão da configuração regional**

Contratos §3 punha `theme_version_id`, `include_in_assisted_management` e `include_in_monthly_audit`
em `indicator_versions` — e sinalizava a colocação como derivada, não literal (pendência **A-09**).
A-08 resolve A-09 em outro lugar: esses campos **não são semântica do indicador, são operação da
região**. Ficam na versão da configuração regional, onde continuam versionados e continuam sem
alterar ciclo fechado nem auditoria aprovada — que era a razão de estarem numa versão.

### D-C · Nome e descrição do indicador são **versionados**

O §5 do escopo desta fase exige que o Regional possa publicar novas versões de nome, descrição,
unidade e direção dos indicadores **regionais**. `indicator_definitions.name` é único e não
versionado. `indicator_versions` recebe `name` e `description` **anuláveis**: nulo significa
*herda da definição*, que é o estado de todo o catálogo legado. Nenhuma linha existente é reescrita.

Mesmo motivo do nome do tema morar em `theme_versions`: renomear não pode reescrever a leitura do
histórico.

### D-D · `indicator_versions.target`, `yellow_tolerance` e `weight` permanecem, e **não são** a fonte de verdade dos módulos novos

São colunas `not null` de 0001, referenciadas por `measurements` e pela projeção `ui_indicators`.
Removê-las seria destrutivo. Permanecem servindo o caminho legado; a partir de 1.3.5 **o valor
operativo é o da configuração regional**. A duplicidade é deliberada e está documentada aqui para
que ninguém a leia como fonte alternativa.

### D-E · O código continua sendo **identidade global**, não por escopo

O escopo decide **quem administra** e **quem enxerga**. Não decide se a sigla pode repetir:
`indicator_definitions.code` e `themes.code` são únicos em **todo** o catálogo.

A alternativa — dois índices únicos parciais, um por escopo, permitindo `IND-101` em duas regiões —
foi escrita, testada e **descartada por quebrar consumidores reais**: `on conflict (code)` **não
infere índice parcial**, e é exatamente essa cláusula que dá reexecutabilidade à semente do catálogo
(`supabase/seed/0001_seed_catalog.sql`) e ao bootstrap `0021`. Um índice parcial transforma os dois
num erro opaco de inferência de índice. O custo de contornar isso seria reescrever migration
histórica; o ganho seria permitir que a mesma sigla signifique coisas diferentes em regiões
diferentes — o que, em exportação, PDF e comparação entre regiões, é um defeito, não um recurso.

**Consequências aceitas**

- duas regiões não podem usar a mesma sigla para indicadores ou temas diferentes;
- um Regional que tente criar `TEMA-X` já usado por outra região recebe *“já existe um tema com o
  código TEMA-X”*. A recusa **não diz de quem é** — o espaço de códigos é compartilhado, a
  existência do objeto alheio continua não observável.

Isto satisfaz a exigência de *“unicidade do identificador dentro do respectivo escopo”*: unicidade
global é estritamente mais forte.

### D-F · `target_band` bloqueado na publicação (A-01)

A-01 continua **pendente**: o enum `app.indicator_direction` tem três valores e D2 define regra de
status para dois. Publicar configuração regional com `include_in_assisted_management = true` sobre
uma versão de indicador `target_band` é **recusado com erro empresarial explícito**. Não se calcula
status, não se converte para `higher_better`/`lower_better`, e **nenhum registro histórico é
tocado**. A restrição é temporária e cai quando A-01 for decidida.

### D-G · Nada é operado sem configuração regional publicada

Um indicador global **não fica ativo em região alguma** por existir. A adoção é ato explícito da
região. É o que impede que criar um indicador nacional mude, sozinho, a operação de todo mundo.

## 5. Consequências

**Positivas**

- D7 passa a ser implementável literalmente, com autorização server-side por região;
- meta de uma região não alcança outra, por construção do modelo e não por disciplina de uso;
- indicadores globais mantêm série comparável entre regiões;
- toda alteração é nova versão: ciclo fechado e auditoria aprovada continuam intocados.

**Negativas, assumidas**

- **uma indireção a mais** entre indicador e operação: quem lê o modelo precisa saber que a meta
  não está no indicador;
- **duas fontes aparentes de meta** enquanto o legado existir (D-D), mitigadas por documentação e
  por a configuração regional ser a única lida pelos módulos novos;
- o catálogo legado precisa de **backfill de configuração regional** antes do cutover — trabalho
  explícito, planejado e testado à parte. **Não executado nesta unidade.**

**Neutras**

- os indicadores hoje existentes são tratados como **catálogo global legado**: nascem
  `scope_kind = 'global'`, `region_id` nulo, sem configuração regional e sem participação
  automática em módulo nenhum.

## 6. O que esta unidade NÃO decide

| # | Continua pendente |
|---|---|
| **A-01** | regra de status para `target_band` — aqui apenas **bloqueada**, nunca inventada |
| **A-02** | data de cutover |
| **A-03** | decisão nominal dos quatro drafts de produção |
| **A-04** | pesos da ponderação regional |
| **A-05** | nova `REPORT_FORMAT_VERSION` |
| **A-06** | escopo da aba `Resumo` da exportação |
| **A-07** | se a autoridade regional se resolve **apenas** por `user_scopes.region_id` — esta unidade usa `app.scoped_region_ids()`, que já devolve conjunto, e portanto **não depende** da resposta |

Nenhuma conversão de `audit_items` em critérios, nenhuma migração semântica de `pillar` para tema,
nenhum recálculo, nenhuma alteração de ID histórico.
