# ADR-135-003 — Auditoria Mensal materializada, e a convivência com o modelo legado

**Status:** aceito · decisão técnica derivada de **D4** e **D5** (Decisões Empresariais §2)
**Data:** 02/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit`
**Contexto canônico:** [Decisões Empresariais §D4/§D5](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) ·
[Modelo Operacional §3](../business/AAPEX-135-MODELO-OPERACIONAL.md) ·
[Contratos de Dados §6](AAPEX-135-CONTRATOS-DE-DADOS.md) ·
[ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md) · [ADR-135-002](ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md)

---

## 1. Contexto: quatro lacunas do plano anterior

O plano previa que a Auditoria Mensal continuasse em `public.evaluations` com
`frequency = 'monthly'`, materializando critérios em `evaluation_criteria`. Levantado o schema
real, esse desenho **não fecha**:

| # | Lacuna | Onde se vê |
|---|---|---|
| 1 | `evaluation_answers.item_id` é **`not null`** e referencia `audit_items` | `0001:305` |
| 2 | `evaluation_criteria` daria os critérios, mas **não há onde responder a eles** | Contratos §6 não previu tabela de respostas |
| 3 | `evaluations.template_version_id` e `official_snapshots.template_version_id` são **`not null`** | `0001:296` e `0001:381` |
| 4 | `monthly_audit_id -> evaluations(id)` em `action_plans` seria **redundante** com `evaluation_id`, que já existe desde 0001 — e não diria **qual critério** originou o plano | `0001:334` vs [ADR-135-002 §4](ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md) |

Nenhuma das quatro se resolve com dado artificial. Criar um `audit_template_versions` vazio e um
`audit_items` por critério faria a auditoria nova **parecer** legada — e todo consumidor do modelo
antigo (`app.evaluation_score`, `submit_evaluation`, `get_official_audit_report_data`,
`ui_evaluations`) passaria a operar sobre dados que ninguém preencheu, produzindo nota, relatório
e código de integridade a partir de ficção.

## 2. Alternativas comparadas

### (a) Reutilizar `audit_items` artificialmente

Um `audit_template_versions` sintético por região, e um `audit_items` por critério publicado.

| | |
|---|---|
| ✅ | zero migration estrutural: tudo já existe |
| ✅ | `evaluation_answers`, `evaluation_score` e o relatório funcionariam "de graça" |
| ❌ | **produz nota a partir de peso inventado** — `audit_items.weight` é `not null`, e nenhuma decisão empresarial define peso de critério |
| ❌ | `audit_items.frequency` e `pillar` teriam de ser preenchidos sem fonte |
| ❌ | D4 é literal: *"não converter automaticamente o checklist antigo em critérios"*. Fazer o caminho inverso — converter critérios em checklist — viola o mesmo princípio |
| ❌ | o catálogo legado passa a conter linhas que ninguém cadastrou, e o Admin as exibiria |
| ❌ | **contamina o determinismo do relatório**: auditorias novas entrariam no mesmo caminho dos 40 códigos já provados |

Rejeitada. É a alternativa que o escopo desta fase proíbe por nome.

### (b) Adaptar `evaluation_answers` com duas FKs anuláveis

`item_id` passa a anulável; entra `evaluation_criterion_id`; CHECK garante exatamente uma.

| | |
|---|---|
| ✅ | uma tabela só de respostas; consultas transversais triviais |
| ✅ | é o padrão que `action_plans` já usa para origem |
| ❌ | **`item_id` é `not null` desde 0001 e é lido por seis consumidores** (`evaluation_score`, `submit_evaluation`, `save_evaluation_answer`, `reserve_evidence_upload`, `ui_evaluations`, o relatório). Torná-lo anulável obriga a revisar os seis, e cada revisão é uma chance de mexer no determinismo já provado |
| ❌ | o **vocabulário de status é diferente**: `app.traffic_light` é `green/yellow/red/not_evaluated/not_applicable`. A auditoria de processo pergunta *"o processo existe e é executado?"* — a resposta é conforme, não conforme ou N/A, sem meio-termo amarelo. Reaproveitar o enum obrigaria a decidir o que "amarelo" significa num critério, e isso é regra empresarial que ninguém declarou |
| ❌ | `evaluation_answer_evidence.answer_id` cascatearia a ambiguidade para as evidências |
| ⚠️ | `unique (evaluation_id, item_id)` deixaria de garantir unicidade quando `item_id` for nulo |

Rejeitada pelo risco sobre o caminho legado, e pelo enum.

### (c) Respostas próprias para critérios materializados — **ESCOLHIDA**

`evaluations` continua sendo o **agregado** da auditoria. O que muda é *do que ela é feita*,
declarado por um discriminador.

```
app.evaluation_model = { legacy_template , monthly_criteria }

