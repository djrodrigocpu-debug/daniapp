# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, release candidate congelada

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.

> ## ✅ A FASE 11 ESTÁ CONCLUÍDA — release candidate **1.3.5 · build 9**
>
> Os **25 gates** do contrato foram cumpridos em **02/08/2026**, incluindo os três gates
> humanos, executados em aplicativos reais do Windows com confirmação expressa do
> proprietário. Relatório completo em
> `docs/architecture/AAPEX-135-FASE-11-HOMOLOGACAO.md`.
>
> **O staging `qcixfsdyfpankpatbays` e a produção `plnbgdabciwygsmnyddy` continuam intocados.**
> A CLI permanece vinculada à homologação `qjvpkaurihjvzktlinhp`, de propósito.
>
> **Não há push nem merge.** A branch existe apenas localmente à frente da origem.

---

## Estado a confirmar

```
branch     aapex-1.3.5-assisted-management-monthly-audit
main       8ffc49a  (= origin/main), INTACTA
árvore     limpa
versão     1.3.5 · build 9        RELEASE CANDIDATE CONGELADA
REPORT_FORMAT_VERSION          1.3.3   (PRESERVAR)
MONTHLY_REPORT_FORMAT_VERSION  1.3.5
weekly_audit_cutover_date      JSON null
region_weightings              1 linha, SINTÉTICA (Norte)
migrations 0001-0051 · próximo livre 0052
testes     2305 verdes em 136 arquivos
homologação  qjvpkaurihjvzktlinhp — 51 migrations, fixture sintética preservada
```

**Diante de divergência não compreendida: PARE.**

## O que a Fase 11 provou (não repetir)

| Prova | Resultado |
|---|---|
| Local × Remote | 51/51; nove categorias de catálogo com **hash idêntico** |
| **Upgrade da 1.3.4** | `0001-0035` + `0036-0051` dá esquema **idêntico** ao do zero |
| Auth, RLS e isolamento | os quatro papéis, nas duas direções, inclusive Storage |
| Gestão Assistida | 6 aberturas concorrentes = 1 ciclo · SEM DADO ≠ zero · fechamento imutável |
| Auditoria Mensal | evidência física · plano obrigatório · snapshot único · imutabilidade |
| **A-10** | 66,67 · **denominador zero → NULO** |
| **A-11** | **72,22** ponderado (aritmética seria 50) · SEM DADO → NULO |
| **A-06** | Resumo sem ranking, com proveniência e A-04 declarada |
| CSV / XLSX / PDF | conferidos por humano no **Excel** e no **Adobe Reader** reais |
| Injeção de fórmula | neutralizada com apóstrofo; o Excel trata como texto |
| Teclado | percurso funcional completo sem mouse, com diálogo e `Esc` |

## Pendências abertas

| # | Pendência |
|---|---|
| **Gate 17 · Etapa B** | **leitor de tela NÃO exercitado** — dívida conhecida da 1.3.5 |
| **A-01** | regra de status para `target_band` — **confirmada em runtime** |
| **A-02** | data de cutover — continua **nula** |
| **A-03** | decisão nominal dos quatro drafts de produção |
| **A-04** | **pesos empresariais reais** — a ponderação da homologação é **sintética** |
| **A-07** | autoridade regional apenas por `user_scopes.region_id` |
| **BACKFILL** | catálogo legado sem configuração regional |
| **40 códigos** | remedição contra staging — exige a frase literal de autorização |

## A próxima fase é a 12, e ela exige autorização literal

A Fase 12 é **produção e documentação pública**: merge em `main` · migrations em produção ·
deploy no domínio produtivo · atualização dos **seis artefatos públicos** · decisão nominal dos
quatro drafts · backfill real · ativação do cutover, se e quando A-02 for definida.

**Ela não começa sem autorização literal do proprietário sobre esta release candidate.**

---

## Variante curta

```
Continue a AAPEx 1.3.5. A Fase 11 esta CONCLUIDA e a release candidate esta
CONGELADA em 1.3.5 build 9. Leia
docs/architecture/AAPEX-135-FASE-11-HOMOLOGACAO.md antes de qualquer coisa.

Os 25 gates foram cumpridos em 02/08/2026, inclusive os tres humanos (XLSX no
Excel real, PDF no Adobe Reader real, acessibilidade). RESSALVA: o gate 17 foi
aprovado com ESCOPO REDUZIDO A TECLADO — o leitor de tela NAO foi exercitado e
fica como divida conhecida.

Homologacao provisionada: qjvpkaurihjvzktlinhp (51 migrations, fixture sintetica
preservada, duas Edge Functions publicadas, CLI ainda vinculada a ela).
PROIBIDO tocar o staging congelado qcixfsdyfpankpatbays e a producao
plnbgdabciwygsmnyddy.

A-05, A-06, A-10 e A-11 estao CONGELADAS e sao canonicas; nao reabrir.
REPORT_FORMAT_VERSION 1.3.3 preservada; MONTHLY_REPORT_FORMAT_VERSION 1.3.5.
Cutover NULO. A-01, A-02, A-03, A-04 e A-07 seguem abertas.

A Fase 12 (producao) EXIGE autorizacao literal do proprietario sobre esta
release candidate. Sem essa frase, nao inicie.

Restricoes: sem merge em main, sem push de main, migrations aditivas, autoria
exclusiva do proprietario e sem mencao a IA.
```
