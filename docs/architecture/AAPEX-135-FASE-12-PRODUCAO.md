# AAPEx 1.3.5 — Fase 12: publicação controlada em produção

> # FASE 12 CONCLUÍDA · AAPEx 1.3.5 PUBLICADA EM PRODUÇÃO
>
> As dezesseis migrations pendentes foram aplicadas em `plnbgdabciwygsmnyddy` em
> 02/08/2026, depois de backup lógico integral verificado. O esquema resultante é
> **idêntico ao homologado** em dez categorias de catálogo. Nenhuma linha histórica
> foi alterada. O merge `--no-ff` entrou em `main` (`ba6b7bf`), o deployment de produção
> está **Ready** e o proprietário confirmou o smoke: **`SMOKE PRODUÇÃO APROVADO`**.
>
> **Exceção formal registrada:** `EXCEÇÃO DE ACESSIBILIDADE ACEITA PELO RESPONSÁVEL ·
> LEITOR DE TELA NÃO EXECUTADO` — ver §9.

Data: 02/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit` → `main`

---

## 1. Autoridade e escopo

Esta fase foi executada sob autorização expressa do proprietário sobre a release
candidate congelada na Fase 11 (`docs/architecture/AAPEX-135-FASE-11-HOMOLOGACAO.md`).

**Destino único de escrita:** `plnbgdabciwygsmnyddy` (produção).
**Proibidos e comprovadamente intocados:** `qjvpkaurihjvzktlinhp` (homologação) e
`qcixfsdyfpankpatbays` (staging congelado).

### A guarda executável

Nenhum comando mutável correu sem passar por `scratchpad/fase12/guarda.mjs`, que aborta
com código **90** quando o ref vinculado não é o de produção, quando um ref proibido
aparece no comando ou em variável de ambiente, quando o vínculo está ausente ou ambíguo,
ou quando a SQL de `db query` contém operação destrutiva.

Ela foi testada **antes** da primeira escrita e **contra si mesma**:

| Caso | Resultado |
|---|---|
| `--project-ref qcixfsdyfpankpatbays` | ABORTADO 90 |
| `--project-ref qjvpkaurihjvzktlinhp` | ABORTADO 90 |
| vínculo corrente ≠ produção | ABORTADO 90 |
| `truncate table public.audit_logs` | ABORTADO 90 |
| `link --project-ref qcixfsdyfpankpatbays` | ABORTADO 90 |
| ref proibido em variável de ambiente | ABORTADO 90 |

**6/6 abortados.** Depois de vincular a produção, o mesmo autoteste devolveu **5/6** — e a
única inversão foi o caso "vínculo corrente", que passou porque o vínculo corrente passou
a ser, de fato, produção. Os cinco caminhos proibidos continuaram fechados.

---

## 2. Estado de produção antes de qualquer escrita

| | |
|---|---|
| PostgreSQL | 17.6 |
| Migrations | **0001–0035** (35 linhas), zero remotas desconhecidas |
| Tabelas · views · enums | 32 · 9 · 12 |
| Índices · funções · policies | 77 · 92 · 58 |
| Constraints | 129 |
| RLS | **32/32 habilitada e forçada** |
| Gatilhos desabilitados | **0** |
| Storage | bucket `evidencias` (privado), **0 objetos** |
| `grant usage on schema app` | somente `authenticated` (+ `postgres`) |
| Tabelas da 1.3.5 | **0** — nenhuma existia |

**Dados operacionais:** 1 organização · 1 região · 3 unidades · 3 coordenadorias ·
14 operações · 17 usuários · 19 escopos · 14 vínculos.
**Papéis:** 3 admin · 3 regional · 4 coordenador · 9 gerente de canal.

**Histórico:** 4 avaliações (**todas em rascunho**) · 48 respostas · **0** evidências ·
**0** snapshots oficiais · **0** validações · 1 plano de ação · **0** eventos de trilha.
**Catálogo:** 13 indicadores · 13 versões · 24 itens · 1 modelo · 1 medição · 1 resultado.

A expectativa dos artefatos era `0001–0035` com `0036–0051` pendentes. **Confirmada, não
presumida.**

---

## 3. Backup — materializado e verificado

`E:\AACE_Backups\producao-pre-135-20260802-2013\`

**Método:** export lógico JSON por tabela, o mesmo procedimento canônico de
`producao-pre-133-20260731-2152`. `supabase db dump` **não é utilizável nesta máquina** —
exige Docker, e falhou com `LegacyDockerRunError`. O arquivo vazio dessa tentativa foi
removido do pacote.

| | |
|---|---|
| Arquivos | **52** + `SHA256SUMS.txt` + `README_RESTORE.txt` |
| Tabelas exportadas | **32** (public + app), com as linhas completas |
| Linhas | **192**, conferidas por releitura do disco |
| Catálogo estrutural | colunas, constraints, índices, policies, RLS, gatilhos, funções (com `pg_get_functiondef`), views, enums, grants de tabela/rotina/schema, migrations, buckets, objetos, extensões |
| Auth | 17 contas e 15 identidades — **sem hash de senha** |

**Verificação independente, relendo do disco:** 52 arquivos com SHA-256 e tamanho
conferidos, JSON válido em todos, contagem declarada = contagem relida (192 = 192),
`README_RESTORE.txt` presente com 6.292 bytes. **Sem problemas.**

### O que não existe como rede de segurança

| | |
|---|---|
| PITR | **DESABILITADO** (`pitr_enabled: false`) |
| Backups físicos | `supabase backups list` devolve **lista vazia** |

Isto está registrado no `README_RESTORE.txt` e é a razão de o export lógico ter sido
tratado como artefato obrigatório, e não como formalidade: **ele é o único que existe.**

### Rollback disponível

`README_RESTORE.txt` traz o runbook executável em quatro caminhos, do mais barato ao mais
caro: **(A)** `vercel rollback` para o deployment 1.3.4 `dpl_FrGVVZUyp4RsW6HxZ5WPkXiv96AL`;
**(B)** `git revert -m 1` do merge, **nunca** reset + force-push; **(C)** reversão do
esquema migration a migration, na ordem inversa; **(D)** reinserção de dado por
`jsonb_populate_recordset`, na ordem de dependência declarada.

Como todas as migrations são aditivas, **(A) resolve sozinho o caso mais provável**: a
1.3.4 continua funcionando sobre o esquema 1.3.5.

---

## 4. Dry-run e auditoria das migrations

`db push --dry-run` devolveu **exatamente 16** migrations, `0036`–`0051`, em ordem, com
`seeds: []` e `roles: []` — o seed de demonstração **não** entra, como o procedimento
canônico exige.

**Varredura de operação destrutiva, com os corpos de função removidos do texto:**

| Achado | Veredito |
|---|---|
| `delete from` em 0037 e 0044 | **dentro de corpo de função** (RPCs de exclusão de indicador e de evidência), não DML de migration |
| `alter table public.action_plans drop constraint` (0043) | troca de CHECK: removida e **reescrita mais forte na mesma migration**, com as três origens |
| `drop not null` em 0042 (3×) e 0050 (2×) | documentado — alteração de **catálogo**, não reescreve linha; CHECK por modelo entra mais forte no lugar |
| DML de nível superior | **uma única**, em 0047: a semente de `weekly_audit_cutover_date`, com `on conflict do nothing` e valor **JSON null** |

**Pré-condições de dado conferidas antes de aplicar:** as 4 avaliações têm
`template_version_id` e `score` não nulos (satisfazem o CHECK do modelo legado); o único
plano tem `evaluation_id`, `item_id` nulos e `theme_code` preenchido (satisfaz a perna
`legacy` do CHECK novo); zero snapshots.

---

## 5. Aplicação e reconciliação

As 16 migrations foram aplicadas **individualmente e em ordem**, sem `--include-seed`.

```
migration list  →  51 locais, 51 remotas, 0 divergentes, 0 só-local, 0 só-remoto
```

### Esquema resultante × esquema homologado

| Categoria | Homologação (Fase 11) | Produção (agora) | |
|---|---:|---:|---|
| COLUMN | 572 | **572** | idêntico |
| ENUM | 19 | **19** | idêntico |
| INDEX | 120 | **120** | idêntico |
| POLICY (RLS) | 71 | **71** | idêntico |
| RLSENABLED | 45 | **45** | idêntico |
| TABLE | 45 | **45** | idêntico |
| TRIGGER | 71 | **71** | idêntico |
| VIEW (`ui_*`) | 9 | **9** | idêntico |
| FUNCTION | 195 | **195** | idêntico |
| CONSTRAINT | 226 | **226** | idêntico |

E o **detalhamento** de constraints bate um a um com o publicado na Fase 11 §2:
`c=38 · f=116 · p=45 · u=27`.

> **Uma categoria não é comparável, e o registro honesto importa.** A Fase 11 mediu
> `GRANT` com uma consulta própria (914 dos dois lados). A consulta usada aqui conta
> `information_schema.role_table_grants` inteiro e devolve **1.292**. Os números não
> se comparam porque as perguntas são diferentes. A comparação válida é
> produção-antes × produção-depois: **1.097 → 1.292**, `+195` para as 13 tabelas novas.

### Invariantes pós-migration

| Invariante | Resultado |
|---|---|
| `weekly_audit_cutover_date` | **JSON null** — cutover DESATIVADO |
| `region_weightings` | **0 linhas** — ponderação não configurada |
| `themes` · `audit_criteria` · `assisted_cycles` · `evaluation_criteria` | **0 · 0 · 0 · 0** |
| `indicator_regional_configs` | **0** — backfill **não** executado |
| 13 definições de indicador | **13 globais**, nenhuma vinculada a região |
| Avaliações | **4**, todas `draft`, todas `legacy_template`, score e template preservados |
| Planos | **1**, `source = legacy` |
| Respostas · snapshots · trilha | **48 · 0 · 0** — inalterados |
| Operações · usuários · indicadores | **14 · 17 · 13** — inalterados |
| RLS | **45/45** habilitada e forçada |
| Gatilhos | **71**, **0 desabilitados** |
| `grant usage on schema app` | segue só para `authenticated` |
| `anon` nas 11 tabelas novas | **0 grants** |
| `authenticated` nas 6 tabelas de catálogo | **exatamente `SELECT`** (O-17 preservado) |
| Wrappers `app.*_legacy` | **7**, como na homologação |
| `score` | **anulável** em `evaluations` e `official_snapshots` (RT-16) |
| `app.monthly_report_format_version()` | **1.3.5** |
| `app.process_score_rule()` | `conformidade-simples-processo/1.3.5` |
| `REPORT_FORMAT_VERSION` (código) | **1.3.3** — preservada |

**Nenhuma linha histórica foi alterada.** As contagens de `evaluations`,
`evaluation_answers`, `official_snapshots`, `action_plans`, `audit_logs`, `operations`,
`users` e `indicator_definitions` são idênticas antes e depois.

---

## 6. Edge Functions — nenhuma republicada, e o motivo

`git diff 8ffc49a..HEAD -- supabase/functions/` é **vazio**: a 1.3.5 não tocou em função
alguma. O contrato manda não republicar sem necessidade, e não houve.

Estado observado em produção, **preservado**:

| Função | Status | Versão | `verify_jwt` |
|---|---|---|---|
| `admin-invite-users` | ACTIVE | 2 | `true` |
| `admin-provision-users` | ACTIVE | 2 | `true` |
| `initial-password-change` | ACTIVE | 1 | `true` |

> **Diferença de ambiente registrada, não corrigida.** Na homologação as duas funções do
> caminho do app rodam com `verify_jwt = false`; em produção rodam com `true` desde
> 28/07/2026, e é essa a configuração canônica **de produção**. A 1.3.5 não altera esse
> comportamento em relação à 1.3.4, que está publicada e operando com `true`. Mexer nisso
> seria alterar configuração de segurança fora do escopo desta fase.

**Nenhum secret foi criado, lido ou alterado.**

---

## 7. Gate técnico pré-publicação

| | |
|---|---|
| Suíte completa | ✅ **2.305 testes verdes em 136 arquivos** — sem regressão |
| `tsc --noEmit` | ✅ |
| `npm run build:web` | ✅ `dist/` exportado, preflight de ambiente aprovado |
| `.env` versionado | ✅ **não** — só `.env.example` |
| JWT em arquivo versionado | ✅ **nenhum** |
| Atribuição de `service_role` / secret key | ✅ **nenhuma** |

**Sobre os project refs no repositório:** os três aparecem, e é correto que apareçam —
em documentação, em `scripts/check-build-env.mjs` e em testes. Project ref é
identificador público, não segredo.

**O preflight de build é uma garantia de verdade, não uma promessa:**
`scripts/check-build-env.mjs` **interrompe o build** quando `VERCEL_ENV === 'production'`
e o ref configurado não é `plnbgdabciwygsmnyddy`. Um deployment de produção apontando
para homologação ou staging **não compila**.

---

## 8. O que NÃO foi feito, e por quê

Estas pendências são **decisão empresarial**, e nenhuma delas tem dado definitivo em
artefato canônico. Executá-las por conta própria produziria, nas palavras do próprio
Plano de Implementação §7, *"uma operação que ninguém aprovou, com aparência de
configurada"*.

| Pendência | Estado em produção | Por que não foi executada |
|---|---|---|
| **BACKFILL** do catálogo legado | 13 indicadores globais, **0 configurações regionais** | Tema, meta, tolerância, peso, ordem e flags são decisão de cada região. Não há mapeamento nominal aprovado |
| **A-02** — data de cutover | `weekly_audit_cutover_date` = **JSON null** | A data não existe. E o cutover **não pode** ser ativado antes do backfill: desligar a auditoria semanal sem configuração regional deixaria as regiões sem indicador operável |
| **A-03** — os 4 drafts de produção | 4 avaliações em `draft`, **intactas** | A decisão é nominal, uma a uma (concluir como legado · cancelar formalmente · arquivar). Não há decisão registrada |
| **A-04** — pesos empresariais reais | `region_weightings` **vazia** | Não há peso aprovado. Sem ponderação publicada o servidor devolve `weightedIndex = null` e **não inventa** índice |
| **A-01** — `target_band` | falha explícita, confirmada em runtime | Continua aberta, por decisão |
| **A-07** — autoridade regional | sem mudança | Continua aberta |
| **Os 40 códigos** | não remedidos | Exigiriam o staging congelado, que esta fase está **proibida** de tocar |
| **Carga de dados reais** | não executada | Nenhum arquivo definitivo é identificado por artefato canônico. Planilha provisória e fixture de homologação são expressamente proibidas |

**O comportamento conservador é o desenhado**, não uma degradação: com cutover nulo a
Auditoria Semanal continua operando exatamente como na 1.3.4, e os módulos novos ficam
disponíveis mas sem adoção — que é o ato explícito e publicado que o ADR-135-001 exige.

---

## 9. Exceção formal de acessibilidade

```
EXCEÇÃO DE ACESSIBILIDADE ACEITA PELO RESPONSÁVEL · LEITOR DE TELA NÃO EXECUTADO
```

A Etapa B do gate 17 da Fase 11 — leitor de tela — **foi dispensada conscientemente pelo
responsável pelo produto**. O NVDA não está instalado nesta máquina e o Narrador do
Windows não foi executado. Em particular, **não foi verificado** se os status
*conforme · atenção · não conforme · sem dado* são compreensíveis sem depender da cor.

A Fase 11 fica **administrativamente encerrada** e a release candidate **1.3.5 · build 9**
permanece congelada **com essa exceção formal**. Não se afirma "25/25 sem ressalvas": são
25 gates fechados, **um deles com escopo reduzido a teclado**.

A dívida continua conhecida, registrada e aberta na 1.3.5.

---

## 10. Git, merge e publicação

| | |
|---|---|
| Branch | `aapex-1.3.5-assisted-management-monthly-audit`, pushada em `11a10c7` |
| Método | `git merge --no-ff`, o padrão do projeto (o mesmo da 1.3.3 em `b35600c`) |
| Conflitos | **nenhum** |
| Merge | `ba6b7bf` |
| `main` | `8ffc49a` → **`ba6b7bf`** = `origin/main` |
| Diff do merge | 113 arquivos, +35.384 / −79 |
| Autoria | **61 commits**, autor e committer exclusivamente `djrodrigocpu-debug <djrodrigocpu@gmail.com>` |
| `Co-authored-by` / menção a IA | **zero ocorrências** em todo o intervalo `8ffc49a..HEAD` |
| Tag / GitHub Release | **não criadas** — o projeto nunca usou tags (`git tag -l` vazio), logo o contrato não as exige |

### Deployment

| | |
|---|---|
| Anterior (1.3.4) | `dpl_FrGVVZUyp4RsW6HxZ5WPkXiv96AL` — preservado como alvo de rollback |
| Novo | **`dpl_J1WfoeQBFtc6UrBooaEwJxskX1Nh`** · target `production` · **● Ready** |
| Aliases | `daniapp-gamma.vercel.app` · `daniapp-rodrigocpu-debug.vercel.app` · `daniapp-git-main-rodrigocpu-debug.vercel.app` |

> **O deployment de Preview falhou, e isso é o preflight funcionando.** O ambiente
> Preview não tem as variáveis `EXPO_PUBLIC_SUPABASE_*` (elas existem só em Production),
> então `check-build-env.mjs` **interrompe o build**. É o comportamento desenhado, e é
> anterior a esta fase: os quatro Previews anteriores falharam igual.

---

## 11. Validação automatizada em produção

### O bundle realmente servido

Baixado de `https://daniapp-gamma.vercel.app` — não do `dist/` local.

