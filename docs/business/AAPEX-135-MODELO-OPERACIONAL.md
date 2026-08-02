# AAPEx 1.3.5 — Modelo Operacional

**Status:** canônico · derivado de [Decisões Empresariais](AAPEX-135-DECISOES-EMPRESARIAIS.md)
**Data:** 01/08/2026

Como a operação passa a funcionar na prática, do ponto de vista de quem usa. Sem detalhe técnico —
esse fica em [Impacto Técnico](../architecture/AAPEX-135-IMPACTO-TECNICO.md).

---

## 1. Inventário do modelo atual (1.3.4)

O que existe hoje, medido no repositório em `8ffc49a`:

| Elemento | Situação atual |
|---|---|
| Ciclo de trabalho | **Uma única entidade** `evaluations`, com `frequency ∈ {weekly, monthly}` |
| Competência | `cycle_label`, `period_start`, `period_end` — **derivados de `now()`** por `start_evaluation` |
| Conteúdo do ciclo | Checklist de `audit_items` (código, título, **`pillar`**, peso, frequência, obrigatório, evidência obrigatória) |
| Tema | **Não existe entidade de tema.** O papel é exercido por `audit_items.pillar` (texto), pelo `audit_items.code` projetado como `themeId`, e por `action_plans.theme_code` (texto) |
| Indicadores | `indicator_definitions` (code, name, lifecycle) + **`indicator_versions` já versionadas** (unit, direction, target, yellow_tolerance, weight, effective_from, limitations) |
| Vínculo indicador↔tema | **Não existe** |
| Resultado de indicador | `indicator_results` (operation_id, indicator_id, **`period` texto `YYYY-MM`**, target, actual, previous_actual, diagnosis, observation) |
| Planos de ação | `action_plans` — um motor único, já com `evaluation_id` e `item_id` como **FK anuláveis** |
| Snapshot | `official_snapshots` (period, score, template_version_id, **payload jsonb**, aprovador) |
| Relatório | `get_official_audit_report_data` + `REPORT_FORMAT_VERSION = '1.3.3'` |
| Papéis | `app.role_code = {admin, regional, coordinator, channel_manager}` — **os quatro já existem** |

**Conclusão do inventário:** a base já tem versionamento de indicador, os quatro papéis e um motor
único de planos. **Faltam:** entidade de tema, vínculo indicador↔tema, as duas flags de módulo,
critérios de processo, e um ciclo semanal com semântica própria.

## 2. A semana da Gestão Assistida

### 2.1 Como o GC trabalha

1. **Antes da visita** — consulta os resultados no **relatório oficial da operação** (fonte
   externa). O AAPEx não busca esse número.
2. **Abre o ciclo da semana** — o sistema garante **um único ciclo oficial por parceiro por
   semana**. Reabrir a mesma semana devolve o mesmo ciclo; não cria um segundo.
3. **Registra, indicador a indicador**, o **valor realizado**, e informa **de qual período da fonte**
   veio e **em que data consultou**. Pode anexar uma referência textual e uma observação.
4. **O sistema calcula o status** — conforme, atenção, não conforme ou sem dado — comparando o
   realizado com a **meta e a tolerância da versão vigente do indicador**.
5. **Onde houver desvio** (atenção ou não conforme), o ciclo **exige** diagnóstico, plano de ação,
   responsável e prazo. Sem isso o ciclo não fecha.
6. **Fecha o ciclo.** A partir daí a regra de cálculo fica **materializada**: mudar a meta amanhã
   não reescreve o status de ontem.
7. **Na semana seguinte**, acompanha a evolução dos planos abertos.

### 2.2 Definição da semana

- Semana de **segunda a domingo**, identificada pelo **`week_start_date`** (a segunda-feira).
- Timezone **America/Sao_Paulo** — a mesma já usada como default em `units.timezone`.
- A unicidade é do servidor: `(operação, semana, tipo Gestão Assistida)`.

### 2.3 O que fica gravado por indicador

valor realizado · meta · tolerância · unidade · orientação · peso · tema · **versão do indicador** ·
status calculado · período da fonte · data da consulta · referência textual (opcional) ·
observação · ator · data de registro.

> Meta, tolerância, unidade, orientação, peso e tema são **copiados no ato do registro**, não lidos
> por referência na hora de exibir. É isso que impede o recálculo histórico.

### 2.4 Regra de status

| Orientação | Conforme | Atenção | Não conforme |
|---|---|---|---|
| Higher better | realizado ≥ meta | abaixo da meta, dentro da tolerância | além da tolerância |
| Lower better | realizado ≤ meta | acima da meta, dentro da tolerância | além da tolerância |
| **`target_band`** | **⚠️ regra não definida** — ver Decisões §5, item **A-01** | | |

**Sem dado** quando o realizado não foi informado. Não é falha do GC nem não conformidade: é
ausência de dado, e alimenta o quadrante *Sem dado suficiente* da Matriz.

## 3. O mês da Auditoria Mensal

### 3.1 O que a auditoria pergunta

Não *"qual foi o número?"* — isso é Gestão Assistida. A auditoria pergunta **"o processo que
sustenta o número existe, está implantado e é executado?"**.

### 3.2 Como funciona

1. **Uma auditoria oficial por parceiro por competência mensal.**
2. Entram **apenas** os indicadores marcados com `include_in_monthly_audit = true`.
3. Cada indicador auditável tem **um ou mais critérios de processo** — perguntas sobre a rotina, não
   sobre o resultado. Um indicador marcado para auditoria **não pode ser publicado sem ao menos um
   critério ativo**.
4. **Ao criar a auditoria**, o sistema seleciona as versões vigentes de indicadores e critérios e as
   **materializa** dentro da auditoria. Alterar o catálogo depois **não muda auditoria já criada**.