legacy_template   -> audit_items       -> evaluation_answers          (INTACTO)
monthly_criteria  -> evaluation_criteria -> evaluation_criterion_answers (NOVO)
```

| | |
|---|---|
| ✅ | o caminho legado **não é tocado**: nem coluna, nem tipo, nem consulta, nem gatilho |
| ✅ | status próprio, com o vocabulário que D4 descreve, sem reinterpretar `traffic_light` |
| ✅ | evidência com vínculo próprio e FK real |
| ✅ | plano aponta para a **resposta concreta**, não para a auditoria inteira |
| ✅ | `evaluations` continua sendo o agregado: escopo, autor, submissão, validação, aprovação e trilha são os mesmos, e a Matriz de Permissões §4 se aplica sem tradução |
| ⚠️ | duas tabelas de resposta convivendo — custo real, aceito, e é exatamente o que "coexistem" significa em Migração §3.3 |

### (d) Domínio inteiramente separado de `evaluations`

Uma `monthly_audits` própria, como `assisted_cycles` fez para a Gestão Assistida.

| | |
|---|---|
| ✅ | isolamento total, sem discriminador |
| ❌ | **duplica o que já está certo**: submissão, devolução, validação hierárquica, snapshot oficial, `validations`, trilha e a projeção de pessoas |
| ❌ | D1 pede domínio próprio **para a Gestão Assistida**, e a razão é que semanal não é o que `evaluations` significa. A Auditoria Mensal **é** o que `evaluations` significa — Contratos §6 já dizia isso |
| ❌ | a Matriz §4 fala de "validar/aprovar" com a mesma semântica do fluxo atual; recriá-la é convite à divergência |

Rejeitada: seria isolamento sem problema a isolar.

## 3. Decisão

Adotada a alternativa **(c)**.

**Por que este e não os outros:** é o único que satisfaz as quatro exigências ao mesmo tempo —

| Exigência | (a) | (b) | (c) | (d) |
|---|---|---|---|---|
| Caminho legado **inalterado** (D5, RT-01) | ❌ | ❌ | ✅ | ✅ |
| Nenhum dado artificial (D4) | ❌ | ✅ | ✅ | ✅ |
| Reaproveita submissão, aprovação e snapshot | ✅ | ✅ | ✅ | ❌ |
| Vocabulário de status próprio da auditoria de processo | ❌ | ❌ | ✅ | ✅ |

## 4. Decisões derivadas

### D-L · `app.evaluation_model`, com default que preserva a história

```
alter table public.evaluations
  add column evaluation_model app.evaluation_model not null default 'legacy_template';
```

Toda linha existente nasce `legacy_template` **pelo default da coluna** — nenhum `UPDATE`
semântico, porque é o que elas sempre foram. É o mesmo mecanismo que a 0040 usou para
`action_plans.source = 'legacy'`.

### D-M · `template_version_id` anulável, mas só para o modelo novo

```
alter table public.evaluations alter column template_version_id drop not null;

