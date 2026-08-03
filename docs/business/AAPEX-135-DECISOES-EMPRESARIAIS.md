# AAPEx 1.3.5 — Decisões Empresariais

**Status:** canônico · aprovado pelo proprietário
**Data:** 01/08/2026
**Branch:** `aapex-1.3.5-assisted-management-monthly-audit` (base `8ffc49a`, versão 1.3.4)
**Escopo deste documento:** registrar as decisões como aprovadas. **Nenhuma regra de negócio foi
inventada aqui.** Onde a decisão não existe, o documento diz explicitamente que não existe.

Documentos irmãos: [Modelo Operacional](AAPEX-135-MODELO-OPERACIONAL.md) ·
[Impacto Técnico](../architecture/AAPEX-135-IMPACTO-TECNICO.md) ·
[Migração e Compatibilidade](../architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md) ·
[Plano de Implementação](../architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md) ·
[Matriz de Permissões](../architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md) ·
[Contratos de Dados](../architecture/AAPEX-135-CONTRATOS-DE-DADOS.md)

---

## 1. O que muda

O AAPEx passa a ter **dois módulos operacionais distintos**, com propósitos que não se confundem:

| | **Gestão Assistida** | **Auditoria Mensal** |
|---|---|---|
| Periodicidade | **semanal** | **mensal** |
| Pergunta que responde | *qual foi o resultado?* | *o processo que sustenta o resultado existe e é executado?* |
| Natureza | desempenho, resultado, evolução | processo, conformidade, implantação, rotina |
| Origem do dado | **fonte oficial externa**, digitada pelo GC | verificação in loco com evidência |
| Produto | diagnóstico e plano de ação | aprovação e **snapshot oficial** |

> **O AAPEx não é a fonte primária dos indicadores.** É a ferramenta de registro, comparação,
> análise, diagnóstico, plano de ação e acompanhamento.

**A Auditoria Semanal deixa de existir como fluxo novo.** Depois do cutover não serão criadas novas
Auditorias Semanais. As existentes permanecem como **histórico legado, read-only**.

**Não converter automaticamente histórico semanal em Gestão Assistida.**

## 2. Decisões canônicas

### D1 — Gestão Assistida (acompanhamento semanal)

Durante a visita semanal o Gerente de Canal: consulta os resultados na **fonte oficial externa**,
acessa o AAPEx, informa manualmente o resultado de cada indicador, compara com a **meta cadastrada
no AAPEx**, visualiza o **status calculado pelo sistema**, identifica desvios, registra
**diagnóstico**, cria **plano de ação** com **responsável** e **prazo**, e acompanha a evolução nas
visitas seguintes.

**Domínio e estruturas próprias.** Decisão expressa: *não sobrecarregar silenciosamente
`evaluations` com um segundo significado incompatível.*

**Um ciclo oficial por parceiro por semana.**
- `week_start_date`; semana de **segunda a domingo**; timezone **America/Sao_Paulo**.
- Unicidade **server-side** por `(operation_id, week_start_date, tipo Gestão Assistida)`.
- **Idempotência garantida no servidor** — não no cliente.

**O ciclo registra, por indicador:** valor realizado · meta · tolerância · unidade · orientação ·
peso · tema · **versão do indicador** · status calculado · **período da fonte** · **data da
consulta** · referência textual (opcional) · observação · ator · data de registro.

### D2 — Status calculado

Valores: **conforme · atenção · não conforme · sem dado**.

| Orientação | Conforme | Atenção | Não conforme |
|---|---|---|---|
| **Higher better** | realizado ≥ meta | abaixo da meta, **dentro** da tolerância | **além** da tolerância |
| **Lower better** | realizado ≤ meta | acima da meta, **dentro** da tolerância | **além** da tolerância |

