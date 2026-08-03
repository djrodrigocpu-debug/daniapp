# AAPEx 1.3.5 — Laboratório de Simulação Isolado

> **SIMULAÇÃO PRESERVADA PARA INSPEÇÃO · LIMPEZA NÃO AUTORIZADA**
>
> Todo o conteúdo deste ambiente é **fictício**. Nenhum nome, e-mail, documento,
> evidência ou credencial foi copiado de produção ou de qualquer pessoa real.

Data: 03/08/2026 · branch `aapex-1.3.5-simulation-lab` · RUN_ID `SIMLAB-135-20260803-1253`

---

## 1. Onde a simulação vive

| | |
|---|---|
| Projeto Supabase | **`qjvpkaurihjvzktlinhp`** (AAPEx 1.3.5 Homologação) |
| Produção `plnbgdabciwygsmnyddy` | **PROIBIDA** — nenhuma escrita, nenhuma migration, nenhuma consulta nominal |
| Staging `qcixfsdyfpankpatbays` | **PROIBIDO** — congelado, não vinculado |
| Migrations | `0001–0053`, idênticas à `main` |
| Baseline de código | `a79a4a0` (inclui a `0053`, tolerância percentual) |
| Regra de status vigente | `assisted-status/1.3.5-b` |

---

## 2. A guarda de ambiente tem TRÊS camadas, e a terceira é a que importa

### O achado que obrigou o redesenho

Durante o backup inicial, a CLI do Supabase **reescreveu sozinha** o arquivo
`supabase/.temp/project-ref`, apontando-o para **produção**, no meio de um lote.
Isso aconteceu **quatro vezes**. Numa delas, a consulta a `public.units` foi
autorizada pela guarda (o arquivo ainda dizia homologação), a CLI reapontou
enquanto o comando corria, e a consulta **voltou com as unidades reais de
produção**. Foi **leitura**, não escrita — produção não foi alterada —, mas o
arquivo de backup ficou contaminado com dado real e **foi destruído e refeito**.

A causa é estrutural: o vínculo é **estado mutável alheio**, sincronizado do
`linked: true` que a Management API mantém sobre a produção. E `supabase db
query` **não aceita `--project-ref`**: só `--linked`, `--local` ou `--db-url`.
Nomear o alvo no comando não é opção.

### As camadas

| # | Camada | O que faz | Fecha a corrida? |
|---|---|---|---|
| 1 | **Reparo** | antes de cada chamada, força o vínculo **para** a homologação — nunca para longe dela | não |
| 2 | **Guarda de arquivo** | `Assert-AlvoSimulacao` confere e **aborta** (código 90) | não |
| 3 | **Marcador no SQL** | toda consulta começa exigindo `system_settings.simulation_lab_run_id`, que **só existe no laboratório** | **sim** |

A camada 3 viaja **dentro do mesmo lote** enviado ao banco: quem responde
"sou o laboratório?" é o mesmo servidor que responderia à consulta. Se o lote
cair no banco errado, morre na própria transação e **nenhuma linha real volta**.

### Provas executadas

| Caso | Resultado |
|---|---|
| Ref explícito = produção | **abortado** |
| Ref explícito = staging | **abortado** |
| Ref explícito ausente | **abortado** |
| Ref desconhecido | **abortado** |
| Carga citando produção | **abortado** |
| Carga citando staging | **abortado** |
| Alvo correto | autorizado |
| **Marcador escondido + tentativa de escrita** | **o BANCO recusou**, sem resíduo |

---

## 3. Topologia sintética

```
ORGANIZACAO SIMULACAO AAPEX
└── RPS SIMULACAO  (1 região)
    ├── PR CAPITAL SIM      · COORD PR CAPITAL SIM      ·  4 parceiros
    ├── PR INTERIOR SIM     · COORD PR INTERIOR SIM     ·  6 parceiros
    └── SANTA CATARINA SIM  · COORD SANTA CATARINA SIM  ·  4 parceiros
                                                    total: 14 parceiros
```

