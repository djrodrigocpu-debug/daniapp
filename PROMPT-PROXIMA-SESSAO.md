# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fase 3: Gestão Assistida semanal

Copiar o bloco abaixo para abrir a próxima sessão.

> **Antes de colar:** conferir que a branch `aapex-1.3.5-assisted-management-monthly-audit` aponta
> para `d31e422` e que a árvore está limpa.

---

```
AAPEX 1.3.5 — GESTÃO ASSISTIDA SEMANAL IDEMPOTENTE
CONTINUAÇÃO A PARTIR DA FUNDAÇÃO GLOBAL/REGIONAL

1. NATUREZA DESTA SESSÃO

Nova sessão. Não presuma acesso às conversas anteriores.

As decisões empresariais estão CONSOLIDADAS e são canônicas. A pendência
A-08 foi APROVADA e IMPLEMENTADA: modelo híbrido — catálogo global,
configuração regional versionada e conteúdo exclusivamente regional.
Não reabrir A-08 nem A-09.

Leia, nesta ordem, ANTES de qualquer ação:

  docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md   (A-08, canônico)
  docs/business/AAPEX-135-DECISOES-EMPRESARIAIS.md          (§5 pendências, §6 A-08)
  docs/business/AAPEX-135-MODELO-OPERACIONAL.md             (§2 a semana do GC)
  docs/architecture/AAPEX-135-CONTRATOS-DE-DADOS.md         (§4; §2/§3/§6 SUPERADOS pelo ADR)
  docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md     (Fase 3)
  docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md       (§3, §7.2)
  docs/architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md
  docs/architecture/AAPEX-135-IMPACTO-TECNICO.md

Checkpoint técnico da Fase 1 (leia 05-LIMITACOES-E-RISCOS.md por inteiro):
E:\AACE_Backups\AAPEx-135-FASE-1-FUNDACAO-20260801-2238\

2. PROJETO

C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0
GitHub: djrodrigocpu-debug/daniapp

Estado esperado (VERIFICAR, não presumir):
  branch  aapex-1.3.5-assisted-management-monthly-audit em d31e422
  main    8ffc49a, intacta
  versão  1.3.4 (NÃO fazer bump)
  migrations 0001-0038; PRÓXIMO NÚMERO LIVRE: 0039
  árvore limpa

Staging: qcixfsdyfpankpatbays   Produção: plnbgdabciwygsmnyddy

3. PREFLIGHT OBRIGATÓRIO

  git status
  git branch --show-current
  git rev-parse HEAD
  git log --oneline --decorate -10

Diante de divergência não compreendida: PARE.

Autoria Git exclusiva: djrodrigocpu-debug <djrodrigocpu@gmail.com>
Sem Co-Authored-By, Generated-by, Assisted-by, Claude, Anthropic, AI ou IA
em nenhuma mensagem. Sem amend, rebase, squash, force push, reset --hard.
Sem merge. Sem push de main.

4. PROIBIÇÕES ATIVAS

  - fixture SIM-AAPEX-134-2MESES-20260801-1520 CONGELADA: nenhuma mutação,
    nenhuma consulta, não usar como ambiente de desenvolvimento;
  - nenhum db push em staging ou produção; migrations 0036-0038 seguem
    aplicadas APENAS localmente (PGlite);
  - nenhum build distribuído;
  - migrations ADITIVAS apenas: nenhum UPDATE/DELETE retroativo em
    evaluations, official_snapshots, evaluation_answers ou audit_logs;
  - NÃO corrigir O-05, O-14, O-15, AuthModeBanner nem o logout dos GCs;
  - NÃO executar o backfill do catálogo legado (risco RF1-01);
  - desenvolvimento LOCAL (esta máquina não tem Docker).

5. O QUE JÁ EXISTE E VOCÊ VAI USAR

Migrations 0036-0038, todas locais:

  themes / theme_versions                              escopo global|regional
  indicator_definitions.scope_kind, .region_id         escopo do indicador
  indicator_versions.name/.description/.status/
    .effective_to/.created_by                          semântica versionada
  indicator_regional_configs                           adoção (região, indicador)
  indicator_regional_config_versions                   tema, meta, tolerância,
                                                       peso, ordem, ativo e as
                                                       DUAS flags de módulo
  audit_criteria / audit_criteria_versions             critérios por região

  app.scope_kind, app.catalog_status                   enums
  app.reaches_region(uuid)                             alcance de leitura
  app.can_manage_catalog(uuid)                         autoridade de escrita

  RPCs: catalog_create_theme · catalog_add_theme_version ·
        catalog_publish_theme_version · catalog_set_theme_lifecycle ·
        catalog_create_indicator · catalog_add_indicator_version ·
        catalog_publish_indicator_version · catalog_set_indicator_lifecycle ·
        catalog_save_regional_config_draft ·
        catalog_publish_regional_config_version ·
        catalog_create_criterion · catalog_add_criterion_version ·
        catalog_publish_criterion_version · catalog_set_criterion_lifecycle

Domínio: src/domain/catalog/{types,policy}.ts
Repositório: src/domain/repositories/catalog.ts +
             src/data/repositories/CatalogRepository.ts
UI: src/screens/admin/CatalogSection.tsx (aba "Catálogo regional")
Testes: src/db/catalog_*.integration.test.ts (78 casos) e
        src/domain/catalog/policy.test.ts

ATENÇÃO — DE ONDE VEM A META. Não é de indicator_versions. É da versão
PUBLICADA e VIGENTE de indicator_regional_config_versions, da região da
operação. indicator_versions.target/yellow_tolerance/weight continuam
existindo por compatibilidade e NÃO são fonte de verdade (ADR §4, D-D).

6. O QUE ENTREGAR: FASE 3 — GESTÃO ASSISTIDA SEMANAL

Migrations a partir de 0039:

  - enums app.assisted_cycle_status (draft|closed) e
    app.assisted_status (conforme|atencao|nao_conforme|sem_dado);
  - assisted_cycles com UNIQUE (operation_id, week_start_date) e CHECK de
    segunda-feira — idempotência no BANCO, não no cliente (fecha O-06);
  - assisted_cycle_entries com os 16 campos de D1, com meta, tolerância,
    unidade, direção, orientação, peso e tema COPIADOS no ato do registro,
    lidos da configuração regional vigente;
  - app.assisted_status_of(direction, target, tolerance, actual), com
    target_band FALHANDO EXPLICITAMENTE (A-01 continua aberta);
  - rule_version materializada no fechamento;
  - guarda de desvio: fechar com atenção ou não conforme sem diagnóstico,
    plano, responsável e prazo é RECUSADO;
  - RPCs open_assisted_cycle (idempotente), save_assisted_entry,
    close_assisted_cycle, get_assisted_cycle;
  - RLS forçada, revoke de anon e PUBLIC, escrita só por RPC.

Só entram no ciclo os indicadores com configuração regional PUBLICADA,
VIGENTE, ativa e include_in_assisted_management = true, da região da
operação. Um indicador sem configuração regional NÃO entra — existir no
catálogo não ativa nada (ADR §4, D-G).

CRITÉRIO DE SAÍDA (todos verificáveis localmente):
  [ ] dois ciclos na mesma semana para o mesmo parceiro -> recusa do servidor;
  [ ] open_assisted_cycle idempotente: reabrir devolve o MESMO ciclo;
  [ ] week_start_date é sempre segunda, em America/Sao_Paulo;
  [ ] status calculado server-side, conferindo com a tabela de D2;
  [ ] target_band -> falha explícita, nunca comportamento inventado;
  [ ] fechar com desvio sem diagnóstico/plano/responsável/prazo -> recusado;
  [ ] alterar a meta na configuração regional DEPOIS do fechamento NÃO muda
      o status histórico;
  [ ] sem_dado distinto de não conformidade;
  [ ] GC abre ciclo só nos próprios parceiros; ADMIN, REGIONAL e
      COORDENADOR consultam mas não executam (Matriz §3);
  [ ] indicador de região diferente da operação NÃO entra no ciclo;
  [ ] anon e PUBLIC sem grants nas tabelas novas; RLS forçada.

7. INVARIANTES QUE NÃO PODEM QUEBRAR

  - 1488 testes atuais verdes (suíte completa);
  - 18 testes negativos originais verdes;
  - 40/40 códigos de integridade determinísticos e distintos;
  - zero vazamento de escopo nos quatro papéis;
  - trilha imutável; anti-auto-validação; overdue derivado da data;
  - RLS forçada em TODAS as tabelas; gatilhos habilitados ao final;
  - typecheck limpo; export web sem erro.

8. LIMITE DA SESSÃO

Implemente SOMENTE a Gestão Assistida semanal. NÃO iniciar Auditoria
Mensal operacional, planos com origem, cutover, ponderação, Dashboard,
Matriz, exportação nem PDF novo.

Reserve contexto para testes, documentação, checkpoint e prompt de
retomada. Diante de contexto insuficiente: concluir a menor unidade
íntegra, não deixar migration pela metade, registrar NO-GO para o resto.

9. REGISTRO

Registre cada etapa concluída em 14-WORKLOG-APPEND-ONLY.md do checkpoint
operacional (E:\AACE_Backups\AAPEx-MEMORIA-OPERACIONAL\...), a cada
etapa e nunca só no fim (lição L-01).
```

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 3 (Gestão Assistida semanal idempotente).

A Fase 1 está pronta: migrations 0036-0038 criaram o catálogo com escopo
global/regional e a configuração operacional regional versionada. A-08 e
A-09 estão RESOLVIDAS (docs/architecture/ADR-135-001). Próximo número de
migration livre: 0039. Branch em d31e422, main intacta em 8ffc49a.

A meta NÃO vem de indicator_versions: vem da versão publicada e vigente
de indicator_regional_config_versions da região da operação.

Leia os oito documentos 1.3.5 e o checkpoint
E:\AACE_Backups\AAPEx-135-FASE-1-FUNDACAO-20260801-2238\ antes de agir.
Rode o preflight Git.

Restrições: fixture congelada, sem db push, sem build, migrations
aditivas, versão fica em 1.3.4, autoria Git exclusiva do proprietário e
sem menção a IA.
```