- **Cálculo autoritativo server-side.**
- Ao **fechar o ciclo**, materializar a regra vigente para **impedir recálculo histórico**.
- **`atenção` e `não conforme` exigem** diagnóstico, plano, responsável e prazo.
- **`conforme`**: os quatro são opcionais.

> ⚠️ **Decisão ainda não tomada:** o enum `app.indicator_direction` inclui um terceiro valor,
> **`target_band`**, para o qual **nenhuma regra de status foi definida**. Ver §5.

### D3 — Temas e indicadores

Padrões de criação:
```
include_in_assisted_management = true
include_in_monthly_audit       = false
```

Temas e indicadores devem ser **criáveis, editáveis por nova versão, ordenáveis, inativáveis e
historicamente preservados**.

- **Não permitir exclusão destrutiva com histórico.**
- **Alterações futuras não modificam ciclos ou auditorias encerrados.**

### D4 — Auditoria Mensal

- **Uma Auditoria Mensal oficial por parceiro por competência.**
- Participam **somente** indicadores com `include_in_monthly_audit = true`.
- **Indicador auditável deve possuir ao menos um critério ativo.**

**Critérios versionados**, com: pergunta · descrição · orientação · ordem · obrigatório ·
evidência obrigatória · permite N/A · exige justificativa · vigência · ativo/inativo.

- **Não gerar critérios automaticamente a partir do nome do indicador.**
- **Não converter automaticamente o checklist antigo em critérios.**

**Ao criar a auditoria:** selecionar versões vigentes → **materializar critérios** → preservar a
configuração → **impedir alteração retroativa**.

**A aprovação gera snapshot oficial imutável.**

### D5 — Histórico e cutover

**Preservar integralmente:** auditorias históricas, respostas, evidências, snapshots, relatórios,
planos e `audit_logs`.

- Os **quatro drafts existentes em produção não serão convertidos automaticamente**. Antes do
  cutover, **cada um receberá decisão nominal**: concluir como legado · cancelar formalmente ·
  manter arquivado como draft legado.
- **A data de cutover ainda não está definida.**
- **Criar estrutura parametrizável, mas não ativar o cutover.**

> ⚠️ **Desambiguação obrigatória.** Os *quatro drafts de produção* citados aqui **não são** os
> quatro rascunhos sintéticos encontrados no **staging** pela reconciliação P-02. Ambos são quatro
> por coincidência. Ver [Migração e Compatibilidade](../architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md) §4.

### D6 — Planos de ação

**Um único motor de planos.** Origens possíveis: **Gestão Assistida · Auditoria Mensal · legado**.

**Preservar:** `open` · `waiting_partner` · `blocked` · `done` · `validated` · `overdue` ·
anti-auto-validação · `validated_by` · `validated_at`.

- **Escolher modelagem de origem com integridade referencial real.**
- **Não adotar somente `source_type` + UUID sem validação de existência.**
- **Documentar a alternativa escolhida antes de escrever migration** →
  [Contratos de Dados](../architecture/AAPEX-135-CONTRATOS-DE-DADOS.md) §5.

### D7 — Permissões

| Papel | Pode |
|---|---|
| **ADMIN** | gestão **global** de temas, indicadores, critérios, ponderações e exportações |
| **GERENTE REGIONAL** | gestão **dentro da própria região** |
| **COORDENADOR** | consulta, acompanhamento, validação e exportação **do próprio escopo** |
| **GERENTE DE CANAL** | registro de resultados, Gestão Assistida, Auditoria Mensal, diagnósticos e planos — **sem editar metas, temas ou definições** |

> **Autorização obrigatoriamente server-side.** A interface não é barreira de segurança.

### D8 — Relatórios e navegação

| Origem | Nome canônico |
|---|---|
| Fonte **externa** consultada pelo GC | **“Relatório oficial da operação”** |
| PDF **produzido pelo AAPEx** | **“Relatório Oficial da Auditoria Mensal”** |

