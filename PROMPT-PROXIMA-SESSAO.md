# PROMPT PARA A PRÓXIMA SESSÃO — AAPEx 1.3.5, Fundação Técnica

Copiar o bloco abaixo para abrir a próxima sessão.

> **Antes de colar:** confira se a branch `aapex-1.3.5-assisted-management-monthly-audit` ainda
> aponta para o commit documental desta sessão e se a árvore está limpa.

---

```
AAPEX 1.3.5 — FUNDAÇÃO TÉCNICA: TEMAS E INDICADORES VERSIONADOS
CONTINUAÇÃO A PARTIR DA CONSOLIDAÇÃO DOCUMENTAL

1. NATUREZA DESTA SESSÃO

Nova sessão. Não presuma acesso às conversas anteriores.

As decisões empresariais JÁ ESTÃO CONSOLIDADAS e são canônicas. Não as
reinterprete e não peça reenvio de prompts anteriores.

Leia, nesta ordem, ANTES de qualquer ação:

  docs/business/AAPEX-135-DECISOES-EMPRESARIAIS.md      (canônico; §5 = pendências)
  docs/business/AAPEX-135-MODELO-OPERACIONAL.md
  docs/architecture/AAPEX-135-CONTRATOS-DE-DADOS.md     (modelo proposto)
  docs/architecture/AAPEX-135-PLANO-DE-IMPLEMENTACAO.md (fases e critérios de saída)
  docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md
  docs/architecture/AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md
  docs/architecture/AAPEX-135-IMPACTO-TECNICO.md

Memória operacional durável (achados, lições, provas):
E:\AACE_Backups\AAPEx-MEMORIA-OPERACIONAL\
SIM-AAPEX-134-2MESES-20260801-1520-DECISOES-EMPRESARIAIS-20260801-1711\

2. PROJETO

C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0
GitHub: djrodrigocpu-debug/daniapp

Estado esperado (VERIFICAR, não presumir):
  branch  aapex-1.3.5-assisted-management-monthly-audit
  main    8ffc49a, intacta
  versão  1.3.4 (NÃO fazer bump)
  migrations 0001–0035; PRÓXIMO NÚMERO LIVRE: 0036
  árvore limpa

Staging: qcixfsdyfpankpatbays   Produção: plnbgdabciwygsmnyddy

3. PREFLIGHT OBRIGATÓRIO

  git status
  git branch --show-current
  git rev-parse HEAD
  git log --oneline --decorate -15

Diante de divergência não compreendida: PARE.

Autoria Git exclusiva: djrodrigocpu-debug <djrodrigocpu@gmail.com>
Não inserir Co-Authored-By, Generated-by, Assisted-by, Claude, Anthropic,
AI ou IA em nenhuma mensagem de commit.
Não usar amend, rebase, squash, force push, reset --hard.
Não fazer merge. Não fazer push de main.

4. PROIBIÇÕES ATIVAS

  - fixture SIM-AAPEX-134-2MESES-20260801-1520 CONGELADA: nenhuma mutação,
    nenhuma consulta nova, não usar como ambiente de desenvolvimento, não
    trocar a interface servida em localhost:8100 (a revisão precisa
    continuar vendo a 1.3.4);
  - nenhum db push em staging ou produção;
  - nenhum build distribuído;
  - migrations ADITIVAS apenas: nenhum UPDATE/DELETE retroativo em
    evaluations, official_snapshots, evaluation_answers ou audit_logs;
  - NÃO corrigir O-05, O-14, O-15, AuthModeBanner nem o logout dos GCs;
  - desenvolvimento LOCAL (PGlite; esta máquina não tem Docker).

5. BLOQUEIO DE ENTRADA — RESOLVER ANTES DE ESCREVER MIGRATION

A-08: temas e indicadores são GLOBAIS ou POR REGIÃO?

A decisão D7 dá ao Gerente Regional gestão "dentro da própria região", mas
temas e indicadores NÃO têm região no modelo. Se forem globais, um regional
editando afeta todas as regiões — o contrário do que D7 determina.

Duas saídas possíveis, NENHUMA decidida:
  (a) themes e indicator_definitions ganham region_id anulável, onde nulo =
      global e só ADMIN edita;
  (b) a autoridade regional recai apenas sobre critérios e ponderação, e o
      catálogo de indicadores permanece global.

Isso muda a migration 0036/0037 estruturalmente e precisa entrar JÁ, não
depois. Pergunte ao proprietário e só então escreva.

Detalhe em docs/architecture/AAPEX-135-MATRIZ-DE-PERMISSOES.md §7.3.

6. O QUE ENTREGAR: FASE 1 — FUNDAÇÃO DO CATÁLOGO

Migrations 0036–0037:
  - themes + theme_versions (nome na VERSÃO, para preservar o histórico);
  - indicator_versions ganha theme_version_id, orientation, description,
    include_in_assisted_management (default true) e
    include_in_monthly_audit (default false);
  - guardas de exclusão com histórico, no padrão de app.guard_indicator_delete;
  - RLS habilitada E FORÇADA; revoke explícito de anon (mitiga O-10 na
    superfície nova);
  - RPCs admin_create_theme, admin_add_theme_version, admin_deactivate_theme;
  - projeção ui_indicators estendida.

CRITÉRIO DE SAÍDA (todos verificáveis localmente):
  [ ] criar, versionar, reordenar e inativar tema;
  [ ] excluir tema com histórico -> RECUSADO por gatilho;
  [ ] nova versão de indicador NÃO altera ciclo fechado nem auditoria aprovada;
  [ ] defaults corretos das duas flags;
  [ ] tabelas novas: RLS forçada, anon sem grants;
  [ ] testes negativos 19, 20, 21, 22, 25, 26 verdes (ver Matriz de Permissões §8);
  [ ] 40 códigos de integridade reproduzidos IDÊNTICOS.

7. INVARIANTES QUE NÃO PODEM QUEBRAR EM NENHUMA FASE

  - 18 testes negativos originais verdes;
  - 40/40 códigos de integridade determinísticos e distintos;
  - zero vazamento de escopo nos quatro papéis;
  - trilha imutável (403 no delete);
  - anti-auto-validação; overdue derivado da data;
  - RLS forçada; gatilhos habilitados ao final.

8. REGISTRO

Registre cada etapa concluída em 14-WORKLOG-APPEND-ONLY.md do checkpoint,
a cada etapa e nunca só no fim (lição L-01: o driver da simulação perdeu o
próprio progresso por gravar manifesto apenas no encerramento).
```

---

## Variante curta

```
Continue a AAPEx 1.3.5 — Fase 1 (fundação do catálogo: temas e indicadores
versionados).

Decisões canônicas em docs/business/ e docs/architecture/ (sete documentos
AAPEX-135-*). Leia-os antes de agir. Rode o preflight Git.

BLOQUEIO A-08: temas e indicadores são globais ou por região? Sem essa
decisão a migration 0036/0037 não pode ser escrita — pergunte primeiro.

Restrições: fixture congelada, sem db push, sem build, migrations aditivas,
versão fica em 1.3.4, autoria Git exclusiva do proprietário e sem menção a IA.

Anote o progresso em 14-WORKLOG-APPEND-ONLY.md.
```