check (
  (evaluation_model = 'legacy_template'  and template_version_id is not null)
  or (evaluation_model = 'monthly_criteria' and template_version_id is null)
)
```

O CHECK é **mais forte** que o `not null` que substitui: antes, nada impedia uma auditoria
legada de existir sem template *futuro*; agora o modelo declara qual das duas formas vale, e a
outra é impossível. `official_snapshots` recebe o mesmo par.

**`monthly_criteria` não usa template legado — e não pode fingir que usa.** Preencher
`template_version_id` com "o template mais recente" faria o relatório histórico enriquecer
respostas com itens de um checklist que a auditoria nunca respondeu.

### D-N · Status próprio: `app.criterion_answer_status`

```
create type app.criterion_answer_status as enum
  ('nao_avaliado', 'conforme', 'nao_conforme', 'nao_aplicavel');
```

Quatro valores, contra os cinco de `app.traffic_light`. **A diferença é o amarelo**, e ela é
deliberada: a auditoria de processo pergunta se o processo *existe e é executado*, e não há
resposta intermediária para isso. Inventar "parcialmente executado" seria regra empresarial que
ninguém declarou.

`nao_aplicavel` **não entra em numerador nem denominador** — mesma matemática que
`app.evaluation_score` já aplica ao `not_applicable` legado.

### D-O · Pontuação da auditoria mensal: **PENDENTE A-10**

`app.evaluation_score` divide por `audit_items.weight`. Critérios **não têm peso**: os dez campos
de D4 não incluem um, e D10 diz que *"não há peso padrão aprovado"* (pendência A-04) para a
ponderação regional — que é outra coisa, mas mostra que peso é decisão empresarial, não default
técnico.

**Decisão conservadora:** `evaluations.score` de uma auditoria `monthly_criteria` guarda a
**proporção simples de conformidade** — conformes sobre avaliados, com `nao_aplicavel` fora dos
dois lados —, e isso fica **declarado como provisório** na nova pendência **A-10**. Não é
ponderação, não é o Índice de Excelência, e não deve ser lido como tal enquanto A-10 estiver
aberta.

Não se inventa peso. Não se reutiliza o peso do indicador — ele é da configuração regional e
serve à Gestão Assistida (ADR-135-001, D-B), não ao critério de processo.

### D-P · Evidência com vínculo próprio, mas **reaproveitando o caminho físico**

`evaluation_answer_evidence.answer_id` referencia `evaluation_answers` e é `not null`. A auditoria
nova recebe `evaluation_criterion_answer_evidence`, com FK à resposta do critério e a
`evidence_files`.

**O que NÃO é duplicado:** o fluxo `reserve_evidence_upload` → objeto no bucket →
`confirm_evidence_upload`, com a trava D-02 (*sem objeto no armazenamento, não nasce metadata*),
a higiene de reservas abandonadas, os limites de tipo e tamanho e as policies do bucket privado.
Esse caminho está provado e é reaproveitado: `evidence_upload_reservations` ganha
`criterion_answer_id` anulável, com CHECK de exclusividade contra `answer_id`.

`app.can_read_evidence_object` **continua valendo sem alteração**: ela resolve por
`evidence_files.source_object_id -> evaluations -> has_operation_access`, e `source_object_id` é a
avaliação nos dois modelos.

**O-05 não é corrigido aqui.** `sha256` continua nulo, e continua sendo achado separado.

### D-Q · Correção do ADR-135-002: **`monthly_audit_id` NÃO será criada**

O ADR-135-002 §4 (D-H) previu `monthly_audit_id uuid -> evaluations(id)` como terceira perna do
CHECK. **Está errado, e a razão é dupla:**

1. **é redundante** — `action_plans.evaluation_id` existe desde `0001:334` e já referencia
   `evaluations(id)`. Duas colunas para a mesma coisa divergiriam no primeiro conserto;
2. **é grosso demais** — apontar para a auditoria inteira não diz **qual não conformidade**
   originou o plano. O ciclo semanal aponta para o item (`assisted_entry_id`); o mensal precisa
   apontar para a resposta.

**Correção:**

```
alter table public.action_plans
  add column monthly_criterion_answer_id uuid references public.evaluation_criterion_answers(id);