- **`REPORT_FORMAT_VERSION` 1.3.3 permanece** para documentos históricos.
- A versão do novo formato **só será definida quando o contrato canônico do novo PDF estiver
  congelado**.
- **O-12 deve ser resolvido estruturalmente:** auditoria aprovada acessível, ação explícita
  **“Ver auditoria”**, `Pressable`, role apropriado, teclado, foco, leitor de tela, e acesso a
  snapshot, respostas, evidências, planos e PDF.

### D9 — Exportação

Módulos: **Gestão Assistida · Auditoria Mensal · Planos · Resumo**. Formatos: **CSV** e **XLSX**.

Filtros: período · parceiro · GC · Coordenador · tema · indicador · módulo · status.

Abas do XLSX: `Gestao_Assistida` · `Auditoria_Mensal` · `Planos` · `Resumo` · `Filtros_Aplicados`.

- **Mitigar CSV injection** em textos iniciados por `=` `+` `-` `@`.
- **Não inserir fórmulas no XLSX.**
- **Preservar números e datas como tipos próprios.**
- **Autorização, escopo e filtros server-side.**

### D10 — Dashboard e Matriz

**Agregações server-side:** evolução de indicadores · conformidades · não conformidades · planos
abertos, concluídos e vencidos · histórico mensal · evolução por parceiro · comparação · cobertura.

**Cada gráfico deve possuir alternativa tabular acessível.**

**Matriz:** eixo de **desempenho = Gestão Assistida**; eixo de **processo = Auditoria Mensal**.

Quadrantes preservados: **Saudável · Processo cumprido, resultado insuficiente · Resultado sem
processo · Crítico · Sem dado suficiente**.

- O **índice ponderado é informação adicional; não substitui a Matriz**.
- **Ponderação versionada por região.** Pesos devem **somar 100%**.
- **Não há peso padrão aprovado.**
- **Sem configuração:** exibir os dois eixos, informar **“Ponderação não configurada”**, e **não
  calcular índice consolidado**.
- **Na ausência de um módulo:** dados insuficientes; **não renormalizar o peso restante**.

## 3. Achados preservados — não corrigir nesta etapa

| Achado | Estado |
|---|---|
| **O-05** — 584/584 evidências com `sha256` nulo | preservado |
| **O-14** — sete resultados sintéticos no IND-008 | preservado |
| **O-15** — relatórios de visita órfãos | preservado |
| `AuthModeBanner` com “Supabase” e “.env” | preservado |
| Logout dos quatro GCs não concluído | preservado |

**O-12** será tratado futuramente **porque integra a nova navegação mensal** (D8).

## 4. Fora de escopo desta etapa

Nenhuma migration, nenhum código funcional, nenhuma aplicação remota. Fixture, staging e produção
permanecem inalterados. Versão permanece **1.3.4** — o bump para 1.3.5 ocorre apenas na
homologação. **1.4.0** e **2.0.0** seguem reservadas.

Não atualizar: Dossiê publicado · Histórico publicado · Marco 43 · manuais · PDFs documentais.

## 5. Decisões ainda NÃO tomadas

Registradas para não serem inventadas depois.

