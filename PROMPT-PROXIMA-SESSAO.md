# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5 PUBLICADA EM PRODUÇÃO

> **Antes de colar:** conferir que a árvore está limpa e que `main` local e
> `origin/main` apontam para o **mesmo** commit.

> ## ✅ A FASE 12 ESTÁ CONCLUÍDA — **AAPEx 1.3.5 em produção**
>
> Publicada em **02/08/2026**. Migrations `0036–0051` aplicadas em
> `plnbgdabciwygsmnyddy`, merge `--no-ff` em `main`, deployment **Ready** e smoke do
> proprietário confirmado (**`SMOKE PRODUÇÃO APROVADO`**).
>
> Relatório completo em `docs/architecture/AAPEX-135-FASE-12-PRODUCAO.md`.
>
> **A Fase 13 NÃO foi iniciada.**

---

## Estado a confirmar

```
main       ba6b7bf  (= origin/main)     merge --no-ff da branch da 1.3.5
branch     aapex-1.3.5-assisted-management-monthly-audit  = origin, ponta 11a10c7
árvore     limpa
versão     1.3.5 · build 9              PUBLICADA
migrations 0001-0051 · próximo livre 0052
testes     2305 verdes em 136 arquivos
REPORT_FORMAT_VERSION          1.3.3   (PRESERVAR)
MONTHLY_REPORT_FORMAT_VERSION  1.3.5

producao      plnbgdabciwygsmnyddy   0001-0051, Local = Remote 51/51
homologacao   qjvpkaurihjvzktlinhp   51 migrations, fixture sintetica — CLI vinculada a ela
staging       qcixfsdyfpankpatbays   CONGELADO e INTOCADO
```

**Diante de divergência não compreendida: PARE.**

## O que a Fase 12 provou (não repetir)

| Prova | Resultado |
|---|---|
| Backup de produção | 52 arquivos, 192 linhas, verificado relendo do disco |
| **PITR** | **DESABILITADO** e sem backup físico — o export lógico é o único recurso |
| Migrations em produção | `0036–0051`, `migration list` **51/51 sem divergência** |
| Esquema × homologado | **idêntico em 10 categorias**, com `c=38 f=116 p=45 u=27` |
| Dado histórico | **inalterado** — 4 avaliações, 48 respostas, 0 snapshots, 1 plano, 0 trilha |
| Bundle servido | **1 único JWT** (`ref` de produção, `role: anon`), zero refs proibidos |
| Página em produção | `VERSÃO 1.3.5` · `Autenticação corporativa (Supabase)` · sem erro |
| Sondas negativas | 16 recusas; anon lê `[]` via REST em tabelas com 17/4/14/1 linhas |
| Signup público | **desligado** (`signup_disabled`) |

## Pendências abertas — todas são DECISÃO EMPRESARIAL

| # | Pendência | Estado em produção |
|---|---|---|
| **BACKFILL** 🔴 | configuração regional do catálogo legado | 13 indicadores globais, **0 configurações**. **Bloqueia o cutover** |
| **A-02** | data de cutover | `weekly_audit_cutover_date` = **JSON null** |
| **A-03** | decisão nominal dos 4 drafts | 4 avaliações em `draft`, **intactas** |
| **A-04** | pesos empresariais reais | `region_weightings` **vazia** |
| **A-01** | regra de status para `target_band` | aberta, com falha explícita |
| **A-07** | autoridade regional | sem mudança |
| **Gate 17 · Etapa B** | **leitor de tela não exercitado** | dívida conhecida da 1.3.5 |
| **40 códigos** | remedição | exigiria o staging congelado |

> **Nada disso pode ser arbitrado.** Tema, meta, tolerância, peso, ordem, flags de módulo
> e critérios são decisão de cada região. Um backfill inventado produziria uma operação
> que ninguém aprovou, com aparência de configurada.

## Ordem obrigatória, se a próxima sessão for ativar a 1.3.5

```
1. BACKFILL (mapeamento nominal, região a região, publicado)
2. A-04  (pesos reais)      -> sem ele nao ha indice ponderado
3. A-02  (data de cutover)  -> so DEPOIS do backfill
4. A-03  (os quatro drafts, um a um)
```

Desligar a Auditoria Semanal antes do backfill deixaria as regiões **sem indicador
operável nenhum**.

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
Continue a AAPEx 1.3.5. A FASE 12 esta CONCLUIDA: a 1.3.5 esta PUBLICADA EM
PRODUCAO desde 02/08/2026. Leia
docs/architecture/AAPEX-135-FASE-12-PRODUCAO.md antes de qualquer coisa.

main = origin/main = ba6b7bf. Producao plnbgdabciwygsmnyddy em 0001-0051,
Local = Remote 51/51. Deployment Ready, smoke do proprietario aprovado.
Backup em E:\AACE_Backups\producao-pre-135-20260802-2013 (PITR DESABILITADO —
esse export e o unico recurso de recuperacao).

PROIBIDO tocar o staging congelado qcixfsdyfpankpatbays. A CLI ficou vinculada
a homologacao qjvpkaurihjvzktlinhp, sem nenhuma escrita.

CONTINUAM ABERTAS, e sao DECISAO EMPRESARIAL, nao divida tecnica: o BACKFILL do
catalogo legado (13 indicadores globais, 0 configuracoes regionais), A-02
(cutover segue JSON null), A-03 (4 drafts intactos), A-04 (ponderacao vazia),
A-01 e A-07. A ordem obrigatoria e BACKFILL -> A-04 -> A-02 -> A-03.

RESSALVA: o gate 17 Etapa B (leitor de tela) NAO foi exercitado; dispensado
pelo responsavel. Nao declarar "25/25 sem ressalvas".

Migrations aditivas apenas, proximo numero livre 0052. Autoria exclusiva do
proprietario e sem mencao a IA. A Fase 13 NAO foi iniciada.
```
