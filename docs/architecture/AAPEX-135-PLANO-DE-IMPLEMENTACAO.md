# AAPEx 1.3.5 — Plano de Implementação

**Status:** plano · **nenhuma linha de código funcional escrita**
**Data:** 01/08/2026 · branch `aapex-1.3.5-assisted-management-monthly-audit` · base `8ffc49a`
**Fonte canônica:** [Decisões Empresariais](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) · [Contratos de Dados](AAPEX-135-CONTRATOS-DE-DADOS.md) · [Migração](AAPEX-135-MIGRACAO-E-COMPATIBILIDADE.md)

---

## 1. Restrições permanentes

Valem em **todas** as fases:

| ⛔ | Restrição |
|---|---|
| Fixture | `SIM-AAPEX-134-2MESES-20260801-1520` **congelada**. Nada de mutação, nada de usar como ambiente de desenvolvimento, nada de trocar a interface em `localhost:8100` — a revisão precisa continuar vendo a **1.3.4** |
| Ambientes | **Sem `db push`** em staging ou produção. Desenvolvimento **local** (PGlite) |
| Build | **Nenhum build distribuído** antes da homologação |
| Migrations | **Aditivas.** Nenhum `UPDATE`/`DELETE` retroativo |
| Versão | permanece **1.3.4**. Bump para 1.3.5 só na homologação. **1.4.0** e **2.0.0** reservadas |
| Git | autoria exclusiva `djrodrigocpu-debug <djrodrigocpu@gmail.com>`; **sem menção a IA**; sem `amend`/`rebase`/`squash`/`force push`/`reset --hard`; **sem merge**; **sem push de `main`** |
| Achados | **O-05, O-14, O-15**, `AuthModeBanner` e logout dos GCs **não são corrigidos** |

## 2. Fases

Cada fase tem **critério de saída verificável**. Fase sem critério cumprido não libera a seguinte.

---

### Fase 0 — Consolidação documental ✅ **CONCLUÍDA**

Sete documentos produzidos, revisados entre si, commitados. Nenhum código.

**Saída:** ✅ documentos versionados · ✅ pendências nomeadas · ✅ fixture/staging/produção intactos.

---

### Fase 1 — Fundação do catálogo: temas e indicadores versionados 🔜 **PRÓXIMA**

**Por que primeiro:** tudo depende do catálogo. `assisted_cycle_entries` referencia
`indicator_versions` **e** `theme_version_id`; critérios pendem de indicador; a Auditoria Mensal
seleciona por `include_in_monthly_audit`. Começar por qualquer outro ponto cria dependência
reversa.

**Entrega:** migrations 0036–0037 · `themes` + `theme_versions` · 5 colunas em
`indicator_versions` · guardas de exclusão com histórico · RLS forçada e `revoke` de `anon` · RPCs
`admin_create_theme`, `admin_add_theme_version`, `admin_deactivate_theme` · projeção `ui_indicators`
estendida.

**Critério de saída**
- [ ] criar, versionar, reordenar e inativar tema — provado local;
- [ ] excluir tema com histórico → **recusado por gatilho**;
- [ ] nova versão de indicador **não altera** ciclo fechado nem auditoria aprovada;
- [ ] defaults corretos: `include_in_assisted_management = true`, `include_in_monthly_audit = false`;
- [ ] tabelas novas com RLS **forçada** e `anon` **sem grants** (mitiga O-10 na superfície nova);
- [ ] testes negativos **19, 20, 21, 22, 25, 26** verdes;
- [ ] **40 códigos de integridade reproduzidos idênticos**.

> ⚠️ **Bloqueio de entrada:** pendência **A-08** — temas e indicadores são globais ou por região?
> Sem isso, *“gestão dentro da própria região”* (D7) não é implementável. Ver §4.

---

### Fase 2 — Critérios de processo

**Entrega:** migration 0038 · `audit_criteria` + `audit_criteria_versions` · guarda “não publicar
indicador auditável sem critério ativo” · RPCs de gestão de critério.

**Critério de saída**
- [ ] critério criado, versionado, com os dez campos de D4;
- [ ] marcar `include_in_monthly_audit = true` sem critério ativo → **recusado**;
- [ ] `audit_items` **intacto**; nenhuma conversão automática;
- [ ] nenhum critério gerado a partir do nome do indicador;
- [ ] teste negativo **27** verde.

---

### Fase 3 — Gestão Assistida: núcleo e regra de status

**Entrega:** migrations 0039–0040 · enums novos · `assisted_cycles` com **unique
`(operation_id, week_start_date)`** · `assisted_cycle_entries` com os 16 campos ·
`app.assisted_status_of(...)` · materialização de `rule_version` · guarda de desvio no fechamento ·
RPCs `open_assisted_cycle`, `save_assisted_entry`, `close_assisted_cycle`.