**17 contas** — 1 Administrador · 1 Gerente Regional · 3 Coordenadores · 12
Gerentes de Canal. Domínio **`sim.example`** (RFC 2606/6761: reservado, não
resolve, nenhum e-mail pode chegar a uma pessoa real).

> **Por que `sim.example` e não `example.invalid`:** o validador de e-mail do
> GoTrue **recusa** `example.invalid` no cadastro. A Admin API (usada pela Edge
> Function de provisionamento) aceita `.example`, que foi o domínio já provado
> na Fase 11.

**Nenhum GC ficou ocioso:** 8 GCs atendem 1 parceiro, 2 atendem 2, e a
distribuição cobre os 14.

---

## 4. Os eventos NÃO são seed

O adendo é literal: *"não preencha tudo por service_role, SQL direto ou seed que
falsifique a autoria"*. Aqui:

- **cada conta autentica-se no GoTrue** e recebe o próprio JWT;
- as ações passam pelas **mesmas RPCs que a interface chama**
  (`open_assisted_cycle`, `save_assisted_entry`, `save_action_plan`,
  `close_assisted_cycle`, `start_monthly_audit`, `save_criterion_answer`,
  `reserve_evidence_upload`, `confirm_evidence_upload`, `submit_monthly_audit`,
  `validate_evaluation`);
- a autoria gravada em `audit_logs` é a de **quem assinou o token**;
- RLS, grants e guardas de papel valem exatamente como para uma pessoa usando o app.

**O que NÃO passou pelo app, e por quê:**

| Exceção | Por quê |
|---|---|
| Gênese do 1º Administrador (SQL) | procedimento canônico de `OPERACAO_E_DEPLOY_AAPEX_V2.md §5`. A `service_role` **não consegue** escrever em `public.users`. Dela em diante, nada mais é SQL |
| Reset do laboratório (SQL) | não é caminho de aplicativo e nunca será — ver §7 |
| Leitura de IDs para orquestrar | leitura, não escrita: não altera nem falsifica autoria |

---

## 5. Volume realizado

### Gestão Assistida — oito semanas

| | |
|---|---|
| Semanas | `2026-06-01` … `2026-07-20` (8 ISO consecutivas) |
| Ciclos | **112** (14 parceiros × 8 semanas) |
| Medições | **1.456** (13 indicadores por ciclo) |
| Planos de ação | 126 |
| Fechados | 108 |
| Em rascunho | **4** |

**Distribuição real dos status** — 1.322 `conforme` · 64 `nao_conforme` ·
62 `atencao` · **8 `sem_dado`**.

> **`SEM DADO` é `null`, nunca zero** — e é por isso que 4 ciclos **não fecham**:
> item obrigatório sem dado impede o fechamento (regra da `0041`). Os 4 rascunhos
> são a regra funcionando, não uma falha do roteiro.

**Trajetórias distintas por parceiro** (`melhora`, `queda`, `estavel`, `lacuna`,
`recupera`, `critico`), com deslocamento por parceiro para que **nem dois
repitam os mesmos números**.

### Auditoria Mensal — dois meses

| | |
|---|---|
| Competências | `2026-06` e `2026-07` |
| Auditorias | **28** (14 × 2) |
| Respostas a critérios | **728** (26 critérios por auditoria) |
| Evidências físicas no Storage | **28** |
| Planos de ação | 68 |
| Devolvidas e corrigidas | **4** |
| **Aprovadas** | **28 de 28** |
| Snapshots oficiais | **28** |

Notas A-10 dos snapshots: **86,96 a 91,67**, nenhuma nula.

### Negativas — e elas falham pelo motivo CERTO

A lição da Fase 11 é que negativa rodada contra auditoria já aprovada passa pela
mensagem errada ("não está em rascunho") e prova imutabilidade, não a regra. Por
isso o envio incompleto foi tentado **com a auditoria ainda em rascunho**:

| Prova | Mensagem literal do servidor |
|---|---|
| Envio incompleto recusado | `envio bloqueado: criterio obrigatorio CRIT-SIM-IND-001-A sem avaliacao` |
| Autor não valida a própria auditoria | `nao e permitido validar a propria avaliacao` |

---

## 6. Catálogo sintético

13 configurações regionais publicadas na RPS SIMULACAO:

- **12 indicadores canônicos** (`IND-001`…`IND-012`) vêm da migration `0021` —
  são conteúdo constitutivo, não dado de simulação. Meta, tolerância e peso
  espelham o catálogo vigente, **exatamente como o backfill de produção fez**;
- **1 indicador sintético** (`IND-SIM-013`), criado pelo caminho real do
  catálogo, reproduzindo a forma de produção (que tem 13 configurações, sendo a
  13ª criada pela interface de Admin).

**26 critérios mensais sintéticos** (2 por indicador), todos publicados, todos
carimbados com:

```
CRITERIO SINTETICO DE SIMULACAO - SEM APROVACAO EMPRESARIAL PARA PRODUCAO
```

**Ponderação regional 60/40**, deliberadamente **desigual**: com 50/50 a média
ponderada e a aritmética coincidem, e o cenário passaria sem provar a A-11.

---

## 7. Reset — `RESETAR_SIMULACAO_AAPEX_135`

```powershell
# dry-run: mostra o que seria removido, não altera nada
scripts\simulacao\Reset-SimulacaoAAPEx135.ps1

# execução real (exige a frase literal)
scripts\simulacao\Reset-SimulacaoAAPEx135.ps1 -Confirmar -Confirmacao "RESETAR SIMULACAO"
```

**O que ele admite fazer, e declara:** desliga os gatilhos
(`session_replication_role = replica`) durante a transação de limpeza,
contornando as guardas de imutabilidade de snapshot e de auditoria aprovada.
Isso está no cabeçalho do script, não escondido, porque:

- não é caminho de aplicativo e nunca será oferecido a um usuário;
- só existe porque este banco é um **laboratório descartável**;
- em produção o script **aborta antes da primeira instrução**, pelo marcador.

**Por que não a RPC de expurgo:** `admin_purge_legacy_evaluations` (0052)
**recusa** quando há avaliação fora de rascunho, snapshot, validação ou
evidência — e recusa **certo**. A fixture da Fase 11 tinha exatamente isso.
Usá-la aqui seria pedir que ela falhasse.

**Preservados pelo reset:** migrations · os 12 indicadores canônicos · o
marcador do laboratório · a chave de cutover · buckets e objetos do Storage.

---

## 8. Restaurar a fixture da Fase 11

O backup lógico está em:

```
E:\AACE_Backups\homologacao-pre-simulacao-135-SIMLAB-135-20260803-1253
C:\Users\Asus\Documents\AACE_Backups_espelho\homologacao-pre-simulacao-135-SIMLAB-135-20260803-1253   (espelho)
```

56 arquivos · SHA-256 em `SHA256SUMS.txt` · **releitura do disco conferida
56/56 nas duas cópias**.

Conteúdo preservado: 9 identidades (`auth.users` + `auth.identities`), 9
usuários, 4 parceiros, 2 regiões, 3 avaliações, **2 auditorias aprovadas**,
**2 snapshots oficiais**, 2 validações, 115 eventos de trilha, 1 bucket e 2
objetos de Storage.

**Procedimento:**

1. rodar o reset (§7) para esvaziar o laboratório;
2. reinserir na ordem: `organizations` → `regions` → `units` → `coordinations` →
   `auth.users` → `auth.identities` → `users` → `user_scopes` → `operations` →
   `operation_assignments` → catálogo → operacional;
3. usar `session_replication_role = replica` na transação de carga, porque os
   gatilhos de integridade recusariam a reinserção de auditoria já aprovada;
