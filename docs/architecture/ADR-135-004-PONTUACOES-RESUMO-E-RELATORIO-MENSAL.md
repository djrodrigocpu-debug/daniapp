# ADR-135-004 — Pontuações, Resumo e Relatório Oficial da Auditoria Mensal

**Status:** aceito · **decisões empresariais A-05, A-06, A-10 e A-11 aprovadas pelo proprietário**
**Data da aprovação:** 02/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit`
**Contexto canônico:** [Decisões Empresariais §5, §7, §8](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) ·
[Modelo Operacional §7, §9](../business/AAPEX-135-MODELO-OPERACIONAL.md) ·
[ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md) · [ADR-135-002](ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md) ·
[ADR-135-003](ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md)

> **Este ADR foi escrito ANTES de qualquer migration ou alteração funcional da Fase 10**, como o
> escopo da sessão exige. Ele não propõe: registra o que o proprietário decidiu, e deriva as
> consequências técnicas.

---

## 1. Contexto: quatro pendências que travavam o produto

Ao fim das Fases 7–9 o produto estava funcionalmente completo e **empresarialmente inacabado**.
Quatro pendências não eram detalhe de acabamento — eram números e documentos que o usuário veria:

| # | Pendência | Por que travava |
|---|---|---|
| **A-10** | pontuação da Auditoria Mensal | o eixo de processo da Matriz exibia uma nota **declarada provisória na própria tela** |
| **A-11** | pontuação da Gestão Assistida | nascida na Fase 8 pela mesma razão, e pela mesma saída conservadora |
| **A-06** | conteúdo do Resumo | a aba do XLSX se chamava *"Resumo técnico provisório"* |
| **A-05** | formato do novo relatório | a Auditoria Mensal **não tinha PDF**, e a interface explicava a ausência em texto |

As quatro foram decididas pelo proprietário em **02/08/2026**. Este ADR as congela.

**O que NÃO mudou:** A-01 (`target_band`), A-02 (data de cutover), A-03 (os quatro drafts de
produção), A-04 (pesos empresariais reais) e A-07 (autoridade regional) **continuam abertas**, e
nenhuma foi preenchida por inferência aqui.

## 2. A-10 — pontuação do processo

### 2.1 A decisão

```
pontuacao_processo = conformes / (conformes + nao_conformes) × 100
```

| Regra | Valor |
|---|---|
| `nao_aplicavel` no numerador | **fora** |
| `nao_aplicavel` no denominador | **fora** |
| critério obrigatório `nao_avaliado` | **impede a submissão** |
| ausência de critérios aplicáveis | **DADOS INSUFICIENTES** |
| ausência de critérios aplicáveis como zero | **proibido** |
| peso individual por critério | **não existe nesta versão** |
| precisão armazenada | **autoritativa**; arredonda-se só para apresentar |

**A pontuação de processo não é a ponderação entre módulos e não é o Índice de Excelência.**

### 2.2 O que isso muda no código — medido antes de decidir

`app.monthly_audit_score` (`0042:374`) **já implementa a matemática canônica**:

```sql
select coalesce(round(
    count(*) filter (where a.status = 'conforme')::numeric
    / nullif(count(*) filter (where a.status in ('conforme','nao_conforme')), 0) * 100
  , 2), 0)