**Critério de saída**
- [ ] dois ciclos na mesma semana para o mesmo parceiro → **recusa do servidor** (teste 28);
- [ ] `open_assisted_cycle` **idempotente**: reabrir devolve o mesmo ciclo;
- [ ] `week_start_date` é sempre segunda, em `America/Sao_Paulo`;
- [ ] status calculado **server-side**, conferindo com a tabela de D2;
- [ ] `target_band` → **falha explícita**, nunca comportamento inventado (A-01);
- [ ] fechar com desvio sem diagnóstico/plano/responsável/prazo → **recusado** (teste 29);
- [ ] alterar meta depois do fechamento **não muda** o status histórico;
- [ ] `sem_dado` distinto de não conformidade;
- [ ] teste negativo **30** verde.

---

### Fase 4 — Planos: origem com integridade referencial

**Entrega:** migration 0041 · `assisted_entry_id`, `monthly_audit_id`, `source` + CHECK ·
`save_action_plan` estendida.

**Critério de saída**
- [ ] `source` inconsistente com as FKs → **recusado pelo CHECK** (teste 6 de migração);
- [ ] planos existentes com `source = 'legacy'` **por default**, sem `UPDATE` semântico;
- [ ] os 6 estados de D6 preservados; anti-auto-validação intacta;
- [ ] `overdue` segue derivado; gravação manual recusada (teste 36);
- [ ] **teste dirigido do O-11**: plano em `completed`, criador tenta validar → recusa **por regra de
      ator**, não por máquina de estados (teste 31).

---

### Fase 5 — Auditoria Mensal por competência

**Entrega:** migration 0042 · `start_monthly_audit(operation_id, competence)` com **período por
parâmetro** · `evaluation_criteria` + materialização · guarda de imutabilidade.

**Critério de saída**
- [ ] **auditoria de competência passada registrável pelo caminho oficial — fecha o O-06**;
- [ ] uma auditoria oficial por parceiro por competência;
- [ ] só entram indicadores com `include_in_monthly_audit = true`;
- [ ] critérios **materializados** na criação; alterar catálogo depois **não muda** a auditoria
      (teste 32);
- [ ] aprovação gera snapshot imutável;
- [ ] **40 códigos de integridade idênticos** — auditorias sem critérios materializados percorrem o
      caminho antigo **sem desvio**.

---

### Fase 6 — Autorização server-side com escopo regional

**Entrega:** `app.can_manage_catalog(target_region_id)` · aplicação em todas as RPCs de catálogo ·
bateria de testes negativos ampliada.

**Critério de saída**
- [ ] **testes negativos 19–36 todos verdes**, com mensagem literal do servidor registrada;
- [ ] ordem de verificação respeitada: ator → papel → escopo → estado → efeito;
- [ ] regional editando fora da própria região → **fora do escopo** (testes 23, 24);
- [ ] zero vazamento de escopo nos quatro papéis;
- [ ] **os 18 testes originais continuam verdes**.

---

### Fase 7 — Cutover parametrizável (criado, **não ativado**)

**Entrega:** migration 0043 · `system_settings` · `weekly_audit_cutover_date = null` · guarda
**inerte** em `start_evaluation`.

**Critério de saída**
- [ ] com data nula, `start_evaluation` **bit a bit idêntico** ao atual (teste 7);
- [ ] com data preenchida e vencida, `weekly` recusado;
- [ ] **cutover permanece DESATIVADO** ao fim da fase.

---

### Fase 8 — Ponderação, Dashboard e Matriz

**Entrega:** migrations 0044–0045 · `region_weightings` com CHECK `soma = 100`, **sem semente** ·
`get_dashboard_aggregates` · Matriz com eixos renomeados.

**Critério de saída**
- [ ] sem ponderação configurada → dois eixos + **“Ponderação não configurada”**, **sem** índice;
- [ ] pesos que não somam 100 → recusados;
- [ ] módulo ausente → dados insuficientes, **sem renormalizar**;
- [ ] cinco quadrantes preservados;
- [ ] agregações **server-side**, respeitando escopo;
- [ ] **cada gráfico com alternativa tabular acessível**.

---

### Fase 9 — Exportação CSV/XLSX

**Entrega:** `export_dataset(modulo, filtros)` · CSV e XLSX · cinco abas.

