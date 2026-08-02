# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, fechamento dos gates manuais

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.

> ## ✅ A FASE 11 FOI HOMOLOGADA — e o que falta é curto
>
> A homologação controlada rodou em **02/08/2026** contra o projeto
> **AAPEx 1.3.5 Homologacao** (`qjvpkaurihjvzktlinhp`, ca-central-1), provisionado e
> autorizado pelo proprietário. Os 51 migrations foram aplicados do zero, Local = Remote,
> e os fluxos foram exercitados em runtime real. Relatório completo em
> `docs/architecture/AAPEX-135-FASE-11-HOMOLOGACAO.md`.
>
> **O staging `qcixfsdyfpankpatbays` e a produção `plnbgdabciwygsmnyddy` continuam intocados.**
>
> **O release candidate NÃO foi congelado.** Faltam três gates que exigem aplicativo de
> mesa real e que o contrato proíbe declarar sem execução:
>
> | Gate | O que falta |
> |---|---|
> | **14** | abrir o **XLSX no Excel real** |
> | **15** | abrir o **PDF em leitor real** |
> | **17** | acessibilidade com **teclado e leitor de tela reais** |
>
> Enquanto os três não forem cumpridos, **não faça o bump**: o aplicativo continua
> **1.3.4 · build 8**.

---

## Estado a confirmar

```
branch     aapex-1.3.5-assisted-management-monthly-audit
main       8ffc49a  (= origin/main), INTACTA
árvore     limpa
versão     1.3.4 · build 8            (SEM bump — gate 25 bloqueado)
REPORT_FORMAT_VERSION          1.3.3   (PRESERVAR)
MONTHLY_REPORT_FORMAT_VERSION  1.3.5
weekly_audit_cutover_date      JSON null
migrations 0001-0051 · próximo livre 0052
testes     2305 verdes em 136 arquivos
homologação  qjvpkaurihjvzktlinhp — 51 migrations, fixture sintética preservada
```

**Diante de divergência não compreendida: PARE.**

## O que a Fase 11 provou (não repetir)

| Prova | Resultado |
|---|---|
| Local × Remote | 51/51; COLUMN, ENUM, GRANT, INDEX, **POLICY**, TABLE, TRIGGER e VIEW com **hash idêntico** |
| Auth, RLS e isolamento | os quatro papéis, nas duas direções, inclusive Storage |
| Gestão Assistida | idempotência com **6 aberturas concorrentes**, SEM DADO ≠ zero, fechamento imutável |
| Auditoria Mensal | evidência física, plano obrigatório, snapshot único, imutabilidade |
| **A-10** | 66,67 · **denominador zero → NULO** |
| **A-11** | **72,22** ponderado (aritmética seria 50) · SEM DADO → NULO |
| **A-06** | Resumo sem ranking, com proveniência das regras |
| Relatórios | 1.3.3 preservada e **recusando** o modelo mensal; 1.3.5 validada a partir do snapshot |
| Preview | dado real do novo Supabase, sem erro de console, 375/768/1366 px |

## Pendências que continuam abertas

| # | Pendência |
|---|---|
| **A-01** | regra de status para `target_band` — **confirmada em runtime**: o servidor recusa publicá-lo na Gestão Assistida |
| **A-02** | data de cutover — continua **nula** |
| **A-03** | decisão nominal dos quatro drafts de produção |
| **A-04** | **pesos empresariais reais** — a ponderação da homologação é **sintética** |
| **A-07** | autoridade regional apenas por `user_scopes.region_id` |
| **BACKFILL** | catálogo legado sem configuração regional |
| **40 códigos** | remedição contra staging — exige a frase literal de autorização |

---

## Variante curta

```
Continue a AAPEx 1.3.5. A Fase 11 (homologacao controlada) esta CONCLUIDA:
leia docs/architecture/AAPEX-135-FASE-11-HOMOLOGACAO.md antes de qualquer coisa.

O que falta para o release candidate sao TRES gates manuais, e so eles:
  14 - abrir o XLSX no Excel REAL
  15 - abrir o PDF em leitor REAL
  17 - acessibilidade com teclado e leitor de tela REAIS
Se o aplicativo nao estiver disponivel, NAO afirme que abriu: registre como
pendente. Sem os tres, NAO faca o bump — o app continua 1.3.4 build 8.

Homologacao ja provisionada: qjvpkaurihjvzktlinhp (51 migrations, fixture
sintetica preservada, duas Edge Functions publicadas). PROIBIDO tocar o staging
congelado qcixfsdyfpankpatbays e a producao plnbgdabciwygsmnyddy.

A-05, A-06, A-10 e A-11 estao CONGELADAS e sao canonicas; nao reabrir.
REPORT_FORMAT_VERSION 1.3.3 preservada; MONTHLY_REPORT_FORMAT_VERSION 1.3.5.
Cutover NULO. A-01, A-02, A-03, A-04 e A-07 seguem abertas.

Restricoes: sem merge em main, sem push de main, migrations aditivas, autoria
exclusiva do proprietario e sem mencao a IA.
```
