# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5 PUBLICADA E ATIVADA

> **Antes de colar:** conferir que a árvore está limpa e que `main` local e
> `origin/main` apontam para o **mesmo** commit.

> ## ✅ FASE 12 e FASE 12-B CONCLUÍDAS
>
> **Fase 12 (publicação)** — 02/08/2026: migrations `0036–0051` aplicadas em
> `plnbgdabciwygsmnyddy`, merge `--no-ff` em `main`, deployment **Ready**,
> **`SMOKE PRODUÇÃO APROVADO`**. Relatório em `AAPEX-135-FASE-12-PRODUCAO.md`.
>
> **Fase 12-B (ativação)** — 02/08/2026: decisões `T:A · M:A · A-04:A · A-02:A · A-03:A`
> aprovadas pelo responsável e registradas em `AAPEX-135-DECISOES-EMPRESARIAIS.md §9`.
> **Backfill executado e idempotente**: tema `GERAL` + 13 configurações regionais na região
> RPS, com metas/tolerâncias/pesos **idênticos ao catálogo vigente (13/13, zero divergentes)**.
> Relatório em `AAPEX-135-FASE-12B-ATIVACAO.md`.
>
> **Gestão Assistida ATIVA. Auditoria Mensal DESLIGADA. Cutover DESATIVADO.
> Ponderação VAZIA. Os quatro rascunhos INTACTOS** — tudo por decisão expressa.
>
> **A Fase 13 NÃO foi iniciada.**

---

## Estado a confirmar

```
main       = origin/main                 ponta documental da Fase 12-B
           ba6b7bf                       merge --no-ff que publicou a 1.3.5
           e964488                       fecho documental da Fase 12
branch     aapex-1.3.5-assisted-management-monthly-audit  = origin, ponta 11a10c7
árvore     limpa
versão     1.3.5 · build 9              PUBLICADA
migrations 0001-0051 · próximo livre 0052
testes     2305 verdes em 136 arquivos
REPORT_FORMAT_VERSION          1.3.3   (PRESERVAR)
MONTHLY_REPORT_FORMAT_VERSION  1.3.5

producao      plnbgdabciwygsmnyddy   0001-0051, Local = Remote 51/51
                                     tema GERAL + 13 config. regionais PUBLICADAS
                                     region_weightings 0 · audit_criteria 0
                                     cutover JSON null · 4 avaliacoes em draft
homologacao   qjvpkaurihjvzktlinhp   51 migrations, fixture sintetica — CLI vinculada a ela
staging       qcixfsdyfpankpatbays   CONGELADO e INTOCADO
```

**Diante de divergência não compreendida: PARE.**

## O que as Fases 12 e 12-B provaram (não repetir)

| Prova | Resultado |
|---|---|
| Backup pré-publicação | `producao-pre-135-20260802-2013` — 52 arquivos, 192 linhas |
| Backup pré-ativação | `producao-pre-135-ativacao-20260802-2146` — 66 arquivos, 193 linhas, **com cópia espelho** |
| **PITR** | **DESABILITADO** e sem backup físico — o export lógico é o único recurso |
| Migrations em produção | `0036–0051`, `migration list` **51/51 sem divergência** |
| Esquema × homologado | **idêntico em 10 categorias**, com `c=38 f=116 p=45 u=27` |
| Dado histórico | **inalterado** — 4 avaliações, 48 respostas, 0 snapshots, 1 plano, 0 trilha |
| Bundle servido | **1 único JWT** (`ref` de produção, `role: anon`), zero refs proibidos |
| Página em produção | `VERSÃO 1.3.5` · `Autenticação corporativa (Supabase)` · sem erro |
| Sondas negativas | 16 recusas; anon lê `[]` via REST em tabelas com 17/4/14/1 linhas |
| Signup público | **desligado** (`signup_disabled`) |
| **Backfill** | tema `GERAL` + **13 configurações**, valores **13/13 idênticos** ao catálogo vigente |
| **Idempotência** | reexecução em simulação: `A CRIAR: 0`, zero alterações |
| Auditoria Semanal após o backfill | **`weeklyAuditClosed: false`**, 16 itens intactos |
| Ponderação | `configured: false · "Ponderacao nao configurada"` — servidor não inventa |

## Pendências abertas

