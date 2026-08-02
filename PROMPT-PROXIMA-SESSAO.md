# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fase 7: cutover parametrizável, criado e NÃO ativado

Copiar o bloco abaixo para abrir a próxima sessão.

> **Antes de colar:** conferir que a árvore está limpa e que `HEAD` local e
> `origin/aapex-1.3.5-assisted-management-monthly-audit` apontam para o **mesmo** commit.
> O SHA selado está em
> `E:\AACE_Backups\AAPEx-135-FASE-6-AUTORIZACAO-20260802-1014\11-GIT.md`.

> **Por que a Fase 7, e não a 8.** O Plano de Implementação §3 põe a Fase 7 imediatamente depois da
> 6, e a 6 está fechada: a bateria negativa 19–36 está verde com mensagem literal registrada, e os
> dois defeitos que ela achou foram corrigidos pela 0045. As Fases 8 e 9 dependem da 7 no grafo de
> dependências. **A Fase 7 é pequena de propósito** — cria estrutura e a deixa inerte —, e é a única
> que pode ser feita sem resolver nenhuma pendência empresarial aberta.

---

```
AAPEX 1.3.5 — FASE 7: CUTOVER PARAMETRIZÁVEL, CRIADO E NÃO ATIVADO

1. NATUREZA DESTA SESSÃO

Nova sessão. Não presuma acesso às conversas anteriores.

As decisões empresariais estão CONSOLIDADAS. A-08 e A-09 estão RESOLVIDAS.
Não reabrir.

Leia, nesta ordem, ANTES de qualquer ação:

  docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md
  docs/architecture/ADR-135-002-PLANOS-DA-GESTAO-ASSISTIDA.md
  docs/architecture/ADR-135-003-AUDITORIA-MENSAL-MATERIALIZADA.md
  docs/business/AAPEX-135-DECISOES-EMPRESARIAIS.md        (§5 pendências, A-02, A-03, A-10)
  docs/business/AAPEX-135-MODELO-OPERACIONAL.md
  docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md     (§8 — a bateria 19-36, agora verde)
  docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md   (Fases 6 e 7)
  docs/architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md (§5 cutover; §2, as armadilhas)
  docs/architecture/AAPEX-135-IMPACTO-TECNICO.md
  docs/architecture/AAPEX-135-CONTRATOS-DE-DADOS.md       (§7)

Checkpoint da Fase 6 (leia 08-ACHADOS-E-CORRECOES.md e 10-RISCOS-E-PENDENCIAS.md
por inteiro):
E:\AACE_Backups\AAPEx-135-FASE-6-AUTORIZACAO-20260802-1014\

2. PROJETO

C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0
GitHub: djrodrigocpu-debug/daniapp

Estado esperado (VERIFICAR, não presumir):
  branch  aapex-1.3.5-assisted-management-monthly-audit
  remoto  origin/aapex-... no MESMO commit
  main    8ffc49a, intacta
  versão  1.3.4 (NÃO fazer bump)
  migrations 0001-0045; PRÓXIMO NÚMERO LIVRE: 0046
  1901 testes verdes, 121 arquivos
  árvore limpa
  worktree de revisão da 1.3.4 em C:\Users\Asus\Documents\dani app\AAPEx-134-revisao-fixture

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
  - nenhum db push em staging ou produção; 0036-0045 seguem SÓ locais;
  - nenhum build distribuído;
  - migrations ADITIVAS apenas;
  - NÃO ATIVAR o cutover — a data nasce NULA e fica NULA;
  - NÃO corrigir O-05, O-14, O-15, O-18, AuthModeBanner nem o logout dos GCs;
  - NÃO executar o backfill do catálogo legado;
  - NÃO alterar a fórmula de pontuação mensal (A-10);
  - desenvolvimento LOCAL (esta máquina não tem Docker);
  - NÃO desenvolver no worktree de revisão da 1.3.4.

5. O QUE JÁ EXISTE

Catálogo (0036-0038): themes/theme_versions, escopo global/regional,
indicator_regional_configs/_versions (TEMA, META, TOLERÂNCIA, PESO, ORDEM e as
duas flags), audit_criteria/_versions, app.reaches_region,
app.can_manage_catalog, 14 RPCs catalog_*.

Gestão Assistida (0039-0041): assisted_cycles com unique
(operation_id, week_start_date), assisted_cycle_entries, app.assisted_status_of,
app.is_assisted_operator, 5 RPCs.

Auditoria Mensal (0042-0044): app.evaluation_model, app.criterion_answer_status,
evaluation_criteria / _criterion_answers / _criterion_answer_evidence,
app.monthly_audit_score (PROVISÓRIA, A-10), 6 RPCs, e os wrappers
app.submit_evaluation_legacy e app.official_audit_report_legacy.

Autorização (0045): escopo antes da fronteira de modelo nos dois wrappers;
authenticated com exatamente SELECT nas seis tabelas de catálogo.

CINCO ARMADILHAS CONHECIDAS:

  1. A META vem de indicator_regional_config_versions, NUNCA de
     indicator_versions.
  2. save_action_plan é a ÚNICA porta do motor de planos.
  3. Estender função legada COPIANDO O CORPO é proibido: use pg_get_functiondef
     para renomear a vigente para app.*_legacy e escreva um wrapper.
  4. O WRAPPER RODA ANTES DA GUARDA. Toda fronteira nova escrita num wrapper
     passa à frente da autorização que mora na função legada. Foi o achado O-16.
     Verifique ator e escopo -- ou delegue -- ANTES de dizer qualquer coisa
     sobre o objeto.
  5. REVOGAR POR LISTA É ANTIPADRÃO. `revoke insert, update, delete, truncate`
     deixa REFERENCES e TRIGGER, que o ambiente real concede a toda tabela nova.
     Foi o achado O-17. Use `revoke all from anon, public, authenticated`
     seguido de `grant select to authenticated`.
  6. Toda tabela nova com coluna de enum de `app` precisa entrar em
     supabase/rollback/0001_core_schema.down.sql, FORA de migrations/.

6. O QUE ENTREGAR: FASE 7 — CUTOVER PARAMETRIZÁVEL

Migration 0046, `system_settings_and_cutover`:

  - tabela public.system_settings (key text pk, value jsonb not null,
    updated_at, updated_by), RLS habilitada E FORÇADA, sem policy de escrita,
    anon e PUBLIC sem grant, authenticated com SELECT e NADA MAIS;
  - semente weekly_audit_cutover_date = null;
  - guarda INERTE em start_evaluation: recusa frequency='weekly' SOMENTE quando
    a data existir E já tiver passado. Com data nula, comportamento BIT A BIT
    idêntico ao atual;
  - RPC de leitura da configuração, e RPC administrativa de escrita
    (admin-only) — se a escrita entrar, ela NÃO pode gravar data no passado sem
    ato explícito, e precisa entrar na bateria negativa.

start_evaluation é função LEGADA. Aplique a técnica do wrapper, e a armadilha 4.

CRITÉRIO DE SAÍDA:
  [ ] com data nula, start_evaluation bit a bit idêntico ao atual (teste 7 de
      migração), incluindo a idempotência por (operação, frequência) em rascunho;
  [ ] com data preenchida e vencida, 'weekly' recusado com mensagem nominal;
  [ ] com data preenchida e FUTURA, 'weekly' continua permitido;
  [ ] 'monthly' NUNCA é afetado pela guarda;
  [ ] cutover permanece DESATIVADO ao fim da fase — a linha semeada tem valor
      nulo e nenhum teste a preenche fora do próprio teste;
  [ ] system_settings entra na bateria: anon sem grant, RLS forçada, escrita
      direta recusada, e a RPC de escrita recusada a não-admin;
  [ ] os 40 códigos de integridade continuam SEM MEDIÇÃO (staging fora de
      alcance) — declare, não presuma;
  [ ] 1901 testes atuais continuam verdes.

7. INVARIANTES QUE NÃO PODEM QUEBRAR

  - 1901 testes verdes (suíte completa);
  - determinismo do Relatório Oficial legado — RT-01 continua sendo o risco mais
    alto do programa;
  - imutabilidade do ciclo fechado, da auditoria enviada e do snapshot;
  - trilha imutável; anti-auto-validação; overdue derivado da data;
  - RLS forçada em TODAS as tabelas; gatilhos habilitados ao final;
  - a bateria de autorização da Fase 6 continua verde, inclusive os 83 casos de
    src/db/authorization_surface.integration.test.ts;
  - typecheck limpo; export web sem erro.

8. LIMITE DA SESSÃO

Implemente SOMENTE o cutover parametrizável. NÃO iniciar ponderação, Dashboard,
Matriz, exportação, PDF novo nem homologação. NÃO ativar o cutover.

Reserve contexto para testes, documentação, checkpoint e prompt de retomada.

9. REGISTRO

Crie o checkpoint no início, não no fim, e registre cada etapa no worklog
append-only (lição L-01).
```

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 7 (cutover parametrizável, criado e NÃO ativado).

As Fases 1 a 6 estão prontas: catálogo global/regional (0036-0038), Gestão
Assistida (0039-0041), Auditoria Mensal (0042-0044) e o hardening de
autorização (0045), com 1901 testes verdes. Próxima migration livre: 0046.

A Fase 6 fechou os achados O-16 (fronteira de modelo antes da de escopo nos
wrappers) e O-17 (REFERENCES/TRIGGER com authenticated no catálogo novo), e
deixou O-18 registrado e aberto. A bateria negativa 19-36 está verde com a
mensagem literal do servidor em cada linha.

A Fase 7 cria system_settings com weekly_audit_cutover_date NULA e uma guarda
INERTE em start_evaluation — que é função legada, e portanto pede wrapper.

Leia os dez documentos 1.3.5 e o checkpoint
E:\AACE_Backups\AAPEx-135-FASE-6-AUTORIZACAO-20260802-1014\ antes de agir.
Rode o preflight Git.

Restrições: fixture congelada, sem db push, sem build, migrations aditivas,
versão fica em 1.3.4, cutover NÃO ativado, autoria Git exclusiva do
proprietário e sem menção a IA.
```
