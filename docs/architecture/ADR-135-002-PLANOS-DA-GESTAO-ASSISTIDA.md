# ADR-135-002 — Origem dos planos de ação da Gestão Assistida

**Status:** aceito · decisão técnica derivada de **D6** (Decisões Empresariais §2)
**Data:** 01/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit`
**Contexto canônico:** [Decisões Empresariais §D6](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) ·
[Modelo Operacional §5](../business/AAPEX-135-MODELO-OPERACIONAL.md) ·
[Contratos de Dados §5](AAPEX-135-CONTRATOS-DE-DADOS.md) ·
[ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md)

---

## 1. Contexto

O plano de implementação separava a Fase 3 (ciclo semanal, itens, status, fechamento) da Fase 4
(origem íntegra dos planos). A separação produzia uma **contradição operacional**:

- o fechamento do ciclo **exige** plano de ação para todo item em `atencao` ou `nao_conforme`
  (D2, literal: *"`atenção` e `não conforme` exigem diagnóstico, plano, responsável e prazo"*);
- mas o vínculo íntegro entre plano e item só existiria na fase seguinte.

Entregar a Fase 3 sozinha deixaria só duas saídas, ambas proibidas:

1. guardar o plano como **texto solto** dentro do item — cria um segundo motor de planos por
   omissão, contrariando D6 (*"um único motor de planos"*);
2. validar o fechamento contra um **UUID sem verificação** — é exatamente o que D6 proíbe
   (*"não adotar somente `source_type` + UUID sem validação de existência"*).

Por decisão do proprietário, **a Fase 3 absorve o mínimo indispensável da Fase 4**: o que for
necessário para que o fechamento valide um plano *realmente persistido no motor único*, e nada além
disso.

## 2. Inventário do motor atual — medido, não presumido

Levantado em `supabase/migrations/`, não a partir de documento anterior:

| Elemento | Onde | Estado |
|---|---|---|
| Tabela `public.action_plans` | `0001:331–350` | `operation_id` **not null**; `evaluation_id` e `item_id` **FKs anuláveis**; `due_date` **not null**; `priority` com CHECK |
| Estados | `app.action_status` (0001 + `0024`) | `open · in_progress · waiting_partner · blocked · done · validated · overdue · cancelled_justified` |
| Colunas de validação | `0024:37–39` | `validated_by`, `validated_at` |
| Máquina de estados | `app.action_transition_allowed` (`0025:66`) | `validated` e `cancelled_justified` terminais |
| Gatilho de escrita | `app.guard_action_plan_write` (`0025:101`), INSERT **e** UPDATE | autoria autoritativa; `overdue` recusado como escolha manual; plano validado imutável; **anti-auto-validação** (`old.created_by = auth.uid()`) |
| RPC de conteúdo | `public.save_action_plan(jsonb)` (`0025:241`) | edição não muda status; `item_id` derivado de `audit_items.code = themeId` |
| RPC de estado | `public.update_action_status` (`0025:181`) | repete as guardas do gatilho com mensagem amigável |
| Projeção | `public.ui_action_plans` (`0025:304`) | `security_invoker`; `themeId` vem de `theme_code` ou do `audit_items.code` |
| RLS | `actions_read` / `actions_write` (`0002:233–236`) | `app.has_operation_access(operation_id)` — **escrita direta por PostgREST é permitida no escopo** |

Duas consequências desse inventário governam tudo o que vem a seguir:

1. **`action_plans` já usa FK anulável para exprimir origem.** A alternativa escolhida não inventa
   padrão: continua o que o schema faz desde 0001.
2. **A RLS permite `INSERT`/`UPDATE` direto por qualquer autenticado no escopo.** Portanto todo
   invariante novo tem de estar em **gatilho**, não apenas na RPC — foi essa exata observação que a
   0025 registrou em cabeçalho, e ela vale igual aqui.

## 3. Alternativas comparadas

### (a) Plano como texto dentro do item da Gestão Assistida

`assisted_cycle_entries` ganharia `action_plan_text`, `action_owner`, `action_due_date`.

| | |
|---|---|
| ✅ | fecha a Fase 3 sem tocar em `action_plans` |
| ❌ | **cria um segundo motor de planos**, exatamente o que D6 proíbe |
| ❌ | o plano nasce sem estado, sem validação, sem `overdue`, sem anti-auto-validação |
| ❌ | *"acompanha a evolução dos planos abertos na semana seguinte"* (Modelo Operacional §2.1, passo 7) fica impossível: texto não evolui |
| ❌ | `ActionsScreen` nunca veria esses planos |

Rejeitada. É a opção que o escopo desta sessão nomeia explicitamente como proibida.

### (b) Motor de planos paralelo para a Gestão Assistida

Tabela `assisted_action_plans` com máquina de estados própria.

| | |
|---|---|
| ✅ | isolamento total; nenhuma regressão possível no legado |
| ❌ | **duplica a máquina de estados, a anti-auto-validação e o `overdue` derivado** — três contratos já provados que passariam a existir em duas versões que divergem no primeiro conserto |
| ❌ | D6 é literal: *"um único motor de planos"* |
| ❌ | exportação, Dashboard e Matriz precisariam unir duas tabelas para responder *"planos abertos"* |

Rejeitada por contrariar D6 diretamente.

### (c) `source_type` + UUID polimórfico sem FK

`action_plans.source_type = 'assisted'` e `source_id uuid` sem referência.

| | |
|---|---|
| ✅ | uma coluna serve a todas as origens futuras sem nova migration |
| ❌ | **nenhuma integridade**: apagar o item não invalida o vínculo, e um cliente pode gravar UUID inexistente |
| ❌ | **proibida por D6**, nominalmente |
| ❌ | o fechamento do ciclo validaria contra um ponteiro que o banco não conhece |

Rejeitada — e é a única alternativa que a decisão empresarial recusa por nome.

### (d) FK explícita ao item da Gestão Assistida — **ESCOLHIDA**

```
alter table public.action_plans add:
  assisted_entry_id  uuid references public.assisted_cycle_entries(id)
  source             app.action_source not null default 'legacy'
