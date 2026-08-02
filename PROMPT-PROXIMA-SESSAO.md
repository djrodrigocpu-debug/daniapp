# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fase 6: autorização server-side com escopo regional

Copiar o bloco abaixo para abrir a próxima sessão.

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.
> O SHA selado está em `E:\AACE_Backups\AAPEx-135-FASE-5-AUDITORIA-MENSAL-20260802-0046\13-GIT.md`.

> **Por que a Fase 6, e não a 7.** O Plano de Implementação §3 é explícito: *"Fase 6 exige 2, 3, 4
> e 5 prontas — autorização se aplica sobre superfície existente"*. As quatro estão prontas. A Fase
> 6 é a bateria completa dos testes negativos 19–36 sobre tudo o que foi construído, e é ela que
> permite afirmar "zero vazamento de escopo" sem ressalva.

---

```
AAPEX 1.3.5 — AUTORIZAÇÃO SERVER-SIDE COM ESCOPO REGIONAL
CONTINUAÇÃO A PARTIR DA AUDITORIA MENSAL POR COMPETÊNCIA

1. NATUREZA DESTA SESSÃO

Nova sessão. Não presuma acesso às conversas anteriores.

As decisões empresariais estão CONSOLIDADAS. A-08 e A-09 estão RESOLVIDAS.
Não reabrir.

Leia, nesta ordem, ANTES de qualquer ação:

  docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md      (A-08)
  docs/architecture/ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md  (origem dos planos + correção D-Q)
  docs/architecture/ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md (modelo mensal)
  docs/business/AAPEX-135-DECISOES-EMPRESARIAIS.md             (§5 pendências, inclusive A-10)
  docs/business/AAPEX-135-MODELO-OPERACIONAL.md
  docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md          (§8, testes 19–36)
  docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md        (Fases 5 e 6)
  docs/architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md
  docs/architecture/AAPEX-135-IMPACTO-TECNICO.md
  docs/architecture/AAPEX-135-CONTRATOS-DE-DADOS.md

Checkpoint da Fase 5 (leia 12-RISCOS-E-PENDENCIAS.md por inteiro):
E:\AACE_Backups\AAPEx-135-FASE-5-AUDITORIA-MENSAL-20260802-0046\

2. PROJETO

C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0
GitHub: djrodrigocpu-debug/daniapp

Estado esperado (VERIFICAR, não presumir):
  branch  aapex-1.3.5-assisted-management-monthly-audit
  remoto  origin/aapex-... no MESMO commit
  main    8ffc49a, intacta
  versão  1.3.4 (NÃO fazer bump)
  migrations 0001-0044; PRÓXIMO NÚMERO LIVRE: 0045
  1818 testes verdes
  árvore limpa

Staging: qcixfsdyfpankpatbays   Produção: plnbgdabciwygsmnyddy

3. PREFLIGHT OBRIGATÓRIO

  git status
  git branch --show-current
  git rev-parse HEAD
  git rev-parse @{upstream}
  git rev-parse main origin/main
  git log --oneline --decorate -15
  git worktree list

Diante de divergência não compreendida: PARE.

Autoria Git exclusiva: djrodrigocpu-debug <djrodrigocpu@gmail.com>
Sem Co-Authored-By, Generated-by, Assisted-by, Claude, Anthropic, AI ou IA.
Sem amend, rebase, squash, force push, reset --hard. Sem merge.
Sem push de main.

4. PROIBIÇÕES ATIVAS

  - fixture SIM-AAPEX-134-2MESES-20260801-1520 CONGELADA;
  - nenhum db push em staging ou produção; 0036-0044 seguem SÓ locais;
  - nenhum build distribuído;
  - migrations ADITIVAS apenas;
  - NÃO corrigir O-05, O-14, O-15, AuthModeBanner nem o logout dos GCs;
  - NÃO executar o backfill do catálogo legado (risco RF1-01);
  - desenvolvimento LOCAL (esta máquina não tem Docker);
  - NÃO desenvolver no worktree de revisão da 1.3.4.

4b. WORKTREE DE REVISÃO DA 1.3.4 — NÃO É AMBIENTE DE TRABALHO

  C:\Users\Asus\Documents\dani app\AAPEx-134-revisao-fixture  (8ffc49a, 1.3.4)

Servidor de revisão: http://localhost:8103 (LAN http://192.168.1.8:8103).
As portas 8100, 8101, 8102, 8104 e 8105 servem a ÁRVORE PRINCIPAL (1.3.5).

4c. DÍVIDA DE VERIFICAÇÃO HERDADA

Os 40 códigos de integridade foram medidos contra o STAGING na 1.3.4 e NÃO
puderam ser remedidos nas Fases 1, 3 nem 5 — staging está fora de alcance.
Não declare cumprida sem executar.

5. O QUE JÁ EXISTE

Catálogo (0036-0038): themes/theme_versions, escopo global/regional,
indicator_regional_configs/_versions (TEMA, META, TOLERÂNCIA, PESO, ORDEM e as
duas flags), audit_criteria/_versions, app.reaches_region,
app.can_manage_catalog, 14 RPCs catalog_*.

Gestão Assistida (0039-0041): assisted_cycles com unique
(operation_id, week_start_date), assisted_cycle_entries, app.assisted_status_of
(target_band FALHA), app.is_assisted_operator, 5 RPCs.

Auditoria Mensal (0042-0044): app.evaluation_model {legacy_template,
monthly_criteria}, app.criterion_answer_status (4 valores),
evaluation_criteria / evaluation_criterion_answers /
evaluation_criterion_answer_evidence, app.monthly_audit_score (PROVISÓRIA,
A-10), start_monthly_audit(operation_id, competence),
save_criterion_answer, submit_monthly_audit, get_monthly_audit,
list_monthly_audits, get_monthly_audit_snapshot.

Planos: action_plans.source {legacy, assisted, monthly_audit} com
assisted_entry_id (1:1) e monthly_criterion_answer_id (N:1).

Domínio: src/domain/{catalog,assisted,monthlyAudit}/
UI: CatalogSection, AssistedCycleScreen, MonthlyAuditScreen

TRÊS ARMADILHAS CONHECIDAS:

  1. A META vem de indicator_regional_config_versions, NUNCA de
     indicator_versions.
  2. save_action_plan é a ÚNICA porta do motor de planos. Não criar RPC
     paralela.
  3. Estender função legada COPIANDO O CORPO é proibido. Use
     pg_get_functiondef para renomear a vigente para app.*_legacy e escreva um
     wrapper. A 0044 perdeu a guarda de estado da 0027 fazendo cópia, e cinco
     testes pegaram. Já aplicado a submit_evaluation e
     get_official_audit_report_data.
  4. Toda tabela nova com coluna de enum de `app` precisa entrar em
     supabase/rollback/0001_core_schema.down.sql, FORA de migrations/.

6. O QUE ENTREGAR: FASE 6 — AUTORIZAÇÃO COM ESCOPO REGIONAL

Não é um `if` a mais: é a BATERIA COMPLETA aplicada sobre a superfície inteira.

  - testes negativos 19 a 36 da Matriz §8, TODOS, com a mensagem literal do
    servidor registrada em cada um;
  - ordem de verificação conferida em toda RPC nova:
    ator -> papel -> escopo -> estado -> efeito;
  - zero vazamento de escopo nos quatro papéis, sobre catálogo, Gestão
    Assistida, Auditoria Mensal, planos e evidências;
  - falsificação recusada: actor, role, region_id, operation_id, evaluation_id,
    answer_id, entry_id, evidence_id, action_plan_id, status, score;
  - anon e PUBLIC sem EXECUTE em TODA RPC nova e sem grant em TODA tabela nova;
  - `search_path` fixo e owner conhecido em toda SECURITY DEFINER;
  - inventário: listar toda função SECURITY DEFINER criada em 0036-0044 e
    provar as seis propriedades de cada uma.

Migrations só se algum buraco for encontrado. A partir de 0045.

CRITÉRIO DE SAÍDA:
  [ ] testes negativos 19-36 todos verdes, com mensagem literal registrada;
  [ ] os 18 testes negativos originais continuam verdes;
  [ ] zero vazamento de escopo nos quatro papéis;
  [ ] nenhuma SECURITY DEFINER sem search_path fixo;
  [ ] nenhuma RPC nova executável por anon ou PUBLIC;
  [ ] 1818 testes atuais continuam verdes.

7. INVARIANTES QUE NÃO PODEM QUEBRAR

  - 1818 testes verdes (suíte completa);
  - determinismo do Relatório Oficial legado — RT-01 continua sendo o risco
    mais alto do programa;
  - imutabilidade do ciclo fechado, da auditoria enviada e do snapshot;
  - trilha imutável; anti-auto-validação; overdue derivado da data;
  - RLS forçada em TODAS as tabelas; gatilhos habilitados ao final;
  - typecheck limpo; export web sem erro.

8. LIMITE DA SESSÃO

Implemente SOMENTE a autorização. NÃO iniciar cutover, ponderação, Dashboard,
Matriz, exportação nem PDF novo.

Reserve contexto para testes, documentação, checkpoint e prompt de retomada.

9. REGISTRO

Crie o checkpoint no início, não no fim, e registre cada etapa no worklog
append-only (lição L-01).
```

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 6 (autorização server-side com escopo regional).

As Fases 1 a 5 estão prontas: catálogo global/regional (0036-0038), Gestão
Assistida semanal (0039-0041) e Auditoria Mensal por competência (0042-0044),
com 1818 testes verdes. Próxima migration livre: 0045. O-06 e O-11 fechados.

A Fase 6 é a bateria completa dos testes negativos 19-36 da Matriz de
Permissões sobre toda a superfície construída, com a mensagem literal do
servidor registrada em cada um.

Leia os dez documentos 1.3.5 (três ADRs) e o checkpoint
E:\AACE_Backups\AAPEx-135-FASE-5-AUDITORIA-MENSAL-20260802-0046\ antes de agir.
Rode o preflight Git.

Restrições: fixture congelada, sem db push, sem build, migrations aditivas,
versão fica em 1.3.4, autoria Git exclusiva do proprietário e sem menção a IA.
```