| Verificação | Resultado |
|---|---|
| HTTP | **200** no index e no bundle (2.127.942 bytes) |
| `plnbgdabciwygsmnyddy` | **1** ocorrência |
| `qcixfsdyfpankpatbays` · `qjvpkaurihjvzktlinhp` | **0 · 0** |
| JWTs no bundle inteiro | **exatamente 1** — `{iss: supabase, ref: plnbgdabciwygsmnyddy, role: anon}` |
| `service_role` como valor | **0** |
| `version` / `release` | **1.3.5** · `releaseName` "Gestão Assistida e Auditoria Mensal" |
| `1.3.4` | **ausente** |
| `MONTHLY_REPORT_FORMAT_VERSION` | `1.3.5` (`linha-por-fato/1.3.5`) |
| `REPORT_FORMAT_VERSION` | **1.3.3** — preservada no bundle publicado |
| Superfície 1.3.5 | `open_assisted_cycle`, `start_monthly_audit`, `get_monthly_audit_report_data`, `export_dataset`, `get_dashboard_aggregates`, `get_matrix_dataset`, `sem_dado` — todas presentes |

> **`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` e `sb_secret_` aparecem uma vez
> cada, e nenhum é valor.** Os dois primeiros são a **lista de chaves proibidas** de
> `assertNoPrivilegedSecrets` (`src/config/env.ts`); o terceiro é o detector de formato
> de chave do próprio SDK do Supabase. O contexto de cada um foi lido e conferido.

