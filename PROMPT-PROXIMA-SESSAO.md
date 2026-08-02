# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fase 10: interface final, acessibilidade e novo relatório mensal

Copiar o bloco abaixo para abrir a próxima sessão.

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.
> O SHA selado está em
> `E:\AACE_Backups\AAPEx-135-FASES-7-8-9-CUTOVER-DASHBOARD-EXPORTACAO-20260802-1123\14-GIT.md`.

> **Por que a Fase 10.** O Plano de Implementação §3 põe a Fase 10 depois das 8 e 9, e as duas estão
> fechadas: Dashboard, Matriz, ponderação e exportação existem, com escopo e filtros server-side. O
> que resta é o que a Fase 10 sempre foi — **acabamento**: coerência de navegação, revisão integral
> de acessibilidade, terminologia D8 em toda a interface, refinamento responsivo, e o **novo PDF da
> Auditoria Mensal**, que depende de A-05 e é a única entrega dela que não é polimento.

---

```
AAPEX 1.3.5 — FASE 10: INTERFACE FINAL, ACESSIBILIDADE E NOVO RELATÓRIO MENSAL

1. NATUREZA DESTA SESSÃO

Nova sessão. Não presuma acesso às conversas anteriores.

As decisões empresariais estão CONSOLIDADAS. A-08 e A-09 estão RESOLVIDAS.
Não reabrir.

Leia, nesta ordem, ANTES de qualquer ação:

  docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md
  docs/architecture/ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md
  docs/architecture/ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md
  docs/business/AAPEX-135-DECISOES-EMPRESARIAIS.md        (§5 e §7 — A-05, A-06, A-10, A-11)
  docs/business/AAPEX-135-MODELO-OPERACIONAL.md           (§7.3 e §9 — acessibilidade e terminologia)
  docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md     (§8 e §10)
  docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md   (Gate 0 e Fases 7 a 11)
  docs/architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md
  docs/architecture/AAPEX-135-IMPACTO-TECNICO.md          (RT-14 e RT-15 são novos)
  docs/architecture/AAPEX-135-CONTRATOS-DE-DADOS.md

Checkpoint desta sessão (leia 00, 11, 12 e 13 por inteiro):
E:\AACE_Backups\AAPEx-135-FASES-7-8-9-CUTOVER-DASHBOARD-EXPORTACAO-20260802-1123\

2. PROJETO

C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0
GitHub: djrodrigocpu-debug/daniapp

Estado esperado (VERIFICAR, não presumir):
  branch  aapex-1.3.5-assisted-management-monthly-audit
  remoto  origin/aapex-... no MESMO commit
  main    8ffc49a, intacta
  versão  1.3.4, build 8 (NÃO fazer bump)
  REPORT_FORMAT_VERSION 1.3.3
  migrations 0001-0049; PRÓXIMO NÚMERO LIVRE: 0050
  2145 testes verdes, 130 arquivos
  árvore limpa
  worktree de revisão da 1.3.4 em C:\Users\Asus\Documents\dani app\AAPEx-134-revisao-fixture

Staging: qcixfsdyfpankpatbays   Produção: plnbgdabciwygsmnyddy

3. PREFLIGHT OBRIGATÓRIO

  git status
  git branch --show-current
  git rev-parse HEAD
  git rev-parse @{upstream}
  git rev-parse main origin/main
  git log --oneline --decorate -20
  git worktree list

Diante de divergência não compreendida: PARE.

Autoria Git exclusiva: djrodrigocpu-debug <djrodrigocpu@gmail.com>
Sem Co-Authored-By, Generated-by, Assisted-by, Claude, Anthropic, AI ou IA.
Sem amend, rebase, squash, force push, reset --hard. Sem merge.
Sem push de main.

4. PROIBIÇÕES ATIVAS

  - fixture SIM-AAPEX-134-2MESES-20260801-1520 CONGELADA;
  - credentials.txt em scratchpad\simulacoes\... NÃO deve ser lido nem copiado;
  - nenhum db push em staging ou produção; 0036-0049 seguem SÓ locais;
  - nenhum build distribuído;
  - migrations ADITIVAS apenas;
  - NÃO ATIVAR o cutover: weekly_audit_cutover_date é JSON null e FICA null;
  - NÃO semear peso em region_weightings (A-04);
  - NÃO alterar app.monthly_audit_score (A-10) nem a regra de desempenho (A-11);
  - NÃO fechar A-06 inventando a composição do Resumo;
  - NÃO corrigir O-05, O-14, O-15, O-10, RT-13, AuthModeBanner nem o logout dos GCs;
  - NÃO executar o backfill do catálogo legado;
  - NÃO atualizar os seis artefatos públicos;
  - desenvolvimento LOCAL (esta máquina não tem Docker);
  - NÃO desenvolver no worktree de revisão da 1.3.4.

5. O QUE JÁ EXISTE

Catálogo (0036-0038): themes/theme_versions, escopo global/regional,
indicator_regional_configs/_versions (TEMA, META, TOLERÂNCIA, PESO, ORDEM e as
duas flags), audit_criteria/_versions, app.reaches_region,
app.can_manage_catalog, 14 RPCs catalog_*.

Gestão Assistida (0039-0041): assisted_cycles com unique
(operation_id, week_start_date), assisted_cycle_entries, app.assisted_status_of,
app.is_assisted_operator, 5 RPCs, tela AssistedCycleScreen.

Auditoria Mensal (0042-0044): app.evaluation_model, app.criterion_answer_status,
evaluation_criteria / _criterion_answers / _criterion_answer_evidence,
app.monthly_audit_score (PROVISÓRIA, A-10), 6 RPCs, tela MonthlyAuditScreen.

Autorização (0045): escopo antes da fronteira de modelo nos dois wrappers;
authenticated com exatamente SELECT nas seis tabelas de catálogo.

O-18 (0046): submit_evaluation, remove_evidence e reserve_evidence_upload
respondem "avaliacao inexistente ou fora do escopo" para inexistente E para
fora do alcance. A fronteira uniformizada é o ESCOPO, e só ele.

Cutover (0047): system_settings com client_readable e CHECK de forma por
chave; weekly_audit_cutover_date = JSON NULL; get_system_settings;
admin_set_weekly_audit_cutover (ADMIN-only, exige confirmação para data
vencida); start_evaluation virou wrapper. A guarda NÃO bloqueia ciclo semanal
reaproveitável — rascunho existente continua abrindo.

Ponderação e painel (0048): region_weightings versionada e VAZIA (A-04);
catalog_save_region_weighting_draft; catalog_publish_region_weighting;
get_weighting_status; get_dashboard_aggregates; get_matrix_dataset;
domínio em src/domain/dashboard/types135.ts e policy135.ts;
DashboardRepository; tela ManagementDashboardScreen.

Exportação (0049): export_dataset(module, filters) como porta única, com
colunas TIPADAS; escritores src/domain/exporting/csv.ts e xlsx.ts;
ExportRepository; fluxo mínimo dentro de ManagementDashboardScreen.

OITO ARMADILHAS CONHECIDAS:

  1. A META vem de indicator_regional_config_versions, NUNCA de
     indicator_versions.
  2. save_action_plan é a ÚNICA porta do motor de planos.
  3. Estender função legada COPIANDO O CORPO é proibido: use pg_get_functiondef
     para MOVER a vigente para app.*_legacy e escreva um wrapper.
  4. O WRAPPER RODA ANTES DA GUARDA (O-16). Verifique ator e escopo -- ou
     delegue -- ANTES de dizer qualquer coisa sobre o objeto. E agora há CINCO
     funções legadas em wrapper: submit_evaluation, get_official_audit_report_data,
     remove_evidence, reserve_evidence_upload e start_evaluation. Cada camada
     nova roda antes de todas as anteriores (RT-15).
  5. REVOGAR POR LISTA É ANTIPADRÃO (O-17). Use `revoke all from anon, public,
     authenticated` seguido de `grant select to authenticated`.
  6. Toda tabela nova com coluna de enum de `app` -- OU que guarde ESTADO que
     não deva vazar entre testes -- precisa entrar em
     supabase/rollback/0001_core_schema.down.sql, FORA de migrations/.
  7. LISTA VAZIA É AUSÊNCIA DE FILTRO, não conjunto vazio (RT-14). `?` em jsonb
     é verdadeiro para `[]`, e o `in (select ...)` sobre array vazio não casa
     com nada -- o painel esvaziava em silêncio. Use app.filter_len.
  8. "SEM DADO" NUNCA É ZERO. Nem no banco (null), nem no adapter
     (Number(null) é 0), nem na tela, nem no CSV, nem no XLSX.

6. O QUE ENTREGAR: FASE 10

  a) O-12 fechado por completo na navegação nova, e nenhum controle novo sem
     accessibilityRole="button" + tabIndex (não repetir o O-13);
  b) separação visual dos TRÊS blocos: histórico semanal legado · Gestão
     Assistida · Auditoria Mensal;
  c) terminologia D8 aplicada em TODA a interface -- "Relatório oficial da
     operação" (fonte externa) nunca confundido com "Relatório Oficial da
     Auditoria Mensal" (PDF do AAPEx);
  d) revisão integral de acessibilidade nas telas das Fases 3, 5, 8 e 9;
  e) refinamento responsivo a 375 px em todas elas;
  f) NOVO PDF DA AUDITORIA MENSAL -- e este é o único item que não é
     polimento. Ele depende de A-05 (contrato e versão do novo formato), que
     está ABERTA. Se A-05 não for decidida, entregue o comportamento
     conservador que já existe: get_official_audit_report_data RECUSA o modelo
     monthly_criteria citando A-05, e a interface NÃO oferece o botão. Botão
     que gera documento incompatível é pior que botão ausente.

CRITÉRIO DE SAÍDA:
  [ ] O-12: auditoria aprovada acessível, com Pressable, role apropriado,
      teclado, foco, leitor de tela, e acesso a snapshot, respostas,
      evidências, planos e PDF;
  [ ] teste de UI: todo ciclo listado tem rota de abertura;
  [ ] nenhum controle novo sem role="button" + tabindex;
  [ ] os três blocos visualmente distintos;
  [ ] terminologia D8 aplicada e testada;
  [ ] 375 px sem overflow em todas as telas novas;
  [ ] REPORT_FORMAT_VERSION 1.3.3 PRESERVADA, a menos que A-05 seja decidida
      nesta sessão -- e, se for, a decisão precisa ser registrada ANTES do
      código;
  [ ] 2145 testes atuais continuam verdes.

7. INVARIANTES QUE NÃO PODEM QUEBRAR

  - 2145 testes verdes (suíte completa);
  - determinismo do Relatório Oficial legado -- RT-01 continua o risco mais
    alto do programa; app.official_audit_report_legacy NÃO pode ser tocada;
  - imutabilidade do ciclo fechado, da auditoria enviada e do snapshot;
  - trilha imutável; anti-auto-validação; overdue derivado da data;
  - RLS forçada em TODAS as tabelas; gatilhos habilitados ao final;
  - a bateria da Fase 6 continua verde, agora sobre 13 tabelas e 32 RPCs;
  - weekly_audit_cutover_date continua JSON NULL;
  - region_weightings continua VAZIA;
  - typecheck limpo; export web sem erro; bundle em 1.3.4 e sem segredo
    privilegiado.

8. LIMITE DA SESSÃO

Implemente SOMENTE a Fase 10. NÃO iniciar homologação, bump de versão, build
distribuído nem publicação. NÃO ativar o cutover. NÃO tocar staging, produção
ou a fixture.

Reserve contexto para testes, documentação, checkpoint e prompt de retomada.

9. REGISTRO

Crie o checkpoint no início, não no fim, e registre cada etapa no worklog
append-only (lição L-01).

10. O QUE CONTINUA DEVIDO DEPOIS DA FASE 10

  - A-01, A-02, A-03, A-04, A-05, A-06, A-07, A-10 e A-11;
  - backfill do catálogo legado (bloqueia a ativação do cutover);
  - remedição dos 40 códigos de integridade contra staging;
  - Fase 11: homologação, bump para 1.3.5 e atualização dos seis artefatos
    públicos.
```

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 10 (interface final, acessibilidade e novo
relatório mensal).