| # | Pendência | Por que importa |
|---|---|---|
| **A-01** | **Regra de status para `target_band`** | O enum `app.indicator_direction` tem três valores; D2 define regra só para `higher_better` e `lower_better`. Um indicador `target_band` **não tem status calculável** hoje |
| **A-02** | **Data de cutover** | Estrutura será parametrizável e **desativada** até a definição |
| **A-03** | **Decisão nominal de cada um dos 4 drafts de produção** | Concluir como legado · cancelar formalmente · arquivar |
| **A-04** | **Pesos da ponderação por região** | Não há peso padrão aprovado; sem configuração não se calcula índice |
| ~~**A-05**~~ ✅ | ~~Nova `REPORT_FORMAT_VERSION`~~ | **RESOLVIDA em 02/08/2026** — duas constantes, nunca uma. Ver §8 |
| ~~**A-06**~~ ✅ | ~~Escopo do “Resumo” na exportação~~ | **RESOLVIDA em 02/08/2026** — treze itens, sete proibições. Ver §8 |
| ~~**A-10**~~ ⭐✅ | ~~Regra de pontuação da Auditoria Mensal~~ | **RESOLVIDA em 02/08/2026.** Ver §8. *Registro do que ela foi antes:* critérios **não têm peso** — os dez campos de D4 não incluem um. A Fase 5 adotou **proporção simples de conformidade**, com `nao_aplicavel` fora dos dois lados, e a declarou **provisória**. Ver [ADR-135-003 §4, D-O](../architecture/ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md) |
| ~~**A-11**~~ ⭐✅ | ~~Regra de pontuação do eixo de DESEMPENHO (Gestão Assistida)~~ | **RESOLVIDA em 02/08/2026.** Ver §8. *Registro do que ela foi antes:* nasceu **aberta em 02/08/2026 na Fase 8**, porque o índice ponderado de D10 precisa de um número em cada eixo e o eixo de desempenho não tinha nenhum. Foi adotada a **mesma forma** provisória de A-10 — `conforme / (conforme + atencao + nao_conforme) × 100`, com `sem_dado` fora dos dois lados —, com `atencao` valendo zero *"porque não há decisão que a torne meia conformidade"*. **Agora há: vale exatamente meia** |
| **A-07** | **Definição operacional de “região” do Gerente Regional** | `user_scopes.region_id` existe; falta confirmar se a autoridade regional se resolve só por ele |
| ~~**A-08**~~ ✅ | ~~Temas e indicadores são globais ou por região?~~ | **RESOLVIDA em 01/08/2026** — modelo híbrido. Ver §6 |
| ~~**A-09**~~ ✅ | ~~Confirmar as flags de módulo na *versão* do indicador~~ | **RESOLVIDA por consequência de A-08** — ficam na versão da **configuração regional**. Ver §6 |

Nenhuma das que permanecem abertas foi preenchida por inferência.

## 6. Decisões tomadas depois da consolidação

### A-08 ✅ **APROVADA** — temas e indicadores: modelo híbrido

**Data:** 01/08/2026 · **canônica** · registrada em
[ADR-135-001](../architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md).

```
CATÁLOGO GLOBAL  +  CONFIGURAÇÃO REGIONAL VERSIONADA  +  CONTEÚDO EXCLUSIVAMENTE REGIONAL
```

- **Tema e indicador globais** — do ADMIN; disponíveis a qualquer região; o Regional não os edita.
- **Tema e indicador regionais** — do ADMIN ou do Regional da própria região; invisíveis e
  inutilizáveis pelas demais.
- **Configuração operacional regional versionada** — cada região decide, por indicador que adote:
  tema, meta, tolerância, peso, ordem, ativo, participação na Gestão Assistida, participação na
  Auditoria Mensal e critérios. **A configuração de uma região não alcança outra.**
- **Nada é operado sem configuração regional publicada** — indicador global não fica ativo em região
  alguma só por existir.

**A-09 fica resolvida por consequência:** as flags de módulo **não** vão para a versão do indicador;
vão para a **versão da configuração regional**, junto com meta, tolerância, peso, tema e ordem — são
operação da região, não semântica do indicador. Ver ADR-135-001 §4, decisão D-B.

> **Não havia mais bloqueio de entrada para a Fase 1.** As demais pendências permitem avançar com o
> comportamento conservador já especificado (falhar explicitamente, não calcular, manter inerte).

## 7. Estado das decisões depois das Fases 7, 8 e 9 (02/08/2026)

Registro do que foi **implementado** e do que **continua pendente**. Nenhuma pendência foi fechada
nesta sessão, e nenhuma foi preenchida por inferência.