### A página, em execução

| | |
|---|---|
| Título e rótulo | `AAPEx` · **`APP MOBILE + WEB · VERSÃO 1.3.5`** |
| Modo | **`Autenticação corporativa (Supabase)`** — não é demonstração |
| Console | **nenhum erro** |
| Rede | 200 em index, bundle, fonte e logo; nenhuma requisição falha |

### Sondas negativas — 16 recusas, e duas declaradas não exercitadas

Por impersonação de papel no banco **e** pela superfície HTTP pública real:

| Sonda | Resultado |
|---|---|
| `anon` lê `users` · `evaluations` | **0 de 17** e **0 de 4** linhas reais — RLS provada |
| `anon` lê `assisted_cycles`, `evaluation_criterion_answers`, `region_weightings` | `42501 permission denied` |
| `anon` executa `get_dashboard_aggregates`, `get_matrix_dataset`, `export_dataset`, `open_assisted_cycle`, `start_monthly_audit`, `get_monthly_audit_report_data` | `42501 permission denied` nas seis |
| `authenticated` sem claims em `get_dashboard_aggregates` | `autenticacao obrigatoria` |
| `authenticated` escreve em `audit_logs`, `official_snapshots`, `system_settings`, `region_weightings` | `42501 permission denied` nas quatro |
| REST público: `users`, `evaluations`, `operations`, `action_plans` como anon | **`[]` nas quatro**, sobre tabelas com 17, 4, 14 e 1 linhas |
| Auth com credencial inexistente (`.example`) | **400 `invalid_credentials`** |
| Signup público | **422 `signup_disabled`** — continua desligado |