```

Numerador e denominador estão **corretos** — `nao_aplicavel` e `nao_avaliado` ficam fora dos dois
lados. A decisão **confirma** essa aritmética, e por isso ela **não é reescrita**: o escopo é
literal ao proibir *"alteração funcional falsa apenas para mudar o rótulo"*.

**Há, porém, uma divergência de borda real, e ela é corrigida:**

> `coalesce(..., 0)` faz o **denominador zero devolver `0`**.

Uma auditoria cujos critérios sejam todos `nao_aplicavel` recebe **nota zero** — exatamente o que a
decisão proíbe. O `nullif` já produz `null`; é o `coalesce` que o converte em zero. **Ele sai**, e a
ausência passa a viajar como `null` até a tela, o CSV, o XLSX e o PDF.

Isso reencontra a lição **L-04** da sessão anterior — *"sem dado nunca é zero"* precisa ser
defendido em cinco camadas — e mostra que a quinta camada, o banco, ainda tinha um caso escapando.

### 2.3 Proveniência

`proporcao-simples/A-10-pendente` → **`conformidade-simples-processo/1.3.5`**

O identificador **não pode** continuar dizendo *pendente*: a regra deixou de ser provisória. O
histórico de que ela **foi** provisória fica preservado neste ADR, no ADR-135-003 §4 (D-O) e no §7
das Decisões Empresariais — não se apaga o passado para o presente parecer limpo.

## 3. A-11 — pontuação do desempenho

### 3.1 A decisão

| Status | Pontos |
|---|---|
| `conforme` | **100** |
| `atencao` | **50** |
| `nao_conforme` | **0** |
| `sem_dado` | **sem nota — e produz insuficiência** |

```
pontuacao_desempenho = Σ(pontos_do_status × peso_materializado) ÷ Σ(pesos_materializados)
```

| Regra | Valor |
|---|---|
| peso usado | **o materializado no registro histórico** |
| peso vivo do catálogo no recálculo histórico | **proibido** |
| `sem_dado` valendo zero | **proibido** |
| `sem_dado` descartado para aumentar a nota | **proibido** |
| indicador obrigatório em `sem_dado` | **torna o eixo insuficiente** |
| soma de pesos ≤ 0 | **dados insuficientes** |
| regra temporal da 0048 | **preservada** |
| renormalização por dado ausente | **proibida** |

### 3.2 Por que esta é uma mudança funcional real, e A-10 não é

A regra provisória da Fase 8 (`app.matrix_entry_dto`, `0048:878`) é:

```sql
v_perf_score := case when (v_conf + v_aten + v_nc) = 0 then null
                     else round(v_conf::numeric * 100 / (v_conf + v_aten + v_nc), 2) end;
```

Três diferenças, todas materiais:

1. **`atencao` valia 0 e passa a valer 50.** A Fase 8 registrou a escolha e a razão: *"não há
   decisão que a torne meia conformidade"*. Agora **há** — e é exatamente meia;
2. **não havia peso e passa a haver.** A média era aritmética; passa a ser ponderada;
3. **`sem_dado` era descartado e passa a produzir insuficiência.** Descartar aumentava a nota de
   quem não mediu, que é o mesmo defeito que a proibição de renormalizar evita entre módulos.

### 3.3 Duas propriedades do modelo que a decisão exige, e que foram medidas

**O peso materializado existe.** `assisted_cycle_entries.weight numeric(6,2) not null default 1`
(`0039:258`), copiado no ato do registro junto com meta, tolerância, unidade, orientação e tema
(Contratos §4). Ler o peso vivo da configuração regional ao recalcular histórico seria reescrever o
passado — é a armadilha nº 1 do programa, na direção inversa.

**Não existe semântica de indicador opcional.** Varredura por `required`/`optional`/`obrigator` em
`0039_assisted_management_core.sql` devolve **zero ocorrências**. A decisão prevê o caso:
*"se não existir semântica explícita de indicador opcional, todos os itens materializados do ciclo
são obrigatórios"*. Portanto **qualquer** `sem_dado` no recorte torna o eixo insuficiente, e
**nenhuma opcionalidade nova é criada** para amenizar isso.

> **Consequência aceita e registrada.** `close_assisted_cycle` já recusa fechar ciclo com
> `sem_dado`, então um ciclo **fechado** não produz insuficiência por esse caminho. Ciclos em
> **rascunho** produzem — e devem: um eixo calculado sobre medição incompleta é um número que
> ninguém pode defender.

### 3.4 Proveniência

`proporcao-simples-desempenho/A-11-pendente` → **`desempenho-ponderado-status/1.3.5`**

### 3.5 O que NÃO muda

- **período e seleção de ciclos:** a regra temporal da 0048 é preservada letra por letra;
- **filtros:** os oito continuam valendo, e `app.filter_len` continua decidindo o que é lista vazia;
- **dados históricos:** nenhum `UPDATE` retroativo. A nota do eixo de desempenho **é calculada por
  consulta**, não materializada — logo não há registro fechado para reescrever;
- **`evaluations.score`:** continua sendo a nota **de processo**, gravada na submissão. A nota de
  desempenho não a toca.

## 4. Ponderação entre os dois módulos

A pontuação dos indicadores **não se confunde** com a ponderação dos módulos.

```
indice_consolidado = pontuacao_desempenho × assisted_weight / 100
                   + pontuacao_processo   × audit_weight    / 100