check (
  (source = 'legacy'   and assisted_entry_id is null and monthly_criterion_answer_id is null)
  or (source = 'assisted' and assisted_entry_id is not null and monthly_criterion_answer_id is null)
  or (source = 'monthly_audit'
      and assisted_entry_id is null
      and monthly_criterion_answer_id is not null
      and evaluation_id is not null
      and item_id is null)
)
```

`item_id is null` na terceira perna importa: um plano mensal que carregasse `item_id` seria
contado pelo portão de "item vermelho sem plano" de `submit_evaluation`, satisfazendo a auditoria
legada com um plano que não é dela.

### D-R · **Sem** índice único no vínculo mensal

O vínculo semanal é 1:1 (ADR-135-002, D-I) porque toda a documentação fala do plano do desvio no
singular. Para a auditoria mensal **não há decisão equivalente**, e uma não conformidade de
processo pode razoavelmente exigir mais de uma ação. Fica **N:1**, e a submissão exige **ao menos
um** plano — não exatamente um.

Assimetria deliberada e registrada. Não é descuido.

### D-S · O relatório oficial **recusa** o modelo novo, em vez de produzir lixo

`get_official_audit_report_data` lê `official_snapshots.payload`, que é `app.evaluation_dto` — o
DTO legado, cujas `answers` vêm de `evaluation_answers` com `join audit_items`. Sobre uma
auditoria `monthly_criteria` ela devolveria um relatório **sintaticamente válido e vazio**.

A função recebe uma guarda que **só dispara para `monthly_criteria`**, recusando com erro nominal.
Para `legacy_template` o caminho é o mesmo, byte a byte — e é o teste de determinismo já existente
(`src/db/official_audit_report.integration.test.ts`) que prova isso continuar verdadeiro.

**`REPORT_FORMAT_VERSION` continua `1.3.3` e não é reutilizada pelo modelo novo.** O contrato do
novo PDF não foi congelado (pendência **A-05**), e a interface **não oferece** ação de PDF para
auditoria mensal — botão que gera documento incompatível é pior que botão ausente.

Para a interface consultar a auditoria aprovada existe uma RPC própria de leitura do snapshot
mensal, com ordenação explícita e estável.

## 5. Consequências

**Positivas**

- o caminho legado sobrevive sem uma linha alterada, e os 40 códigos continuam podendo ser
  remedidos quando staging estiver liberado;
- a auditoria nova nasce com integridade referencial em todos os vínculos;
- submissão, validação hierárquica, snapshot e trilha são reaproveitados, não recriados;
- o plano aponta para a não conformidade concreta, e a exportação futura poderá dizer *de qual
  critério* ele veio.

**Negativas, assumidas**

- **duas tabelas de resposta** e dois vínculos de evidência convivendo. É o preço de não
  reinterpretar o legado, e Migração §3.3 já chamava isso de coexistência, não de dívida;
- **um discriminador a mais**: quem lê `evaluations` precisa saber que ela tem duas formas;
- a nota da auditoria mensal é **provisória** (A-10) até que a regra de pontuação seja decidida.

**Neutras**

- auditorias mensais **legadas** (`frequency = 'monthly'` sobre template) continuam existindo e
  continuam sendo `legacy_template`. O cutover é que decidirá quando parar de criá-las, e o
  cutover continua desativado.

## 6. O que esta decisão NÃO decide

| # | Continua pendente |
|---|---|
| **A-05** | contrato e versão do novo PDF mensal — aqui apenas **não fingido** |
| **A-10** ⭐ | **NOVA** — regra de pontuação da Auditoria Mensal. Proporção simples é provisória |
| **A-02** | data de cutover |
| **A-03** | decisão nominal dos quatro drafts de produção |
| **O-05** | `sha256` nulo nas evidências |
| **40 códigos** | remedição contra staging |

Nenhuma conversão de `audit_items`, nenhum template artificial, nenhum recálculo de snapshot
histórico, nenhuma alteração de ID existente.