> **Duas sondas foram corrigidas por passarem pelo motivo errado, e o registro fica.**
> A primeira versão do roteiro tratava "anon lê 0 linhas" como defeito; é **recusa
> legítima por RLS**, e é assim que a Fase 11 §6 já a documentava. A segunda tentava
> escrever em `audit_logs` informando só `id` e recebia `42804: column` — erro de
> **tipo**, não de privilégio. Trocada por `insert ... default values`, passou a receber
> o `42501 permission denied for table audit_logs` que se queria provar.

> **Declarado NÃO EXERCITADO, em vez de verde:** `anon` lendo `audit_logs` e
> `storage.objects` devolve zero — mas **as duas estão vazias em produção**, então o
> zero não prova isolamento nenhum. Fica registrado como não exercitado.

> **`buildNumber 9` e `versionCode 9` não são observáveis no bundle web**, porque são
> campos **nativos** do `app.json` e o export web não os embute. Estão declarados no
> repositório e valem para a build nativa; afirmar que foram "confirmados em produção
> pelo navegador" seria falso.

---

## 12. Smoke humano

Único gate humano da fase, com cinco pontos:

1. abrir o aplicativo · 2. fazer login · 3. confirmar **VERSÃO 1.3.5** ·
4. confirmar que o dashboard carrega · 5. abrir um parceiro e confirmar os dados.