| Decisão | Situação |
|---|---|
| **D5 — cutover** | ✅ **estrutura entregue e DESATIVADA** (migration 0047). `weekly_audit_cutover_date` = JSON null, provado por duas medições independentes. **A-02 continua aberta**, e **A-03** também: os quatro drafts de produção não receberam decisão nominal |
| **D9 — exportação** | ✅ **entregue** (0049 + escritores). Quatro módulos, dois formatos, oito filtros, cinco abas exatas, CSV injection neutralizada, XLSX sem fórmula. **A-06 continua aberta**: a aba `Resumo` traz um *"Resumo técnico provisório"* derivado dos outros três módulos, e nada além |
| **D10 — Dashboard e Matriz** | ✅ **entregue** (0048 + domínio + tela mínima). Agregações server-side, cinco quadrantes preservados com os limites que já existiam, alternativa tabular em cada gráfico. **A-04 continua aberta**: `region_weightings` nasceu **vazia**, e sem ponderação publicada não há índice |
| **A-10 — pontuação mensal** | ⚠️ **continua PROVISÓRIA**. `app.monthly_audit_score` **não foi tocada**. O Dashboard exibe o eixo de processo por essa regra e **diz, em texto e com papel de alerta**, que ela aguarda decisão empresarial |
| **A-11 — pontuação de desempenho** | ⭐ **NOVA e aberta.** Ver §5 |

**O que esta sessão deliberadamente NÃO fez:** ativar o cutover, definir data, decidir os quatro
drafts, semear peso, aprovar A-10, fechar A-06, gerar PDF novo, alterar `REPORT_FORMAT_VERSION` ou
fazer bump de versão. A versão continua **1.3.4** e o build continua **8**.

## 8. Decisões congeladas na Fase 10 (02/08/2026)

**Confirmadas pelo proprietário em 02/08/2026. Canônicas. Não reabrir.**
Registradas tecnicamente em
[ADR-135-004](../architecture/ADR-135-004-PONTUACOES-RESUMO-E-RELATORIO-MENSAL.md), **escrito antes
de qualquer código**.

### A-10 ✅ **APROVADA** — pontuação do processo

```
pontuacao_processo = conformes / (conformes + nao_conformes) × 100
```

- `nao_aplicavel` **fora do numerador e do denominador**;
- critério obrigatório `nao_avaliado` **impede a submissão**;
- **ausência de critérios aplicáveis = DADOS INSUFICIENTES**, e **nunca zero**;
- **não há peso individual por critério** nesta versão, e nenhum foi inventado;
- precisão **autoritativa** no armazenamento; arredondamento **só para apresentação**.

**Não é a ponderação entre módulos e não é o Índice de Excelência.**

A matemática já vigente estava **correta** e por isso não foi reescrita — o que mudou foi um
defeito de borda real: `coalesce(..., 0)` fazia o denominador zero devolver **zero**. Saiu.

Proveniência: `proporcao-simples/A-10-pendente` → **`conformidade-simples-processo/1.3.5`**.

### A-11 ✅ **APROVADA** — pontuação do desempenho

| `conforme` | `atencao` | `nao_conforme` | `sem_dado` |
|---|---|---|---|
| **100** | **50** | **0** | **sem nota, e produz insuficiência** |

```
pontuacao_desempenho = Σ(pontos × peso_materializado) ÷ Σ(pesos_materializados)
```

- usa o **peso copiado no registro histórico**; **nunca** o peso vivo do catálogo;
- `sem_dado` **não vale zero** e **não é descartado** para aumentar a nota;
- indicador obrigatório em `sem_dado` **torna o eixo insuficiente** — e, como o modelo assistido
  **não tem semântica de indicador opcional**, todo item materializado é obrigatório. Nenhuma
  opcionalidade nova foi criada;
- soma de pesos ≤ 0 → **dados insuficientes**;
- regra temporal da 0048 **preservada**; período e seleção de ciclos **inalterados**;
- **nenhuma renormalização** por dado ausente.