```

| | |
|---|---|
| ✅ | integridade **verificada pelo banco**: o item precisa existir |
| ✅ | continua o padrão de `evaluation_id`/`item_id` — nada de novo a aprender |
| ✅ | plano legado permanece válido, com `source = 'legacy'` **por default de coluna**, sem `UPDATE` semântico |
| ✅ | estados, `overdue`, anti-auto-validação e trilha **não são tocados** |
| ⚠️ | exige guarda de coerência entre a operação do plano e a operação do ciclo — a FK sozinha não impede vincular plano do parceiro A ao item do parceiro B |

### (e) Tabela intermediária de origem

`action_plan_sources (plan_id, source_kind, assisted_entry_id, evaluation_id, …)`.

| | |
|---|---|
| ✅ | integridade real; cardinalidade N:N possível |
| ❌ | uma junção a mais em **todo** consumidor de plano, inclusive `ui_action_plans` e o relatório |
| ❌ | permite um plano com duas origens — estado que nenhuma decisão empresarial descreve |
| ❌ | ganho zero sobre (d) para as três origens que D6 enumera |

Rejeitada por custo sem contrapartida.

## 4. Decisão

Adotada a alternativa **(d)**, na forma detalhada abaixo.

> ⚠️ **CORREÇÃO em 02/08/2026.** O escopo residual descrito em **D-H** — *"acrescentar
> `monthly_audit_id` e relaxar o CHECK"* — **estava errado**, e foi corrigido por
> [ADR-135-003 §4, decisão D-Q](ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md) antes de qualquer
> migration da Fase 5.
>
> `monthly_audit_id -> evaluations(id)` seria **redundante** com `action_plans.evaluation_id`, que
> existe desde `0001:334` e já referencia a mesma tabela; e seria **grosso demais**, porque apontar
> para a auditoria inteira não diz **qual não conformidade** originou o plano — enquanto o vínculo
> semanal aponta para o item.
>
> A terceira origem é `monthly_criterion_answer_id`, FK à **resposta do critério**, com
> `evaluation_id` não nulo e `item_id` nulo na mesma perna do CHECK. E, diferente do vínculo
> semanal, **não** é 1:1 (ADR-135-003, D-R): uma não conformidade de processo pode exigir mais de
> uma ação, e não há decisão empresarial que a limite a uma.
>
> O texto original de D-H fica abaixo, preservado, para que a diferença seja rastreável.

### D-H · `source` é enum com as três origens de D6, mas só duas são aceitáveis hoje

```
create type app.action_source as enum ('legacy', 'assisted', 'monthly_audit');
```

O valor `monthly_audit` **existe no enum e é recusado pelo CHECK** até a Fase 5 criar
`monthly_audit_id`. Duas razões:

1. `alter type … add value` **não pode ser usado na mesma transação** em que o valor é referenciado
   — foi exatamente por isso que a 0024 e a 0025 foram partidas em duas migrations. Deixar o valor
   pronto agora poupa a próxima fase de repetir a divisão.
2. Aceitar `monthly_audit` sem coluna de origem seria **inventar comportamento**: o plano diria vir
   da Auditoria Mensal sem que o banco pudesse verificar de qual. Recusar é o comportamento
   conservador que o resto desta versão já adota para `target_band`.

CHECK desta fase:

```
check (
  (source = 'legacy'   and assisted_entry_id is null)
  or (source = 'assisted' and assisted_entry_id is not null)
)
```

**Escopo residual da Fase 4:** ~~acrescentar `monthly_audit_id`~~ **acrescentar
`monthly_criterion_answer_id`** e relaxar o CHECK para a terceira origem — ver a correção D-Q
acima. Nada mais.

### D-I · Cardinalidade **um plano por item**, imposta por índice único parcial

```
create unique index action_plans_assisted_entry_uk
  on public.action_plans(assisted_entry_id) where assisted_entry_id is not null;