| # | Pendência | Estado em produção |
|---|---|---|
| ~~**BACKFILL**~~ ✅ | ~~configuração regional do catálogo legado~~ | **EXECUTADO** — tema `GERAL` + 13 configurações publicadas, idempotente |
| **Critérios mensais** 🔴 | nenhum definido | **0** em `audit_criteria`. Bloqueia ligar a Auditoria Mensal |
| **A-02** | data de cutover | **desativado por decisão** — `weekly_audit_cutover_date` = JSON null |
| **A-03** | os 4 drafts | **em rascunho por decisão** — cancelar/arquivar exigiria migration nova |
| **A-04** | pesos empresariais reais | **não configurada por decisão** — `region_weightings` vazia |
| **A-01** | regra de status para `target_band` | **inerte**: 10 `higher_better`, 3 `lower_better`, zero `target_band` |
| **A-07** | autoridade regional | sem mudança |
| **Gate 17 · Etapa B** | **leitor de tela não exercitado** | dívida conhecida da 1.3.5 |
| **40 códigos** | remedição | exigiria o staging congelado |

> **A-02, A-03 e A-04 não estão pendentes por esquecimento: foram decididas como
> "não ativar agora".** Reabri-las é decisão nova do responsável, não continuação.

## Se a próxima sessão for ligar a Auditoria Mensal

```
1. definir os CRITERIOS mensais por indicador (decisao empresarial, nao existe nenhum)
2. publica-los pelo catalogo regional
3. so entao virar include_in_monthly_audit para true
4. A-04 (pesos) passa a ter efeito visivel, porque o eixo de processo ganha nota
5. A-02 (cutover) so depois de confianca operacional na Gestao Assistida
```

**Armadilha registrada:** os **2 rascunhos semanais** mantêm a Auditoria Semanal aberta
**só para aquelas 2 operações** mesmo depois do cutover — é a cláusula da 0047 que evita
rascunho órfão. **A-02 e A-03 se conversam.**

## Restrições permanentes

- **Staging `qcixfsdyfpankpatbays` continua CONGELADO.** Não vincular, não consultar.
- Migrations **aditivas** apenas; próximo número livre **0052**.
- Autoria exclusiva `djrodrigocpu-debug <djrodrigocpu@gmail.com>`; **nenhuma menção a IA**.
- Sem force-push, sem rebase, sem amend, sem reescrita de histórico.
- `REPORT_FORMAT_VERSION 1.3.3` **preservada**; `MONTHLY_REPORT_FORMAT_VERSION 1.3.5`.
- **RT-16:** `score` é **anulável**. Todo `Number(score)` sem checar `null` reintroduz o
  defeito que a 1.3.5 existe para eliminar.

---

## Variante curta

```
Continue a AAPEx 1.3.5. As FASES 12 e 12-B estao CONCLUIDAS: a 1.3.5 esta
PUBLICADA e OPERACIONALMENTE ATIVADA desde 02/08/2026. Leia
docs/architecture/AAPEX-135-FASE-12-PRODUCAO.md e
docs/architecture/AAPEX-135-FASE-12B-ATIVACAO.md antes de qualquer coisa.

Producao plnbgdabciwygsmnyddy em 0001-0051, Local = Remote 51/51. Deployment
Ready, smoke do proprietario aprovado. Dois backups em E:\AACE_Backups:
producao-pre-135-20260802-2013 (antes da publicacao) e
producao-pre-135-ativacao-20260802-2146 (antes do backfill, com espelho em C:).
PITR DESABILITADO — esses exports sao o unico recurso de recuperacao.

PROIBIDO tocar o staging congelado qcixfsdyfpankpatbays. A CLI ficou vinculada
a homologacao qjvpkaurihjvzktlinhp, sem nenhuma escrita.

O BACKFILL FOI EXECUTADO: tema GERAL + 13 configuracoes regionais publicadas na
regiao RPS, com metas/tolerancias/pesos IDENTICOS ao catalogo vigente (13/13,
zero divergentes) e idempotencia provada. A Gestao Assistida esta ATIVA.

Por DECISAO EXPRESSA do responsavel, seguem NAO ativadas: A-02 (cutover segue
JSON null), A-03 (os 4 rascunhos seguem em draft) e A-04 (ponderacao segue
vazia). Nao sao esquecimento; reabri-las e decisao nova. A-01 esta INERTE (zero
target_band). O que bloqueia a Auditoria Mensal e a ausencia de CRITERIOS
mensais, que nao existem em producao.

RESSALVA: o gate 17 Etapa B (leitor de tela) NAO foi exercitado; dispensado
pelo responsavel. Nao declarar "25/25 sem ressalvas".

Migrations aditivas apenas, proximo numero livre 0052. Autoria exclusiva do
proprietario e sem mencao a IA. A Fase 13 NAO foi iniciada.
```