O Gate 0 e as Fases 1 a 9 estão prontos: catálogo global/regional (0036-0038),
Gestão Assistida (0039-0041), Auditoria Mensal (0042-0044), hardening de
autorização (0045), O-18 fechado (0046), cutover inerte (0047), ponderação e
painel (0048) e exportação (0049). 2145 testes verdes em 130 arquivos. Próxima
migration livre: 0050.

O cutover está CRIADO e DESATIVADO — weekly_audit_cutover_date é JSON null, e
precisa continuar assim. region_weightings está VAZIA (A-04). A-10 e a nova
A-11 (pontuação do eixo de desempenho) seguem PROVISÓRIAS, e A-06 continua
aberta: a aba Resumo traz um "Resumo técnico provisório".

A Fase 10 é acabamento — O-12, os três blocos visuais, terminologia D8,
acessibilidade e 375 px — mais o novo PDF mensal, que depende de A-05. Se A-05
não for decidida, mantenha o comportamento conservador: a RPC recusa o modelo
novo citando A-05 e a interface não oferece o botão.

Leia os dez documentos 1.3.5 e o checkpoint
E:\AACE_Backups\AAPEx-135-FASES-7-8-9-CUTOVER-DASHBOARD-EXPORTACAO-20260802-1123\
antes de agir. Rode o preflight Git.

Restrições: fixture congelada, sem db push, sem build, migrations aditivas,
versão fica em 1.3.4, REPORT_FORMAT_VERSION fica em 1.3.3, cutover NÃO
ativado, nenhum peso semeado, autoria Git exclusiva do proprietário e sem
menção a IA.
```