Proveniência: `proporcao-simples-desempenho/A-11-pendente` → **`desempenho-ponderado-status/1.3.5`**.

### Ponderação entre os módulos — **não se confunde com as duas acima**

```
indice_consolidado = desempenho × assisted_weight/100 + processo × audit_weight/100
```

Só existe com **os dois eixos suficientes**, **ponderação publicada e vigente** e
`assisted_weight + audit_weight = 100`. Sem isso: **não calcular** — nem zero, nem média.
**Nunca renormalizar** o peso restante. **Nenhum peso padrão, nenhum 50/50 semeado.**

> **A-04 continua ABERTA.** Este bloco define **como** ponderar, não **com quanto**.
> `region_weightings` continua **vazia**.

### A-06 ✅ **APROVADA** — conteúdo do Resumo

**Contém, e exatamente isto:** período · filtros efetivamente aplicados · parceiros abrangidos ·
cobertura da Gestão Assistida · cobertura da Auditoria Mensal · eixo de desempenho · eixo de
processo · planos por estado · suficiência dos dados · ponderação utilizada · índice consolidado
**somente quando permitido** · versões das regras utilizadas.

**Não contém:** ranking · meta empresarial inventada · novo semáforo executivo · projeção
financeira · KPI não aprovado · fórmula adicional · comparação fora do escopo do ator.

Rótulo: *"Resumo técnico provisório"* → **"Resumo"**. Ele cai **porque o conteúdo passou a seguir
este contrato**, não antes.

### A-05 ✅ **APROVADA** — formato do novo relatório

```
REPORT_FORMAT_VERSION         = 1.3.3   ← histórico legado. PRESERVADA.
MONTHLY_REPORT_FORMAT_VERSION = 1.3.5   ← nova. Formato mensal.
```

- a constante histórica **não é substituída** — ela identifica os quarenta documentos já emitidos;
- o relatório mensal **não nasce do caminho legado**, e `monthly_criteria` **não pode alcançar**
  `app.official_audit_report_legacy`;
- nasce **somente** de auditoria `monthly_criteria` **aprovada**, com **snapshot oficial imutável**,
  lendo **dados já materializados no snapshot**;
- **zero dependência** de catálogo vivo, do estado atual dos planos e da data atual — `generated_at`
  fica **fora** do conteúdo assinado;
- **código de integridade próprio**, determinístico, com a versão do formato participando da
  canonicalização. Os **40 códigos históricos não são alterados**.

Terminologia D8 **inalterada**: *"Relatório oficial da operação"* é a fonte externa;
**"Relatório Oficial da Auditoria Mensal"** é o documento produzido pelo AAPEx.

### O que a Fase 10 deliberadamente NÃO decidiu

**A-01** (`target_band`) · **A-02** (data de cutover) · **A-03** (os quatro drafts de produção) ·
**A-04** (**pesos empresariais reais**) · **A-07** (autoridade regional). Nenhuma foi preenchida por
inferência. O cutover continua **nulo** e `region_weightings` continua **vazia**.

---

## 9. Decisões da Fase 12-B — ativação operacional (02/08/2026)

**Responsável:** proprietário do produto · **Data:** 02/08/2026 ·
**Forma:** resposta consolidada `T: A ; M: A ; A-04: A ; A-02: A ; A-03: A`, dada depois de
apresentadas as opções permitidas pelo contrato, as consequências e a recomendação técnica.

**Justificativa comum a todas:** ativar o mínimo que torna a Gestão Assistida operável,
**sem arbitrar nenhum valor empresarial** e sem alterar o que já funciona. Cada decisão adiada
permanece adiada de forma explícita, não por esquecimento.

### T ✅ **APROVADA** — um único tema provisório

Os 13 indicadores passam a responder por um tema **global** único, código `GERAL`, nome
*"Geral"*. A descrição registra, no próprio dado, que **nenhuma subdivisão temática foi
decidida** e que o tema vale até o responsável definir os seus.