**Confirmação do proprietário: `SMOKE PRODUÇÃO APROVADO`** (02/08/2026).

Excel, PDF, CSV, A-10/A-11 manuais, múltiplos breakpoints, percurso por teclado e leitor
de tela **não foram repetidos**, por decisão do responsável: já foram exercitados na
homologação da Fase 11.

---

## 13. Estado final dos três ambientes

| Ambiente | Ref | Estado |
|---|---|---|
| **Produção** | `plnbgdabciwygsmnyddy` | **0001–0051**, `migration list` 51/51 sem divergência. **AAPEx 1.3.5 publicada** |
| Homologação | `qjvpkaurihjvzktlinhp` | **51 migrations, fixture sintética — NENHUMA ESCRITA nesta fase.** A CLI foi religada a ela ao final, apenas como vínculo local |
| Staging congelado | `qcixfsdyfpankpatbays` | **INTOCADO.** Nunca vinculado, nunca consultado, nunca escrito. A guarda abortou toda tentativa de citá-lo |

| | |
|---|---|
| `main` = `origin/main` | **`ba6b7bf`** |
| branch = `origin/branch` | **`11a10c7`** |
| Árvore | **limpa** |
| Versão · build | **1.3.5 · 9** |
| Backup | `E:\AACE_Backups\producao-pre-135-20260802-2013\` — preservado |
| Credenciais | **nenhuma criada, lida ou transmitida nesta fase.** Nenhum arquivo novo de credencial foi produzido; `AAPEx-homologacao-acesso.txt` **não** foi usado como fonte para produção |
| Fase 13 | **não iniciada** |

## 14. O que a próxima sessão precisa decidir

Nada disto é dívida técnica — é **decisão empresarial**, e continua aberta por não haver
dado aprovado:

1. **BACKFILL** — mapear e publicar, região a região, a configuração operacional dos 13
   indicadores legados. **Bloqueia o cutover.**
2. **A-02** — a data de cutover. Só depois do backfill.
3. **A-03** — decisão nominal de cada um dos 4 drafts.
4. **A-04** — os pesos empresariais reais por região.
5. **A-01** e **A-07** — sem mudança.
6. **Gate 17 · Etapa B** — o leitor de tela continua devido.
7. **Os 40 códigos** — exigem o staging congelado.
