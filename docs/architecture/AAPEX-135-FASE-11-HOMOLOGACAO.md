# AAPEx 1.3.5 — Fase 11: homologação controlada em ambiente remoto separado

> **Status: HOMOLOGAÇÃO CONCLUÍDA · RELEASE CANDIDATE NÃO CONGELADO.**
> Os gates automatizáveis (1–13, 16, 19–24) foram cumpridos e estão comprovados abaixo.
> Os gates **14, 15 e 17** dependem de aplicativo de mesa real (Excel, leitor de PDF,
> leitor de tela) e **não foram executados** — portanto o **bump para 1.3.5 (gate 25)
> continua bloqueado** e o aplicativo permanece **1.3.4 · build 8**.

Data: 02/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit`

---

## 1. O bloqueio de entrada caiu

A Fase 11 recebeu NO-GO em 02/08/2026 por não existir ambiente remoto separado. O
proprietário provisionou o projeto e autorizou expressamente esta execução:

| | |
|---|---|
| Projeto | **AAPEx 1.3.5 Homologacao** |
| Project Ref | `qjvpkaurihjvzktlinhp` |
| Região | Canada Central (`ca-central-1`) |
| Estado inicial | novo e **vazio** (0 migrations aplicadas) |

**Projetos proibidos, e ambos permaneceram intocados:** `qcixfsdyfpankpatbays`
(staging congelado) e `plnbgdabciwygsmnyddy` (produção).

O isolamento não ficou por conta da disciplina: uma **guarda executável** interceptou
toda invocação da CLI e abortou qualquer comando que citasse um dos dois refs, que
rodasse com outro projeto vinculado, ou que trouxesse um ref proibido em variável de
ambiente. A guarda foi testada contra si mesma (`db push --dry-run --project-ref
qcixfsdyfpankpatbays` → abortado com código 90) antes de qualquer mutação.

---

## 2. Banco provisionado do zero

`migration list` no projeto vazio: **51 locais, 0 remotas**. `db push --dry-run`
devolveu exatamente as 51, em ordem, sem seeds e sem roles. O push real aplicou
`0001`–`0051` e o `migration list` seguinte mostrou **Local = Remote em todas**.

### Local × Homologação — paridade de catálogo

Mesma consulta de catálogo executada nos dois lados (PGlite 18.3 com as migrations
locais × PostgreSQL 17.6 da homologação), comparada por hash:

| Categoria | Local | Homologação | Hash |
|---|---:|---:|---|
| COLUMN | 572 | 572 | **idêntico** |
| ENUM | 19 | 19 | **idêntico** |
| GRANT | 914 | 914 | **idêntico** |
| INDEX | 120 | 120 | **idêntico** |
| **POLICY (RLS)** | 71 | 71 | **idêntico** |
| RLSENABLED | 45 | 45 | **idêntico** |
| TABLE | 45 | 45 | **idêntico** |
| TRIGGER | 71 | 71 | **idêntico** |
| VIEW (9 × `ui_*`) | 9 | 9 | **idêntico** |
| CONSTRAINT | 587 | 226 | difere — **explicado** |
| FUNCTION | 232 | 195 | difere — **explicado** |
| FUNCGRANT | 464 | 390 | difere — **explicado** |
| SCHEMAGRANT | 6 | 6 | difere — **explicado** |

**As quatro divergências são de ambiente, não de domínio:**

1. **CONSTRAINT.** PostgreSQL 18 materializa `NOT NULL` em `pg_constraint` (`contype
   = 'n'`); o 17 não. Fora esse tipo, os dois lados têm **exatamente** `c=38, f=116,
   p=45, u=27` — 226 = 226.
2. **FUNCTION.** As 37 funções a mais no local são o **pgcrypto** que o PGlite instala
   em `public`; no Supabase a extensão vive em `extensions`. **Zero** funções existem
   só no remoto: as 195 do domínio conferem uma a uma.
3. **FUNCGRANT.** 74 = 2 papéis × as mesmas 37 funções do item anterior.
4. **SCHEMAGRANT.** O harness concede `usage on schema app` a `anon` e `service_role`
   por conveniência de teste; a homologação concede **só a `authenticated`**, que é o
   que a 0008 manda. O remoto é **mais restrito** que o local, e está certo.

### Tipos gerados — divergência real encontrada e corrigida

`src/services/supabase/database.types.ts` estava **desatualizado**: gerado antes das
migrations `0036`–`0051`, não continha nenhuma tabela nem RPC da 1.3.5
(`assisted_cycles`, `themes`, `audit_criteria`, `region_weightings`,
`system_settings`, `open_assisted_cycle`, `start_monthly_audit`,
`get_monthly_audit_report_data`, `export_dataset`…).

Nunca quebrou o build porque os repositórios recebem `SupabaseClient` **sem o
genérico** `<Database>` — então `rpc()` aceita qualquer string. Era dívida silenciosa,
não defeito ativo. O arquivo foi **regenerado** contra a homologação
(2.405 → 4.319 linhas) e `tsc --noEmit` continua verde.

---

## 3. Edge Functions publicadas

| Função | Publicada | `verify_jwt` | Por quê |
|---|---|---|---|
| `admin-provision-users` | ✅ ACTIVE v1 | `false` | único caminho de provisionamento do app (`AdminRepository.commitProvisioning`) |
| `initial-password-change` | ✅ ACTIVE v1 | `false` | gate de primeiro acesso (`SupabaseAuthRepository`) |
| `admin-invite-users` | ❌ **não publicada** | — | fora do caminho da Fase 11; exige SMTP e `INVITE_REDIRECT_URL`, que não existem aqui |

`verify_jwt = false` **não afrouxa nada**: as duas funções respondem o preflight CORS
antes de qualquer validação (é a razão de existir de `_shared/cors.ts`) e fazem a
própria autorização — 401 sem token, 403 para quem não é Administrador. Com o gate
ligado o `OPTIONS`, que não carrega `Authorization`, morreria antes de chegar à função.

Nenhum secret precisou ser criado: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma.

---

## 4. Ambiente e segredos

`.env` local aponta para a homologação (`EXPO_PUBLIC_APP_ENV=homologation`), continua
ignorado pelo Git e **não** contém `service_role` nem secret key.

O bundle web foi auditado depois do build:

- `qjvpkaurihjvzktlinhp` → presente; `qcixfsdyfpankpatbays` e `plnbgdabciwygsmnyddy` → **ausentes**;
- **exatamente 1 JWT** no bundle inteiro, e o payload é `{"iss":"supabase","ref":"qjvpkaurihjvzktlinhp","role":"anon"}`;
- as ocorrências de `SERVICE_ROLE` / `SUPABASE_JWT_SECRET` são a **lista de chaves proibidas**
  do próprio `assertNoPrivilegedSecrets` (`src/config/env.ts`), não valores.

---

## 5. Fixture sintética

Dados inequivocamente fictícios. Domínio `.example` é reservado (RFC 2606) e não
resolve na internet. Nenhum nome, e-mail, documento ou planilha real.

| | |
|---|---|
| Organização | 1 |
| Regiões | 2 (`REGIAO NORTE FIXTURE`, `REGIAO SUL FIXTURE`) |
| Unidades · Coordenadorias | 2 · 2 |
| Usuários | 9 — 1 admin, 2 regionais, 2 coordenadores, 4 GCs |
| Operações/parceiros | 4, distribuídos entre as duas coordenadorias |
| Temas globais publicados | 3 |
| Indicadores | 3 globais + **1 regional** (só no Norte) |
| Configurações regionais vigentes | 6 |
| Critérios mensais publicados | 6 |
| Ponderação | Norte **60/40 sintética**; Sul **sem nenhuma** |

**Pesos deliberadamente desiguais (5/3/2/1 no Norte).** Com pesos iguais a média
ponderada e a aritmética coincidem, e o cenário passaria sem provar a A-11 (lição
L-07).

**Gênese do primeiro Administrador** pelo procedimento canônico de
`docs/OPERACAO_E_DEPLOY_AAPEX_V2.md` §5. A `service_role` **não consegue** escrever em
`public.users` — não tem `usage` em `app` e esbarra nos gatilhos de integridade. Isso é
o desenho correto, não um obstáculo: a gênese é operação administrativa por SQL, e todo
o resto da fixture passou pelo caminho real do app (Edge Function e RPCs sob RLS).

---

## 6. Os quatro papéis e o isolamento

| Prova | Resultado |
|---|---|
| Login válido / inválido | ✅ / ✅ recusado |
| Anônimo lê `ui_operations`, `users`, `evaluations`, `audit_logs` | ✅ **nada** (42501 ou 0 linhas) |
| Anônimo executa `get_dashboard_aggregates` | ✅ `permission denied` |
| Gate de primeiro acesso nas 8 contas | ✅ `required:true` → troca pela Edge Function → `required:false` |
| Admin vê 4 operações | ✅ |
| Regional Norte / Sul | ✅ 2 e 2, sem cruzamento |
| Coordenador Norte / Sul | ✅ 2 e 2, sem cruzamento |
| Cada GC vê **só** a sua operação | ✅ 1 cada |
| GC do Sul abre/lê ciclo e auditoria do Norte | ✅ recusado (`operacao fora do escopo`) |
| GC do Sul baixa evidência do Norte | ✅ recusado |
| Anônimo baixa evidência | ✅ recusado |
| GC insere/altera/apaga `audit_logs` | ✅ **`permission denied for table`** (privilégio, não erro de coluna) |
| GC insere em `official_snapshots` | ✅ `permission denied` |
| GC executa `admin_set_user_role` | ✅ `apenas administrador` |

### As duas views SECURITY DEFINER da 0026

`db advisors` sinaliza `ui_operation_people` e `ui_evaluation_people` como ERROR. É
**decisão documentada**, não descuido: elas precisam ler `display_name` de outro
usuário, o que a RLS de `public.users` (`users_self_read`) impede. A compensação é
`app.has_operation_access(...)` no `WHERE` de cada view, projeção **só** de
`display_name` e `revoke all from public, anon`.

Provado em runtime: o GC Norte 1 vê **1 linha** em `ui_operation_people` (a própria
operação) e **1 linha** em `public.users` (ele mesmo).

---

## 7. Gestão Assistida semanal

| Prova | Resultado |
|---|---|
| Abertura do ciclo da semana de referência | ✅ `2026-07-27..2026-08-02`, 3 indicadores |
| Reabrir devolve o mesmo ciclo | ✅ mesmo `id` |
| **Seis aberturas concorrentes** | ✅ **um único ciclo** |
| Um ciclo por parceiro por semana (no banco) | ✅ 1 linha |
| Meta vem de `indicator_regional_config_versions` | ✅ 80 (a do Norte), nunca de `indicator_versions` |
| Indicador **regional** presente só no Norte | ✅ |
| `target_band` **fora** da Assistida | ✅ ausente — **A-01 confirmada em runtime** |
| conforme / atenção / não conforme | ✅ 85→conforme · 3,5→atenção · 5→não conforme |
| **SEM DADO nunca é zero** | ✅ ciclo vazio: `sem_dado` com `actual` **NULO** |
| Plano pelo motor único `save_action_plan` | ✅ `source = assisted` |
| Desvio **amarelo** também exige plano | ✅ fechamento bloqueado sem ele |
| Transição para estado inexistente | ✅ recusada |
| GC autovalida o próprio plano | ✅ recusado |
| Coordenador valida plano concluído | ✅ `validated` |
| Fechamento | ✅ `closed` |
| Ciclo fechado aceita edição | ✅ recusado, valor preservado (85) |
| **Fechar duas vezes** | ✅ **não re-carimba** `closed_at` |
| Reabertura histórica | ✅ devolve o ciclo fechado |

---

## 8. Auditoria Mensal

| Prova | Resultado |
|---|---|
| Abertura da competência `2026-07` | ✅ 5 critérios materializados |
| Reabrir / **cinco aberturas concorrentes** | ✅ uma única auditoria |
| Modelo `monthly_criteria` | ✅ |
| conforme · não conforme · **N/A com justificativa** | ✅ |
| N/A em critério que não admite | ✅ recusado **pela regra** (`nao admite Nao aplicavel`) |
| Envio incompleto | ✅ barrado **pela regra** (`criterio obrigatorio sem avaliacao`) |
| Não conformidade **sem diagnóstico** | ✅ barrada |
| Não conformidade **sem plano** | ✅ barrada **pela regra do plano** |
| Evidência física: reserva → upload → confirmação | ✅ PNG real gravado no bucket `evidencias` |
| Formato não permitido (`.exe`) | ✅ `tipo de arquivo nao permitido` |
| Tamanho acima do limite | ✅ `ate 15 MB` |
| Envio e validação | ✅ `submitted` → `approved` |
| Autor valida a própria auditoria | ✅ recusado |
| Snapshot oficial do mês | ✅ exatamente 1, `score 66.67`, modelo mensal |
| Edição após aprovação | ✅ recusada |
| Reenvio / revalidação após aprovação | ✅ recusados |
| Snapshot continua único após as tentativas | ✅ |

> **As negativas foram aferidas contra uma auditoria de propósito mantida em
> rascunho.** Rodá-las contra a auditoria já aprovada faria todas passarem pela
> mensagem errada (“não está em rascunho”) — provariam a imutabilidade, não a regra.
> Duas asserções chegaram a passar assim e foram **refeitas**.

---

## 9. Cálculos congelados

### A-10 — pontuação de processo

`conformes ÷ (conformes + não conformes) × 100`, N/A **fora** do denominador.

- **PARCEIRA ALFA**: 2 conformes, 1 não conforme, 2 N/A → **66,67**. Confere com a
  fórmula aplicada à mão e com o `score` do snapshot.
- **PARCEIRA GAMA**, auditoria **inteiramente N/A** (denominador zero) → **score NULO**.
  É a borda que a 0050 corrigiu, e ela se comporta: **nunca zero**.

### A-11 — desempenho ponderado

`conforme = 100 · atenção = 50 · não conforme = 0`, ponderado pelo peso materializado.

- **ALFA**: `(5×100 + 3×50 + 1×0) ÷ 9 = 650/9 =` **72,22**.
  A média **aritmética** seria 50,00 — os dois **diferem**, então o peso está de fato
  sendo aplicado.
- **BETA**, três SEM DADO → **score NULO**, `sufficient:false`, motivos declarados
  `["incomplete_measurement","weight_sum_not_positive"]`.

### Ponderação regional

Norte (60/40 sintética): índice consolidado `= 72,22×0,60 + 66,67×0,40 =` **70,00**.
Sul, **sem ponderação publicada**: `weightedIndex = null` — o servidor **não inventa**
um índice.

### A-06 — Resumo sem ranking

Varredura de `ranking|rank|posicao|colocacao|melhores|piores|top` nas chaves do painel
e da matriz: **nenhuma ocorrência**. O Resumo declara a proveniência das regras e
registra `openDecisions: ["A-04"]` — a pendência continua visível, como deve.

---

## 10. Relatórios

| | |
|---|---|
| `REPORT_FORMAT_VERSION` | **1.3.3** — preservada |
| `MONTHLY_REPORT_FORMAT_VERSION` | **1.3.5** |
| `app.monthly_report_format_version()` | `1.3.5` |

**O relatório 1.3.3 recusa o modelo mensal**: `a Auditoria Mensal por criterios tem
formato proprio: use get_monthly_audit_report_data`. O contrato antigo não regrediu.

**Relatório mensal 1.3.5**, sobre a auditoria aprovada: vem do **snapshot** (não da
tabela viva), traz identidade (parceiro, competência `2026-07`, período, aprovador,
`snapshotId`), resumo, conteúdo com os planos e bloco de integridade
(`canonicalization: linha-por-fato/1.3.5`). Recusa auditoria não aprovada e respeita o
escopo do chamador.

**Exportação registrada na trilha**: o botão da interface real gerou
`evaluation.report_exported | success | 1.3.5` em `audit_logs`.

### `export_dataset`

Quatro módulos exercitados: `summary` (2 linhas), `assisted` (6), `monthly_audit` (10),
`plans` (1) — todos com colunas rotuladas.

---

## 11. Preview não produtivo

Bundle `dist/` servido em `127.0.0.1:4173`. Login real como Coordenador do Norte:

- cabeçalho **“Autenticação corporativa (Supabase)”** — não é modo demonstração;
- painel mostra **PARCEIRA ALFA FIXTURE · 66,67** e **BETA · Não avaliado** — os mesmos
  números do banco, portanto o dado veio da homologação;
- **só as duas operações do Norte** aparecem: o escopo vale também na interface;
- Ficha do Parceiro traz os **três blocos** (Gestão Assistida · Visita produtiva ·
  Auditoria Mensal) mais o Histórico legado, com os nomes funcionais vindos de
  `ui_operation_people`;
- tela da Auditoria Mensal: 2 Conforme / 1 Não conforme / 2 N/A / 0 Não avaliado,
  “Conformidade: 66.67%”, a evidência `evidencia-sintetica.png` anexada e o plano;
- botão **“Gerar Relatório Oficial da Auditoria Mensal”** presente só em Aprovada — o
  clique gravou o evento de exportação citado acima;
- **nenhum erro de console**;
- sem rolagem horizontal em **375 px, 768 px e 1366 px**.

---

## 12. Gate de qualidade

| | |
|---|---|
| Suíte | **2.305 testes verdes em 136 arquivos** — sem regressão |
| `tsc --noEmit` | ✅ verde, já com os tipos regenerados |
| `expo export --platform web` | ✅ `dist/` exportado |
| Preflight de build | ✅ |
| Varredura de segredos | ✅ nada versionado |

---

## 13. O que NÃO foi feito — e por quê

| Gate | Situação |
|---|---|
| **14 — XLSX no Excel real** | **PENDENTE.** Não há Excel dirigível nesta sessão. O contrato proíbe afirmar que abriu. |
| **15 — PDF em leitor real** | **PENDENTE.** Mesma razão. O PDF é gerado e tem teste de unidade, mas ninguém o abriu num leitor de verdade. |
| **17 — acessibilidade** | **PARCIAL.** `src/screens/accessibilityAudit.test.ts` roda; navegação por teclado e leitor de tela reais não foram exercitados (lição L-10: varredura estática não é prova de acessibilidade). |
| **25 — release candidate** | **BLOQUEADO** por 14, 15 e 17. **Sem bump: 1.3.4 · build 8.** |
| Backfill do catálogo legado | Não executado, conforme proibição ativa. |
| Cutover | `weekly_audit_cutover_date` continua **JSON null**. |
| Peso empresarial real (A-04) | Não semeado. A ponderação do Norte é **sintética e marcada como fixture**. |
| Os 40 códigos | Não consultados: exigiriam o staging congelado. Dívida mantida. |
| Quatro drafts de produção | Produção **não consultada**. |

## 14. Pendências que a homologação confirmou

- **A-01** continua aberta e agora tem prova de runtime: `target_band` é recusado na
  Gestão Assistida com a mensagem `direcao target_band sem regra de status definida
  (pendencia A-01)`.
- **A-04** continua aberta e aparece declarada em `ruleProvenance.openDecisions`.
- **A-02** (cutover) e **A-07** sem mudança.

---

## 15. Estado final

```
projeto de homologação   qjvpkaurihjvzktlinhp  (51 migrations, Local = Remote)
staging qcixfsdyfpankpatbays   INTOCADO
producao plnbgdabciwygsmnyddy  INTOCADA
versão                   1.3.4 · build 8   (sem bump)
REPORT_FORMAT_VERSION            1.3.3
MONTHLY_REPORT_FORMAT_VERSION    1.3.5
weekly_audit_cutover_date        JSON null
region_weightings                1 linha, SINTÉTICA (Norte)
migrations                       0001–0051 · próximo livre 0052
testes                           2305 verdes em 136 arquivos
```

Sem push. Sem merge. Sem deploy de produção.