**Por que não os oito pilares do checklist legado:** eles existem em `audit_items.pillar` e
descrevem *itens de auditoria*, não indicadores. Não existe, em lugar nenhum, mapeamento de
indicador para pilar — criá-lo seria arbitrar taxonomia empresarial.

### M ✅ **APROVADA** — somente Gestão Assistida

`include_in_assisted_management = true` e `include_in_monthly_audit = false` nos 13.

**A Auditoria Mensal permanece desligada por impossibilidade técnica declarada, não por
preferência:** a guarda da 0038 exige *"ao menos um critério publicado e ativo para este
indicador na região"*, e **não existe nenhum critério mensal** em produção. Ligá-la exige antes
a definição empresarial dos critérios.

### A-04 ✅ **APROVADA — permanece NÃO CONFIGURADA**

`region_weightings` continua **vazia**, por decisão expressa.

**Consequência medida, não suposta:** `get_weighting_status()` devolve
`configured: false · "Ponderacao nao configurada"`, e o índice consolidado **não é calculado**.
Publicar peso agora não produziria efeito visível de qualquer modo, porque o eixo de processo
não tem nota enquanto a Auditoria Mensal estiver desligada.

### A-02 ✅ **APROVADA — cutover permanece DESATIVADO**

`weekly_audit_cutover_date` continua **JSON null**. A Auditoria Semanal segue integralmente
operável — `weeklyAuditClosed: false`, os 16 itens semanais intactos.

**Ordem preservada:** o cutover não pode preceder o backfill, e agora que o backfill existe ele
ainda depende de confiança operacional na Gestão Assistida rodando com dado real.

### A-03 ✅ **APROVADA — os quatro rascunhos permanecem como estão**

**Achado que determinou a decisão, e que o contrato original não previa:** das 48 respostas dos
quatro rascunhos, **45 estão `not_evaluated`**, e há **zero evidências** em produção contra 24
itens que exigem evidência. As três opções que a §5 previa não são todas executáveis:

| Opção do contrato | Situação real |
|---|---|
| **Concluir como legado** | **impossível** — `submit_evaluation` barra por resposta faltante e por evidência ausente. Executá-la exigiria fabricar dado |
| **Cancelar formalmente** | **não existe mecanismo** — `app.evaluation_status` é `draft · submitted · returned · approved · superseded` |
| **Arquivar** | **não existe mecanismo**, pelo mesmo motivo |

Deixá-los em rascunho é, portanto, **o único caminho que não fabrica dado nem cria
funcionalidade**. Criar estado de cancelamento exigiria migration nova — funcionalidade, fora do
escopo declarado da Fase 12-B.

**Efeito colateral registrado:** os **2 rascunhos semanais** mantêm o caminho da Auditoria
Semanal aberto **só para essas duas operações** (de 14) mesmo depois de um eventual cutover,
pela cláusula de proteção da 0047 que evita rascunho órfão. **A-02 e A-03 se conversam**, e quem
ativar o cutover precisa saber disso. As operações envolvidas se identificam por consulta, e
não são nomeadas aqui: nome de parceiro é dado real e não se versiona.

### O que a Fase 12-B deliberadamente NÃO decidiu

**A-01** (`target_band`) — **inerte e comprovado**: os 13 indicadores são 10 `higher_better` e
3 `lower_better`; **zero** `target_band`. Não bloqueia nada hoje.
**A-07** (autoridade regional) — sem mudança.
**Critérios da Auditoria Mensal** — não definidos; bloqueiam M=B.
**Os 40 códigos** — não necessários à ativação; não foram criados preventivamente.

---

## 10. Fase 12-B, segunda rodada — o modelo legado sai de operação (02/08/2026)