```

Toda a documentação canônica fala do plano do desvio no singular — D1: *"cria **plano de ação** com
responsável e prazo"*; D2: *"exigem diagnóstico, **plano**, responsável e prazo"*. Com 1:1 a guarda
de fechamento é exata: *o item tem plano* é uma pergunta com resposta única, e a interface não
precisa escolher qual plano exibir.

**É uma restrição, e está registrada como tal.** Se a operação vier a precisar de vários planos por
desvio, remover um índice único é operação aditiva e não destrutiva — nenhum dado se perde. O
inverso (relaxar agora e apertar depois) exigiria decidir o que fazer com os duplicados já criados.

### D-J · Coerência de operação verificada por gatilho, não só pela FK

A FK garante que o item existe. **Não** garante que o item é do parceiro certo. Um cliente com acesso
a dois parceiros poderia, por PostgREST, gravar um plano de `opA` apontando para um item do ciclo de
`opB` — e a RLS deixaria, porque ele alcança as duas operações.

Gatilho `app.guard_action_plan_assisted_link`, em INSERT e UPDATE:

- `source = 'assisted'` exige `assisted_entry_id` **e** `action_plans.operation_id` igual ao
  `operation_id` do ciclo do item;
- o vínculo é **imutável depois de criado** — repontar um plano para outro item reescreveria a
  história do ciclo fechado sem passar por ele;
- ciclo **fechado** não aceita vínculo novo: o plano continua evoluindo, mas não se cria vínculo
  retroativo.

Como região é derivada de `operações → unidades → região`, coerência de operação implica coerência
de região. Não há segunda verificação, e não deve haver: duas fontes para o mesmo invariante
divergem no primeiro conserto.

### D-K · `save_action_plan` é **estendida**, não substituída

A RPC ganha dois campos opcionais no payload (`assistedEntryId`, e `source` derivado dele). O
comportamento de quem não os envia é **byte a byte o atual** — inclusive a derivação de `item_id` a
partir de `themeId`. Quem envia `assistedEntryId` passa pelas verificações de D-J antes de qualquer
escrita.

**Não** se cria `save_assisted_action_plan`. Uma segunda porta de entrada para o mesmo objeto é como
um segundo motor nasce.

## 5. Compatibilidade e impacto

| Superfície | Impacto |
|---|---|
| Planos existentes | `source = 'legacy'` **por default de coluna**. Nenhum `UPDATE` de dado, nenhuma reinterpretação |
| `app.action_status` | **intacto**. Nenhum valor novo, nenhum removido |
| Máquina de estados | **intacta**. `app.action_transition_allowed` não é tocada |
| Anti-auto-validação | **intacta**. Vive em `app.guard_action_plan_write`, que não é reescrita |
| `overdue` derivado | **intacto**. Continua recusado como escolha manual |
| `ui_action_plans` | ganha `source` e `assistedEntryId` **no fim** — `create or replace view` só aceita apêndice |
| `get_official_audit_report_data` | **não é tocada**. O relatório 1.3.3 não lê origem de plano; o determinismo dos 40 códigos não tem por onde mudar |
| `submit_evaluation` | **intacta**. A guarda de "item vermelho sem plano" consulta `evaluation_id`/`item_id`, que planos `assisted` deixam nulos — um plano da Gestão Assistida **não** satisfaz o portão da auditoria legada, e é assim que deve ser |
| `ActionsScreen` | passa a ver os planos da Gestão Assistida sem alteração de consulta, porque são a mesma tabela |

## 6. O que esta decisão NÃO decide

| # | Fica em aberto |
|---|---|
| ~~**Fase 4 residual**~~ ✅ | ~~coluna `monthly_audit_id` e a terceira perna do CHECK~~ — **resolvido na Fase 5** com `monthly_criterion_answer_id`; ver [ADR-135-003, D-Q](ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md) |
| **A-01** | regra de status para `target_band` — aqui nem tocada |
| **O-11** | teste dirigido de auto-validação em plano `done` pertence à fase de autorização; esta decisão não altera a regra que ele mede |
| Cardinalidade N:1 | se a operação exigir vários planos por desvio, é decisão empresarial nova (ver D-I) |
| Origem de plano em auditoria **semanal legada** | continua `legacy`; nenhuma conversão automática |
