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
| **A-05** | **Nova `REPORT_FORMAT_VERSION`** | Só após o contrato canônico do novo PDF ser congelado |
| **A-06** | **Escopo do “Resumo” na exportação** | As abas estão nomeadas; o conteúdo do Resumo não foi especificado |
| **A-10** ⭐ | **Regra de pontuação da Auditoria Mensal** | Critérios **não têm peso** — os dez campos de D4 não incluem um. A Fase 5 adotou **proporção simples de conformidade**, com `nao_aplicavel` fora dos dois lados, e a declarou **provisória**. Não é ponderação e não é o Índice de Excelência. Ver [ADR-135-003 §4, D-O](../architecture/ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md) |
| **A-11** ⭐ | **Regra de pontuação do eixo de DESEMPENHO (Gestão Assistida)** | **NOVA, aberta em 02/08/2026 na Fase 8.** O índice ponderado de D10 precisa de um número em cada eixo. O mensal tem um, provisório (A-10). O eixo de desempenho **não tinha nenhum**: a Gestão Assistida produz *status* por indicador, não nota. Adotada a **mesma forma** de A-10 — `conforme / (conforme + atencao + nao_conforme) × 100`, com `sem_dado` fora dos dois lados — e **declarada provisória**. `atencao` conta como não conformidade porque D2 a trata como desvio que exige plano; não há decisão que a torne meia conformidade. **Não é decisão tomada, é pendência registrada** |
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
