# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fase 11: homologação controlada e release candidate

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.
> O SHA selado está em
> `E:\AACE_Backups\AAPEx-135-FASE-10-INTERFACE-RELATORIO-20260802-1307\15-GIT.md`.

> ## ⛔ A FASE 11 ESTÁ BLOQUEADA — leia isto antes de colar o prompt
>
> A Fase 11 recebeu **NO-GO em 02/08/2026**. Ela **não foi iniciada**, e não falhou.
>
> **O que falta, exatamente:** um project ref do Supabase identificado como
> **homologação, disposable ou temporário**, distinto de `qcixfsdyfpankpatbays` (staging
> **congelado**, com a fixture da simulação de dois meses) e de `plnbgdabciwygsmnyddy`
> (**produção**), com autorização explícita do proprietário para receber migrations.
>
> Em 02/08/2026 esse ambiente **não existia em lugar nenhum**: o único ref vinculado
> (`supabase/.temp/project-ref`) é o staging congelado.
>
> **Enquanto não existir, não cole o prompt.** Reutilizar o staging violaria a fixture; criar um
> projeto pago não está autorizado; improvisar não é uma terceira opção.

> **Por que a Fase 11, e não a 12.** A Fase 10 está concluída: as quatro pendências que travavam o
> produto foram congeladas, o Relatório Oficial da Auditoria Mensal existe, e a interface distingue
> os três blocos. O que resta antes de produção é **provar tudo isso em runtime real** — e isso é a
> Fase 11. A Fase 12 depende de um release candidate homologado, que ainda não existe.

---

## O que a Fase 10 entregou

| Entrega | Onde |
|---|---|
| **A-10** — pontuação do processo | `0050`; a matemática já estava certa, e a **borda** do `coalesce(...,0)` foi corrigida |
| **A-11** — pontuação do desempenho | `0050`; **100/50/0 ponderado** pelo peso materializado |
| **A-06** — conteúdo do Resumo | `0050`; doze itens, sete proibições |
| **A-05** — formato do relatório | `0051`; **1.3.5** criada, **1.3.3 preservada** |
| PDF mensal | `src/domain/report/pdf/renderMonthlyAuditReport.ts` |
| Três blocos e terminologia D8 | `OperationDetailScreen`, `MonthlyAuditScreen` |
| Acessibilidade como teste | `src/screens/accessibilityAudit.test.ts` |

**2305 testes verdes em 136 arquivos.** Migrations `0001`–`0051`; próximo livre **0052**.
Versão **1.3.4**, build **8** — sem bump.

## Estado a confirmar

```
branch     aapex-1.3.5-assisted-management-monthly-audit
HEAD       bd4d0fc9530d3b8c35ca474842a0ed94cad5457f
main       8ffc49a  (= origin/main), INTACTA
árvore     limpa
REPORT_FORMAT_VERSION          1.3.3   (PRESERVAR)
MONTHLY_REPORT_FORMAT_VERSION  1.3.5
weekly_audit_cutover_date      JSON null
region_weightings              0 linhas
```

**Diante de divergência não compreendida: PARE.**

## O prompt autônomo da Fase 11

Está em
`E:\AACE_Backups\AAPEx-135-FASE-10-INTERFACE-RELATORIO-20260802-1307\17-PROMPT-FASE-11.md`,
com os 25 gates, as dez armadilhas conhecidas e as proibições ativas.

## O que continua devido

| # | Pendência |
|---|---|
| **A-01** | regra de status para `target_band` |
| **A-02** | data de cutover — continua **nula** |
| **A-03** | decisão nominal dos quatro drafts de produção |
| **A-04** | **pesos empresariais reais** — `region_weightings` continua **vazia** |
| **A-07** | autoridade regional apenas por `user_scopes.region_id` |
| **BACKFILL** | catálogo legado sem configuração regional — bloqueia a ativação |
| **40 códigos** | remedição contra staging — exige a frase literal de autorização |

**Gates manuais**, com pacote pronto em `pacote-manual/` dentro do checkpoint: PDF em leitor real ·
XLSX no Excel real · CSV em aplicativo real · navegação sem mouse · 375/768/1366 px.
**Nenhum foi declarado cumprido.**

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 11 (homologacao controlada e release candidate).

ANTES DE MAIS NADA: a Fase 11 esta BLOQUEADA. Ela exige um project ref de
homologacao/disposable/temporario, distinto do staging congelado
(qcixfsdyfpankpatbays) e da producao (plnbgdabciwygsmnyddy), com autorizacao
explicita do proprietario. Em 02/08/2026 esse ambiente NAO existia. Se ainda
nao existir, PARE e entregue NO-GO — nao reutilize o staging, nao crie projeto
pago, nao improvise.

A Fase 10 esta CONCLUIDA. A-05, A-06, A-10 e A-11 foram congeladas em
02/08/2026 e sao canonicas; nao reabrir. Migrations 0001-0051, proximo livre
0052. 2305 testes verdes em 136 arquivos. Versao 1.3.4, build 8, sem bump.
REPORT_FORMAT_VERSION 1.3.3 preservada; MONTHLY_REPORT_FORMAT_VERSION 1.3.5.
Cutover NULO e region_weightings VAZIA.

Leia o checkpoint
E:\AACE_Backups\AAPEx-135-FASE-10-INTERFACE-RELATORIO-20260802-1307\
(00, 07, 12, 13, 14, 15, 16 e o prompt em 17) e os documentos 1.3.5, inclusive
o ADR-135-004. Rode o preflight Git.

Restricoes: fixture congelada, producao proibida, sem merge em main, sem push
de main, migrations aditivas, autoria exclusiva do proprietario e sem mencao a
IA.
```