```

O índice **só existe** quando as quatro condições valem ao mesmo tempo:

1. eixo de desempenho **suficiente**;
2. eixo de processo **suficiente**;
3. ponderação regional **publicada e vigente**;
4. `assisted_weight + audit_weight = 100`.

| Situação | Comportamento |
|---|---|
| sem ponderação | **não calcular** |
| sem um módulo | **não calcular** |
| dado insuficiente | **não calcular** |
| peso restante | **nunca renormalizado** |
| 50/50 semeado | **proibido** |
| peso padrão criado | **proibido** |

A versão da ponderação e as **duas** versões de regra viajam na resposta. Os dois eixos são
preservados separadamente — o índice é informação adicional, e D10 é expressa: *"não substitui a
Matriz"*.

`region_weightings` **continua vazia** no estado local final. Fixtures transacionais e o ambiente
separado de homologação são as únicas exceções, e são sintéticas por construção.

## 5. A-06 — conteúdo definitivo do Resumo

### 5.1 O que o Resumo contém

Treze itens, e **exatamente** estes:

| # | Item |
|---|---|
| 1 | período |
| 2 | filtros efetivamente aplicados |
| 3 | parceiros abrangidos |
| 4 | cobertura da Gestão Assistida |
| 5 | cobertura da Auditoria Mensal |
| 6 | eixo de desempenho |
| 7 | eixo de processo |
| 8 | planos por estado |
| 9 | suficiência dos dados |
| 10 | ponderação utilizada |
| 11 | índice consolidado **somente quando permitido** |
| 12 | versões das regras utilizadas |
| 13 | *(o item 2 inclui o recorte que o arquivo representa — é o que `Filtros_Aplicados` já fazia)* |

### 5.2 O que o Resumo NÃO contém

**ranking · meta empresarial inventada · novo semáforo executivo · projeção financeira · KPI não
aprovado · fórmula adicional · comparação fora do escopo do ator.**

A proibição de *comparação fora do escopo do ator* não é estética: o Resumo é gerado por
`export_dataset`, que já recorta por `app.dashboard_operations`. Um ranking exibiria posição
relativa dentro de um conjunto que o ator não enxerga inteiro — e a posição **revela** o tamanho do
conjunto oculto.

### 5.3 O rótulo

*"Resumo técnico provisório"* → **"Resumo"**.

O rótulo cai **porque o conteúdo passou a seguir este contrato**, não antes. O histórico de que ele
foi provisório fica no §7 das Decisões Empresariais e aqui.

## 6. A-05 — o novo Relatório Oficial da Auditoria Mensal

### 6.1 Duas constantes, e nunca uma

```
REPORT_FORMAT_VERSION          = '1.3.3'   ← histórico legado. PRESERVADA.
MONTHLY_REPORT_FORMAT_VERSION  = '1.3.5'   ← nova. Formato mensal.
```

**A constante histórica não é substituída.** Ela identifica quarenta documentos já emitidos, cujos
códigos de integridade foram medidos contra o staging. Trocar o número que participa da
canonicalização mudaria **todos** eles — e a remedição dos 40 ainda é dívida aberta.

### 6.2 O relatório mensal não nasce do caminho legado

| Caminho | Modelo | Função |
|---|---|---|
| legado | `legacy_template` | `app.official_audit_report_legacy` — **não tocada** |
| mensal | `monthly_criteria` | **função nova, independente** |

`monthly_criteria` **não pode alcançar** `app.official_audit_report_legacy`. A guarda que a 0044
criou e a 0045 corrigiu (O-16) continua valendo, e agora deixa de citar A-05 como pendência: passa a
apontar o caminho certo.

### 6.3 De onde o relatório nasce

**Somente** de: avaliação `monthly_criteria` · **aprovada** · com snapshot oficial imutável · lendo
**dados já materializados no snapshot** · sob o contrato 1.3.5.

**Zero dependência** do catálogo vivo, do estado atual dos planos e da data atual — salvo
`generated_at`, que fica **fora** do conteúdo assinado.

> Este é o ponto em que o relatório mensal difere deliberadamente do legado. O relatório 1.3.3
> imprime *"planos atuais"* datados e **fora** do hash (`officialAuditReport.ts`, cabeçalho). O
> mensal imprime os **planos materializados no snapshot** — porque o plano mensal aponta para a
> **resposta do critério** (ADR-135-003, D-Q) e faz parte do que a auditoria afirmou. Os dois
> comportamentos são corretos para os seus contratos, e é por isso que os contratos são separados.

### 6.4 Código de integridade próprio

Determinístico, **do formato mensal**, e **não** uma reutilização artificial do histórico:

- canonical JSON, chaves em ordem definida, arrays ordenados explicitamente;
- datas em formato único; números sem variação por locale; nulos preservados;
- **ausência ≠ zero**, e **`sem_dado` ≠ zero**;
- mesma auditoria e mesmo snapshot → **mesmo código**;
- alteração de campo protegido → **código diferente**;
- `generated_at` → **não altera o código**;
- **a versão do formato participa da canonicalização.**

Os **40 códigos históricos não são alterados**, e esta fase **não afirma** tê-los remedido contra
staging.

## 7. Impacto

| Superfície | Impacto |
|---|---|
| **migrations** | `0050` (regras + proveniência) e `0051` (contrato do relatório mensal). `0001`–`0049` **imutáveis**, provadas por blob |
| **`app.monthly_audit_score`** | perde o `coalesce(...,0)`; a matemática **não muda** |
| **`app.matrix_entry_dto`** | eixo de desempenho passa a 100/50/0 ponderado; `sem_dado` produz insuficiência |
| **`app.dashboard_rule_provenance`** | duas proveniências definitivas; `provisional` some das duas notas |
| **`get_dashboard_aggregates`** | consome a mesma fonte; **nenhuma fórmula duplicada** |
| **`get_matrix_dataset`** | idem |
| **`export_dataset`** | Resumo definitivo, com os treze itens e sem os sete proibidos |
| **Dashboard e Matriz** | rótulos de provisoriedade removidos; versões das regras exibidas |
| **CSV / XLSX** | rótulos de coluna sem *"provisória"*; aba `Resumo` renomeada no conteúdo |
| **PDF** | gerador **novo e independente**, 1.3.5 |
| **`app.official_audit_report_legacy`** | **NÃO TOCADA.** RT-01 continua o risco mais alto do programa |
| **`REPORT_FORMAT_VERSION`** | **1.3.3, preservada** |

**Uma única fonte server-side.** Dashboard, Matriz, Resumo, CSV, XLSX e PDF consomem a mesma
função. Duplicar a fórmula em duas telas é como duas telas passam a discordar.

## 8. Testes obrigatórios

**A-10** — fórmula definitiva · N/A fora dos dois lados · `nao_avaliado` obrigatório bloqueia ·
**zero aplicáveis = insuficiente, e não zero** · proveniência definitiva.

**A-11** — `conforme` 100 · `atencao` 50 · `nao_conforme` 0 · `sem_dado` insuficiente ·
peso materializado usado · soma de pesos inválida = insuficiente · **histórico não usa peso vivo** ·
proveniência definitiva.

**Índice** — com e sem ponderação · módulo ausente · dado insuficiente · **sem renormalização** ·
versões registradas.

**Resumo** — os treze campos · **ausência dos sete proibidos** · filtros · cobertura · planos ·
suficiência · índice só quando permitido.

**Relatório** — só `monthly_criteria` · só aprovada · draft recusado · legado recusado · fora do
escopo indistinguível do inexistente · canonicalização · integridade · alteração protegida muda o
código · `generated_at` não muda · ordenação · ausência ≠ zero · snapshot imutável · versão 1.3.5 ·
**1.3.3 preservada**.

**PDF** — A4 · pesquisável · acentos · páginas · sem vazias · sem truncamento · código · versão ·
título · agrupamentos · evidências · planos.

## 9. O que este ADR NÃO decide

| # | Continua pendente |
|---|---|
| **A-01** | regra de status para `target_band` — continua **bloqueada, nunca inventada** |
| **A-02** | data de cutover — continua **nula** |
| **A-03** | decisão nominal dos quatro drafts de produção |
| **A-04** | **pesos empresariais reais por região** — `region_weightings` continua **vazia**. Este ADR define **como** ponderar, não **com quanto** |
| **A-07** | autoridade regional apenas por `user_scopes.region_id` |
| **O-05, O-14, O-15, O-10, RT-13** | preservados por decisão |
| **BACKFILL** | catálogo legado sem configuração regional — continua bloqueando a ativação |
| **40 códigos** | remedição contra staging |

A distinção entre **A-04** e este ADR é a que mais importa: decidir a **fórmula** da ponderação não
é decidir os **pesos**. Sem peso publicado continua não havendo índice — nem zero, nem média, nem
50/50.