**Esta seção SUPERSEDE A-02 e A-03 da §9, no mesmo dia.** O registro anterior fica como
está: a decisão mudou por um fato novo, e apagar o histórico da decisão seria pior do que
mostrar a virada.

### O fato novo

No smoke do Administrador, um clique no botão **"Checklist semanal legado"** gravou em
produção uma avaliação, 16 respostas e o primeiro evento de trilha que aquele banco já
teve. O proprietário rejeitou — corretamente — a leitura de que isso fosse "prova
positiva" e mandou apurar.

**A apuração desmentiu parte do diagnóstico inicial e confirmou o resto:**

| Hipótese | Veredito |
|---|---|
| "a navegação/consulta grava" | **FALSO** — os dois `useEffect` da ficha só leem |
| "o botão cria sem confirmação" | **VERDADEIRO** — criava na hora, e o rótulo parecia navegação |
| "o admin não podia criar" | **PARCIAL** — o sistema autoriza desde a `0006`/`0031`; nenhum documento declarava |

Descobriu-se também que **a Matriz de Permissões nunca teve seção para a Auditoria
Semanal legada** — a linha "consultar global" que se citou era da Gestão Assistida.

### A decisão — opção 4

O proprietário escolheu **tirar o modelo legado de operação e começar com zero dado
operacional de avaliação**:

| # | Decisão | Como foi materializada |
|---|---|---|
| 1 | Desligar os checklists legados **semanal e mensal** | cutover ativado em **02/08/2026**, fuso `America/Sao_Paulo` |
| 2 | Impedir a abertura de qualquer novo checklist legado | migration **0052** estende a guarda às **duas** frequências e **remove a cláusula de escape** |
| 3 | Remover os dois botões da interface | `OperationDetailScreen` — botões e função `launch` excluídos |
| 4 | Limpar as 5 avaliações e as 64 respostas | RPC **`admin_purge_legacy_evaluations`**, auditada |
| 5 | Começar com zero dado operacional | `evaluations = 0`, `evaluation_answers = 0` |
| 6 | Gestão Assistida disponível, Mensal desligada | inalterado: 13 configurações ativas, `audit_criteria = 0` |

**Preservado por exigência expressa:** tabelas, catálogo legado (1 modelo, 1 versão, 24
itens), migrations, estrutura histórica, plano de ação legado, medições e resultados.
**Nenhuma remoção física de tabela. Nenhuma reestruturação de esquema.**

### O que tornou o expurgo aceitável, e foi medido antes

```
avaliacoes fora de rascunho .... 0      snapshots oficiais ... 0
validacoes ..................... 0      diagnosticos ......... 0
arquivos de evidencia .......... 0      vinculos evidencia ... 0
planos vinculados a avaliacao .. 0      objetos no Storage ... 0
```

**Nenhuma auditoria legada jamais foi concluída nesta produção.** O expurgo não destruiu
resultado oficial algum, porque nunca houve nenhum. Se houvesse, a própria RPC teria
recusado — e recusou, de fato, em homologação, onde existem 2 aprovadas e 2 snapshots.

### A trilha não foi apagada

`audit_logs.object_id` é `text` **sem FK**, então o evento `evaluation.created` do smoke
**sobreviveu** ao expurgo. A produção terminou com **três** eventos, e não com zero:

```
evaluation.created          (02/08 22:55)  — preservado
weekly_audit_cutover_set    (02/08 23:43)
legacy_evaluations_purged   (02/08 23:44)  — motivo, 5 apagadas, 64 respostas,
                                             ids, fuso e ator administrador
```

### A-01 e A-07

Sem mudança. **A-01 segue inerte** (zero `target_band`).

### O que NÃO foi decidido, e continua aberto

**Quem pode iniciar avaliação no modelo legado** deixou de ser questão prática — o modelo
está fechado. Mas a **lacuna documental permanece**: se um dia o legado for reaberto, a
Matriz precisa declarar o que nunca declarou. Fica registrado em §11 da Matriz.
