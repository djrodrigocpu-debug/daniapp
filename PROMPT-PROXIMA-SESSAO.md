# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fase 5: Auditoria Mensal por competência

Copiar o bloco abaixo para abrir a próxima sessão.

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.
>
> **O SHA exato não está escrito aqui de propósito**: cada commit de documentação o mudaria, e um
> número desatualizado no prompt é pior que nenhum. O SHA selado está em
> `E:\AACE_Backups\AAPEx-135-FASE-3-GESTAO-ASSISTIDA-20260801-2322\11-GIT.md`. Se `HEAD` for
> **posterior** a ele, confira que os commits acrescidos são só de documentação.

> **Por que a Fase 5, e não a 4.** A Fase 3 foi entregue **vertical** e absorveu o mínimo
> indispensável da Fase 4 — o vínculo íntegro entre plano e item, sem o qual o fechamento do ciclo
> não teria o que validar. O que sobrou da Fase 4 são três itens pequenos, e **dois deles são
> pré-requisito da Auditoria Mensal**, não de outra coisa: `monthly_audit_id` só faz sentido depois
> que a auditoria por competência existir. Registro em
> [AAPEX-135-PLANO-DE-IMPLEMENTACAO.md](docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md),
> Fases 3 e 4.

---

```
AAPEX 1.3.5 — AUDITORIA MENSAL POR COMPETÊNCIA
CONTINUAÇÃO A PARTIR DA GESTÃO ASSISTIDA SEMANAL

1. NATUREZA DESTA SESSÃO

Nova sessão. Não presuma acesso às conversas anteriores.

As decisões empresariais estão CONSOLIDADAS e são canônicas. A-08 e A-09
estão APROVADAS e IMPLEMENTADAS. Não reabrir.

Leia, nesta ordem, ANTES de qualquer ação:

  docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md   (A-08, canônico)
  docs/architecture/ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md (origem dos planos)
  docs/business/AAPEX-135-DECISOES-EMPRESARIAIS.md          (§5 pendências)
  docs/business/AAPEX-135-MODELO-OPERACIONAL.md             (§3 o mês da auditoria)
  docs/architecture/AAPEX-135-CONTRATOS-DE-DADOS.md         (§6; §2/§3 SUPERADOS)
  docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md     (Fases 3, 4 e 5)
  docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md       (§4, §7.2)
  docs/architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md
  docs/architecture/AAPEX-135-IMPACTO-TECNICO.md

Checkpoint técnico da Fase 3 (leia 10-RISCOS-E-PENDENCIAS.md por inteiro):
E:\AACE_Backups\AAPEx-135-FASE-3-GESTAO-ASSISTIDA-20260801-2322\

2. PROJETO

C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0
GitHub: djrodrigocpu-debug/daniapp

Estado esperado (VERIFICAR, não presumir):
  branch  aapex-1.3.5-assisted-management-monthly-audit
  remoto  origin/aapex-... no MESMO commit (upstream ja configurado)
  main    8ffc49a, intacta
  versão  1.3.4 (NÃO fazer bump)
  migrations 0001-0041; PRÓXIMO NÚMERO LIVRE: 0042
  árvore limpa

Staging: qcixfsdyfpankpatbays   Produção: plnbgdabciwygsmnyddy

3. PREFLIGHT OBRIGATÓRIO

  git status
  git branch --show-current
  git rev-parse HEAD
  git rev-parse @{upstream}
  git rev-parse main
  git log --oneline --decorate -10
  git worktree list

Diante de divergência não compreendida: PARE.

Autoria Git exclusiva: djrodrigocpu-debug <djrodrigocpu@gmail.com>
Sem Co-Authored-By, Generated-by, Assisted-by, Claude, Anthropic, AI ou IA
em nenhuma mensagem. Sem amend, rebase, squash, force push, reset --hard.
Sem merge. Sem push de main.

4. PROIBIÇÕES ATIVAS

  - fixture SIM-AAPEX-134-2MESES-20260801-1520 CONGELADA: nenhuma mutação,
    nenhuma consulta, não usar como ambiente de desenvolvimento;
  - nenhum db push em staging ou produção; migrations 0036-0041 seguem
    aplicadas APENAS localmente (PGlite);
  - nenhum build distribuído;
  - migrations ADITIVAS apenas;
  - NÃO corrigir O-05, O-14, O-15, AuthModeBanner nem o logout dos GCs;
  - NÃO executar o backfill do catálogo legado (risco RF1-01);
  - desenvolvimento LOCAL (esta máquina não tem Docker);
  - NÃO desenvolver dentro do worktree de revisão da 1.3.4.

4b. WORKTREE DE REVISÃO DA 1.3.4 — NÃO É AMBIENTE DE TRABALHO

  C:\Users\Asus\Documents\dani app\AAPEx-134-revisao-fixture  (8ffc49a, 1.3.4)

Servidor de revisão: http://localhost:8103 (LAN http://192.168.1.8:8103).
As portas 8100, 8101, 8102 e 8104 servem a ÁRVORE PRINCIPAL (1.3.5).

Reiniciar, de dentro do worktree:
  npx.cmd expo start --web --lan --port 8103

4c. DÍVIDA DE VERIFICAÇÃO HERDADA

Os 40 códigos de integridade foram medidos contra o STAGING na 1.3.4 e NÃO
puderam ser remedidos nas Fases 1 nem 3 — staging está fora de alcance. A
remedição é devida à primeira sessão com staging liberado; não a declare
cumprida sem executá-la.

5. O QUE JÁ EXISTE E VOCÊ VAI USAR

Migrations 0036-0038 (catálogo, Fase 1):
  themes / theme_versions, indicator_definitions.scope_kind/.region_id,
  indicator_regional_configs / _versions (TEMA, META, TOLERÂNCIA, PESO,
  ORDEM e as DUAS flags de módulo), audit_criteria / _versions,
  app.reaches_region, app.can_manage_catalog, 14 RPCs catalog_*.

Migrations 0039-0041 (Gestão Assistida, Fase 3):
  assisted_cycles          unique (operation_id, week_start_date) + CHECK segunda
  assisted_cycle_entries   7 FKs de proveniência + regra materializada
  app.assisted_week_start(date), app.assisted_today()
  app.assisted_status_of(direction,target,tolerance,actual)  -- target_band FALHA
  app.assisted_rule_version()  -> 'assisted-status/1.3.5-a'
  app.is_assisted_operator(uuid)
  action_plans.assisted_entry_id + .source (app.action_source) + CHECK
  RPCs: open_assisted_cycle, save_assisted_entry, close_assisted_cycle,
        get_assisted_cycle, list_assisted_cycles

Domínio: src/domain/assisted/{types,policy,screenState}.ts
Repositório: src/domain/repositories/assisted.ts +
             src/data/repositories/AssistedRepository.ts
UI: src/screens/AssistedCycleScreen.tsx (rota AssistedCycle)
Testes: src/db/assisted_management.integration.test.ts (67 casos)

ATENÇÃO — DE ONDE VEM A META. Não é de indicator_versions. É da versão
PUBLICADA e VIGENTE de indicator_regional_config_versions, da região da
operação (ADR-135-001, D-D).

ATENÇÃO — O MOTOR DE PLANOS É ÚNICO. source = 'monthly_audit' JÁ EXISTE no
enum e é RECUSADO pelo CHECK até esta sessão criar monthly_audit_id. Não
criar RPC própria de plano: save_action_plan é a única porta.

ATENÇÃO — TEARDOWN DO HARNESS. Toda tabela nova com coluna de enum de `app`
precisa entrar em supabase/rollback/0001_core_schema.down.sql, que fica FORA
de migrations/. Sem isso, db.reset() derruba a coluna e a reaplicação não a
recria — o sintoma é opaco e aparece em RPC sem relação com o assunto.

6. O QUE ENTREGAR: FASE 5 — AUDITORIA MENSAL POR COMPETÊNCIA

Migrations a partir de 0042:

  - start_monthly_audit(operation_id, competence) com PERÍODO POR PARÂMETRO
    (fecha o achado O-06: hoje start_evaluation deriva tudo de now());
  - uma auditoria oficial por parceiro por competência, com unicidade DE BANCO;
  - evaluation_criteria: materialização dos critérios na criação da auditoria;
  - só entram indicadores com include_in_monthly_audit = true na configuração
    regional PUBLICADA e VIGENTE da região da operação;
  - guarda de imutabilidade dos critérios materializados;
  - RESIDUAL DA FASE 4: action_plans.monthly_audit_id + relaxar o CHECK
    action_plans_source_ck para a terceira origem;
  - TESTE DIRIGIDO DO O-11: plano em 'completed', criador tenta validar ->
    recusa POR REGRA DE ATOR, não por máquina de estados (teste negativo 31).

CRITÉRIO DE SAÍDA (todos verificáveis localmente):
  [ ] auditoria de competência PASSADA registrável pelo caminho oficial;
  [ ] uma auditoria oficial por parceiro por competência, recusada no banco;
  [ ] só entram indicadores com include_in_monthly_audit = true;
  [ ] critérios MATERIALIZADOS na criação; alterar o catálogo depois NÃO muda
      a auditoria (teste negativo 32);
  [ ] aprovação gera snapshot imutável;
  [ ] plano com source = 'monthly_audit' e monthly_audit_id válido é aceito;
      origem incoerente continua recusada pelo CHECK;
  [ ] O-11 fechado por teste dirigido;
  [ ] anon e PUBLIC sem grants nas tabelas novas; RLS forçada;
  [ ] get_official_audit_report_data: auditoria SEM critérios materializados
      percorre o caminho antigo SEM DESVIO.

7. INVARIANTES QUE NÃO PODEM QUEBRAR

  - 1651 testes atuais verdes (suíte completa);
  - 18 testes negativos originais verdes; 28, 29 e 30 verdes;
  - determinismo do Relatório Oficial (RT-01 é risco ALTO: alterar
    get_official_audit_report_data pode quebrar os 40 códigos);
  - zero vazamento de escopo nos quatro papéis;
  - trilha imutável; anti-auto-validação; overdue derivado da data;
  - RLS forçada em TODAS as tabelas; gatilhos habilitados ao final;
  - imutabilidade do ciclo fechado da Gestão Assistida;
  - typecheck limpo; export web sem erro.

8. LIMITE DA SESSÃO

Implemente SOMENTE a Auditoria Mensal por competência e o residual da Fase 4.
NÃO iniciar cutover, ponderação, Dashboard, Matriz, exportação nem PDF novo.

Reserve contexto para testes, documentação, checkpoint e prompt de retomada.
Diante de contexto insuficiente: concluir a menor unidade íntegra, não deixar
migration pela metade, registrar NO-GO para o resto.

9. REGISTRO

Crie o checkpoint no início, não no fim, e registre cada etapa concluída no
worklog append-only (lição L-01).
```

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 5 (Auditoria Mensal por competência).

A Fase 3 está pronta e foi entregue VERTICAL: migrations 0039-0041 criaram a
Gestão Assistida semanal idempotente, o cálculo autoritativo de status e o
vínculo íntegro ao motor único de planos. A Fase 4 ficou parcialmente
absorvida; o residual (monthly_audit_id, a terceira perna do CHECK e o teste
dirigido do O-11) entra nesta sessão. Próximo número de migration livre: 0042.

A meta NÃO vem de indicator_versions: vem da versão publicada e vigente de
indicator_regional_config_versions da região da operação.

Leia os nove documentos 1.3.5 (inclusive ADR-135-002) e o checkpoint
E:\AACE_Backups\AAPEx-135-FASE-3-GESTAO-ASSISTIDA-20260801-2322\ antes de
agir. Rode o preflight Git.

Restrições: fixture congelada, sem db push, sem build, migrations aditivas,
versão fica em 1.3.4, autoria Git exclusiva do proprietário e sem menção a IA.
```