5. O auditor responde cada critério, anexando **evidência conforme a parametrização do critério**.
   Critérios podem permitir **N/A**, e podem **exigir justificativa**.
6. Envio → validação → **aprovação**, que gera **snapshot oficial imutável** e habilita o
   **Relatório Oficial da Auditoria Mensal**.

### 3.3 O que um critério contém

pergunta · descrição · orientação · ordem · obrigatório · evidência obrigatória · permite N/A ·
exige justificativa · vigência · ativo/inativo.

**Proibições expressas:** não gerar critérios a partir do nome do indicador; não converter
automaticamente o checklist antigo (`audit_items`) em critérios.

## 4. Catálogo: temas, indicadores e critérios

### 4.1 Ciclo de vida

Tudo é **versionado e preservado**. Nada com histórico é apagado.

| Ação desejada | Como se faz | Como **não** se faz |
|---|---|---|
| Corrigir uma meta | **nova versão** do indicador | editar a versão em uso |
| Aposentar um indicador | **inativar** | excluir |
| Mudar um indicador de tema | **nova versão** apontando para o novo tema | reescrever o vínculo |
| Reordenar temas | alterar a ordem **da versão vigente** | reescrever registros passados |
| Remover um tema em uso | **não é permitido** | — |

### 4.2 Padrões de criação

```
include_in_assisted_management = true
include_in_monthly_audit       = false
```

Todo indicador nasce na Gestão Assistida. Participar da Auditoria Mensal é uma decisão explícita —
e, tomada, obriga a existir pelo menos um critério ativo.

### 4.3 O que o histórico deve preservar

- o **nome do tema** vigente na data do registro;
- a **versão** do indicador usada;
- a **associação indicador↔tema** vigente na data do registro **e** na data da Auditoria Mensal —
  que podem ser diferentes.

## 5. Planos de ação — um motor, três origens

O plano é **o mesmo objeto** venha de onde vier. O que muda é a **origem**.

| Origem | Quando nasce |
|---|---|
| **Gestão Assistida** | desvio (atenção ou não conforme) num ciclo semanal |
| **Auditoria Mensal** | não conformidade de processo num critério |
| **Legado** | planos já existentes, vindos das auditorias semanais históricas |

**Estados preservados:** `open` · `waiting_partner` · `blocked` · `done` · `validated` · `overdue`.
**Anti-auto-validação preservada:** quem cria não valida. `validated_by` e `validated_at`
permanecem.

`overdue` continua **derivado da data** — nunca gravado manualmente. Esse contrato já está provado
na 1.3.4 e não pode regredir.

## 6. Convivência com o legado

| Objeto | Depois do cutover |
|---|---|
| Auditorias semanais históricas | **read-only**, acessíveis, nunca recalculadas |
| Respostas, evidências, snapshots, relatórios | **intactos** |
| Planos vindos do legado | continuam vivos e acompanháveis |
| `audit_logs` | intacto e imutável |

**A interface deve distinguir claramente três coisas:** histórico semanal legado · Gestão Assistida
atual · Auditoria Mensal atual.

**Não há conversão automática** de histórico semanal em Gestão Assistida. São modelos diferentes; a
conversão inventaria dados que ninguém registrou (período da fonte, data da consulta, tema).

## 7. Dashboard e Matriz

### 7.1 Matriz

Dois eixos, com significados agora inequívocos:

- **eixo de desempenho = Gestão Assistida** (o resultado);
- **eixo de processo = Auditoria Mensal** (a rotina que o sustenta).

Quadrantes preservados: **Saudável** · **Processo cumprido, resultado insuficiente** · **Resultado
sem processo** · **Crítico** · **Sem dado suficiente**.

### 7.2 Índice ponderado

É **informação adicional. Não substitui a Matriz.**

- Ponderação **versionada por região**; pesos somam **100%**.
- **Não há peso padrão aprovado.**
- **Sem configuração:** mostrar os dois eixos, informar **“Ponderação não configurada”** e **não
  calcular** índice consolidado.
- **Faltando um módulo:** dados insuficientes. **Não renormalizar o peso restante** — renormalizar
  faria um parceiro sem auditoria parecer melhor do que um auditado.

### 7.3 Acessibilidade

**Cada gráfico deve ter alternativa tabular acessível.** Não é adorno: os achados **O-12** e
**O-13** mostraram que controles sem semântica de botão ficam inalcançáveis por teclado e leitor de
tela. O padrão não se repete nas telas novas.

## 8. Exportação

Quatro conjuntos — **Gestão Assistida · Auditoria Mensal · Planos · Resumo** — em **CSV** e
**XLSX**, com filtros por período, parceiro, GC, Coordenador, tema, indicador, módulo e status.

O XLSX traz as abas `Gestao_Assistida`, `Auditoria_Mensal`, `Planos`, `Resumo` e
**`Filtros_Aplicados`** — esta última para que o arquivo diga de si mesmo o recorte que representa.

**Autorização, escopo e filtros são resolvidos no servidor.** Um GC exporta seus parceiros; um
Coordenador, sua coordenação. O arquivo não pode ser um caminho para contornar a RLS.

## 9. Terminologia obrigatória

| Diga | Não diga |
|---|---|
| **Relatório oficial da operação** (fonte externa) | “relatório oficial”, sozinho |
| **Relatório Oficial da Auditoria Mensal** (PDF do AAPEx) | “relatório oficial”, sozinho |
| **Gestão Assistida** | “auditoria semanal” |
| **Auditoria Mensal** | “auditoria”, quando houver ambiguidade |
| **Histórico semanal legado** | “auditorias antigas” |

O passo 1 do fluxo do GC é *consultar o relatório oficial da operação*. Se os dois documentos se
chamarem igual, o usuário procura o número no lugar errado.