4. conferir as contagens contra `contagens.json`.

> **Limitação declarada:** o restore **não foi ensaiado**. O backup foi
> verificado por hash e relido do disco, mas a reinserção completa não foi
> executada — declarar "restauração testada" seria afirmar o que ninguém provou.

---

## 9. Faixa de simulação

```
AMBIENTE DE SIMULAÇÃO · DADOS FICTÍCIOS · NÃO É PRODUÇÃO · qjvpkaur…linhp
```

Montada em `App.tsx` **fora de todos os providers e acima do navegador**: aparece
em toda tela e não depende de sessão, repositório nem rota. Condicionada por
`EXPO_PUBLIC_SIMULATION_MODE`, que só liga com o literal `true`. Título da aba:
`AAPEx 1.3.5 — SIMULAÇÃO`.

**Medido nos dois bundles servidos:**

| | Build de simulação | Build de produção |
|---|---|---|
| Faixa renderizada | **sim** (`role="alert"`) | **não** |
| Texto visível na página | sim | **não** |
| Título da aba | `AAPEx 1.3.5 — SIMULAÇÃO` | `AAPEx` |
| Rolagem horizontal em 375 px | não | não |

> **Ressalva honesta:** a *string* do texto continua presente no bundle de
> produção como **dado morto** (1 ocorrência), porque o Metro não remove a
> constante exportada. O componente **não renderiza** — que é a exigência real —
> mas quem varrer o bundle de produção vai encontrar o texto. Registrado para
> não gerar alarme falso nem falsa segurança.

---

## 10. Lacunas funcionais encontradas

| # | Lacuna | Situação |
|---|---|---|
| **L-1** | **Não existe UI administrativa para definir critérios mensais.** Os 26 critérios foram criados por RPC (`catalog_create_criterion` / `catalog_publish_criterion_version`) com o JWT do administrador | **A ausência é de INTERFACE, não de regra.** O administrador **não consegue** configurar critérios pelo aplicativo hoje. Classificado como lacuna funcional para decisão futura; **nada foi implementado nesta branch** |
| **L-2** | A CLI Supabase reaponta o vínculo para produção sozinha | mitigado pelas três camadas (§2). Vale para **qualquer** sessão futura |
| **L-3** | String da faixa sobrevive no bundle de produção | §9 — não renderiza; registrado |
| **L-4** | Restore do backup não ensaiado | §8 |
| **L-5** | Projeto sem script de `lint` | `package.json` não tem `lint`; foram executados `typecheck`, suíte e build |

---

## 11. Gate de qualidade

| | |
|---|---|
| Suíte | **2.350 verdes em 139 arquivos** (piso exigido: 2.329/138) |
| `tsc --noEmit` | verde |
| Build web | `expo export --platform web` exportado |
| Bundle | **1 único JWT** (`role: anon`, ref `qjvpkaurihjvzktlinhp`) · **0** ocorrências de produção · **0** de staging · **0** `service_role` |
| Varredura de segredos | árvore versionada sem JWT, sem `service_role`, sem senha |
| `.env` / credenciais | **não versionados** |

As ocorrências de `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_JWT_SECRET` no bundle
são a **lista de chaves proibidas** de `assertNoPrivilegedSecrets`, não valores —
o mesmo achado já documentado na Fase 11 §4.

---

## 12. O que NÃO foi feito

- `main` **não** foi tocada — permanece em `a79a4a0`;
- nenhum merge, nenhuma tag, nenhum Release;
- produção e staging **intocados**;
- **nenhuma limpeza executada.** O reset foi criado e exercitado em dry-run.

A limpeza depende da frase literal:

```
AUTORIZO LIMPEZA DA SIMULAÇÃO AAPEX 1.3.5
```

Nenhuma outra frase autoriza. A aprovação do laboratório **não** autoriza apagá-lo.