**Critério de saída**
- [ ] quatro módulos exportáveis com os oito filtros;
- [ ] abas exatas: `Gestao_Assistida`, `Auditoria_Mensal`, `Planos`, `Resumo`, `Filtros_Aplicados`;
- [ ] **CSV injection neutralizada** em `=` `+` `-` `@` (teste 10);
- [ ] **sem fórmulas** no XLSX; números e datas como tipos próprios;
- [ ] escopo e filtros **server-side**; exportar não contorna a RLS (testes 11, 35).

---

### Fase 10 — Interface, navegação e acessibilidade

**Entrega:** telas de Gestão Assistida e administração de catálogo · separação visual **legado ·
Gestão Assistida · Auditoria Mensal** · ação **“Ver auditoria”** · exportação · terminologia D8.

**Critério de saída**
- [ ] **O-12 fechado**: auditoria aprovada acessível, com `Pressable`, role apropriado, teclado,
      foco, leitor de tela, e acesso a snapshot, respostas, evidências, planos e PDF;
- [ ] **teste de UI: todo ciclo listado tem rota de abertura**;
- [ ] nenhum controle novo sem `role="button"` + `tabindex` (não repetir o O-13);
- [ ] os três blocos visualmente distintos;
- [ ] terminologia D8 aplicada em toda a interface.

---

### Fase 11 — Homologação e versionamento

**Entrega:** bump para **1.3.5** · documentação canônica, **incluindo o débito da 1.3.4** ·
homologação.

**Critério de saída**
- [ ] fases 1–10 com critérios cumpridos;
- [ ] **decisão nominal dos quatro drafts de produção** (A-03);
- [ ] pendências A-01, A-02, A-04, A-05 resolvidas ou conscientemente adiadas;
- [ ] fixture aprovada e liberada, **ou** ambiente de homologação separado;
- [ ] só então: bump, build, publicação.

---

## 3. Dependências

```
Fase 1 (catálogo)
  ├─> Fase 2 (critérios) ──> Fase 5 (auditoria mensal)
  └─> Fase 3 (gestão assistida) ──> Fase 4 (planos)
                                      │
        Fases 2,3,4,5 ────> Fase 6 (autorização)
                                      │
                              Fase 7 (cutover)
                                      │
                     Fases 8, 9 (dashboard, exportação)
                                      │
                              Fase 10 (interface)
                                      │
                              Fase 11 (homologação)
```

**Caminho crítico:** 1 → 2 → 5. Fases 3 e 4 correm em paralelo a 2. **Fase 6 exige 2, 3, 4 e 5
prontas** — autorização se aplica sobre superfície existente.

## 4. Bloqueios de entrada

| # | Bloqueio | Bloqueia | Como sair |
|---|---|---|---|
| **A-08** | Temas e indicadores são globais ou por região? | **Fase 1** e **Fase 6** | Decisão do proprietário. Sem ela, D7 não é implementável para o regional |
| **A-01** | Regra de status para `target_band` | Fase 3 (parcial) | Fase 3 pode entregar com falha explícita; a regra fica pendente |
| **A-04** | Pesos por região | Fase 8 (parcial) | Fase 8 entrega o mecanismo; sem pesos, “Ponderação não configurada” |
| **A-03** | Decisão nominal dos 4 drafts de produção | Ativação do cutover | Decisão individual, registrada na trilha |
| **A-02** | Data de cutover | Ativação | Estrutura pronta na Fase 7, desativada |
| **A-05** | Nova `REPORT_FORMAT_VERSION` | Novo formato de PDF | 1.3.3 permanece para o histórico |
| **Fixture** | Congelada | Homologação remota | Frase de liberação do proprietário |

> **A-08 é o único bloqueio que impede começar.** Os demais permitem entregar com o comportamento
> conservador já especificado.

## 5. Testes por fase

Cada fase entrega **teste positivo**, **teste negativo** e **teste de não-regressão**.

Invariantes verificados **em toda fase**:

1. **40 códigos de integridade idênticos**;
2. **18 testes negativos originais verdes**;
3. RLS forçada; `anon` sem grants nas tabelas novas;
4. gatilhos habilitados ao final;
5. nenhum `UPDATE`/`DELETE` retroativo em tabela histórica;
6. `overdue` derivado; anti-auto-validação intacta.

## 6. Commits

Pequenos, coerentes, um assunto cada. Prefixos: `docs:`, `feat:`, `fix:`, `test:`, `chore:`.

**Autoria exclusiva** `djrodrigocpu-debug <djrodrigocpu@gmail.com>`. **Nenhuma menção a IA** em
mensagem alguma. Sem merge, sem push de `main`, sem reescrita de histórico.

**Registrar cada fase concluída no worklog append-only do checkpoint** — a cada etapa, nunca só no
fim (lição L-01).
