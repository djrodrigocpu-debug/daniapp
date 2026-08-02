# AAPEx 1.3.5 — Matriz de Permissões

**Status:** especificação · **nenhum código escrito**
**Data:** 01/08/2026
**Fonte canônica:** [Decisões Empresariais](../business/AAPEX-135-DECISOES-EMPRESARIAIS.md) §D7

> **Autorização obrigatoriamente server-side. A interface não é barreira de segurança.**

---

## 1. Papéis

`app.role_code` já existe com exatamente os quatro papéis exigidos por D7:

```
admin · regional · coordinator · channel_manager
```

**Nenhum papel novo é criado.** O que muda é a **autoridade do `regional`**: hoje as RPCs de
catálogo são *admin-only*; D7 concede ao Gerente Regional gestão **dentro da própria região**.

### Como o escopo se resolve hoje

`user_scopes` (`user_id`, `role`, `region_id`, `coordination_id`, `unit_id`, `valid_from`,
`valid_to`, `active`) e as funções `app.has_role`, `app.is_admin`, `app.resolve_area_scope`,
`app.scoped_region_ids`, `app.scoped_coordination_ids`, `app.has_operation_access`.

> ⚠️ **Pendência A-07:** confirmar que a autoridade regional se resolve **apenas** por
> `user_scopes.region_id`. Se um regional puder ter mais de uma região, `scoped_region_ids` já
> devolve conjunto — mas a regra de negócio não foi declarada.

## 2. Matriz — catálogo

| Ação | ADMIN | REGIONAL | COORDENADOR | GC |
|---|---|---|---|---|
| Criar tema | ✅ global | ✅ **na própria região** | ❌ | ❌ |
| Editar tema (nova versão) | ✅ global | ✅ na própria região | ❌ | ❌ |
| Reordenar temas | ✅ global | ✅ na própria região | ❌ | ❌ |
| Inativar tema | ✅ global | ✅ na própria região | ❌ | ❌ |
| **Excluir tema com histórico** | ❌ | ❌ | ❌ | ❌ |
| Criar indicador | ✅ global | ✅ na própria região | ❌ | ❌ |
| Editar indicador (nova versão) | ✅ global | ✅ na própria região | ❌ | ❌ |
| Definir meta / tolerância / peso | ✅ global | ✅ na própria região | ❌ | ❌ |
| Marcar `include_in_monthly_audit` | ✅ global | ✅ na própria região | ❌ | ❌ |
| Inativar indicador | ✅ global | ✅ na própria região | ❌ | ❌ |
| **Excluir indicador com histórico** | ❌ | ❌ | ❌ | ❌ |
| Criar/editar critério (nova versão) | ✅ global | ✅ na própria região | ❌ | ❌ |
| Configurar ponderação regional | ✅ global | ✅ **da própria região** | ❌ | ❌ |

> **Nenhum papel exclui destrutivamente objeto com histórico** — nem o ADMIN. Não é permissão: é
> invariante do modelo (D3).

## 3. Matriz — Gestão Assistida

| Ação | ADMIN | REGIONAL | COORDENADOR | GC |
|---|---|---|---|---|
| Abrir ciclo semanal | ❌¹ | ❌¹ | ❌¹ | ✅ **seus parceiros** |
| Registrar valor realizado | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Registrar diagnóstico | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Criar plano, responsável, prazo | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Fechar ciclo | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| **Editar meta durante o registro** | ❌ | ❌ | ❌ | ❌ |
| Consultar ciclos | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| Exportar | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |

¹ *A execução é do GC responsável pelo parceiro. Se a operação exigir que outro papel registre em
nome do GC, isso é regra de negócio ainda não declarada — não presumir.*

> ✅ **IMPLEMENTADO em 01/08/2026** (migrations 0039–0041). A execução é guardada por
> `app.is_assisted_operator(operation_id)`: exige o papel `channel_manager` **e** vínculo com aquela
> operação. A leitura usa `app.has_operation_access`, que é o alcance da linha *"Consultar ciclos"*.
>
> **`app.is_admin()` NÃO é atalho aqui, e isso é testado.** Um administrador que tente abrir,
> registrar ou fechar recebe *"apenas o gerente de canal responsavel executa a Gestao Assistida"* —
> a mesma recusa que um coordenador ou um regional. É a leitura literal da nota ¹: ter permissão
> administrativa não é ser o responsável operacional pelo parceiro.
>
> **A escrita direta não existe:** as tabelas novas não têm policy de `INSERT`/`UPDATE`/`DELETE`, e
> `authenticated` só recebe `SELECT`. Toda escrita passa por RPC `security definer`.

**O GC não edita metas, temas ou definições.** Ele consome o catálogo; não o altera.

## 4. Matriz — Auditoria Mensal

| Ação | ADMIN | REGIONAL | COORDENADOR | GC |
|---|---|---|---|---|
| Criar auditoria da competência | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Responder critérios | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Anexar evidência | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Marcar N/A com justificativa | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Enviar para validação | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| **Validar / aprovar** | ✅ | ✅ região | ✅ **coordenação** | ❌ |
| Devolver | ✅ | ✅ região | ✅ coordenação | ❌ |
| Consultar aprovada + PDF | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| **Alterar snapshot aprovado** | ❌ | ❌ | ❌ | ❌ |
| **Alterar critérios materializados** | ❌ | ❌ | ❌ | ❌ |

Os dois últimos são **imutáveis por gatilho**, não por permissão. Já provado: alterar snapshot pelo
PostgREST devolve `42501`.

## 5. Matriz — planos de ação

| Ação | ADMIN | REGIONAL | COORDENADOR | GC |
|---|---|---|---|---|
| Criar plano | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| Atualizar status | ❌¹ | ❌¹ | ❌¹ | ✅ seus parceiros |
| **Validar plano concluído** | ✅ | ✅ região | ✅ coordenação | ⚠️ **nunca o próprio criador** |
| Consultar / exportar | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| **Gravar `overdue` manualmente** | ❌ | ❌ | ❌ | ❌ |

**Anti-auto-validação preservada:** `validated_by ≠ criador`, via `app.can_validate`.

> ✅ **Achado O-11 FECHADO em 02/08/2026.** O teste dirigido levou o plano até `done` — estado a
> partir do qual `app.action_transition_allowed('done','validated')` devolve **verdadeiro**, o que
> o teste também afirma — e só então tentou validar. A recusa veio da **regra de ator**:
> *"apenas coordenacao, regional ou administracao registram validado"*. Um coordenador que **criou**
> o plano recebe *"quem criou o plano nao pode valida-lo"*, e um coordenador que não o criou
> **valida com sucesso**. Nenhuma regra foi enfraquecida para o teste passar.
> `src/db/monthly_audit.integration.test.ts`.

`overdue` é **derivado da data**; gravação manual já é recusada.

## 6. Matriz — dashboard, matriz e exportação

| Ação | ADMIN | REGIONAL | COORDENADOR | GC |
|---|---|---|---|---|
| Dashboard | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| Matriz de desempenho | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| Exportar Gestão Assistida | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| Exportar Auditoria Mensal | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| Exportar Planos | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |
| Exportar Resumo | ✅ global | ✅ região | ✅ coordenação | ✅ seus parceiros |

> **O escopo do arquivo exportado é resolvido no servidor.** Um filtro que peça mais do que o papel
> alcança devolve **apenas o permitido** — nunca erro que revele a existência do que ficou de fora.

## 7. Implementação

### 7.1 Onde a regra mora

1. **RLS** — leitura e escrita direta por PostgREST;
2. **RPC `security definer`** — verificação de papel e escopo **antes** de qualquer efeito;
3. **Gatilho** — invariantes que não são permissão (imutabilidade, exclusão com histórico,
   anti-auto-validação).

A interface **espelha** a regra para não oferecer o que será recusado. **Nunca é a barreira.**

### 7.2 Ordem de verificação nas RPCs

Padrão já estabelecido em 0031, a ser mantido:

```
1. ator não nulo         -> recusa 'ator nao identificado'
2. papel                 -> recusa 'apenas administrador' / 'sem permissao'
3. escopo                -> recusa 'operacao fora do escopo'
4. estado                -> recusa 'nao esta em rascunho/devolvida'
5. efeito
```

Inverter 2 e 3 vaza existência: *“fora do escopo”* a quem não tinha nem o papel já revela que o
objeto existe.

### 7.3 Autoridade regional — o que é novo

Hoje: `app.is_admin` guarda as RPCs de catálogo. Provado: `admin_create_operation` e
`admin_activate_confirmed_user` devolvem *"apenas administrador"* a não-admins.

Passa a existir um **segundo nível**: `admin OR (regional AND alvo dentro de scoped_region_ids)`.
Função proposta: `app.can_manage_catalog(target_region_id uuid)`.

**Isso é mudança de modelo de autorização, não um `if` a mais.** Cada RPC de catálogo precisa saber
**a que região o objeto pertence** — e temas e indicadores hoje **não têm região**.

> ✅ **A-08 RESOLVIDA em 01/08/2026 — modelo híbrido.** Ver
> [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md). Nem (a) nem (b) isoladas: tema e indicador
> ganham **escopo** (`global` com região nula, administrado só pelo ADMIN; `regional` com região
> obrigatória, administrado pelo ADMIN ou pelo Regional da própria região) **e** toda operação passa
> por uma **configuração regional versionada** — é ela que carrega tema, meta, tolerância, peso,
> ordem, flags de módulo e critérios. Assim `app.can_manage_catalog(target_region_id)` sempre tem a
> que região perguntar: a do objeto regional, ou a da configuração.
>
> Leitura de objeto regional é restrita à própria região por `app.reaches_region(region_id)`.

## 8. Testes negativos obrigatórios

Acrescentam-se aos 18 já existentes, no mesmo formato
(`[RECUSADO] ação / esperado / mensagem literal do servidor`):

| # | Tentativa | Esperado |
|---|---|---|
| 19 | GC cria tema | sem permissão |
| 20 | GC edita meta de indicador | sem permissão |
| 21 | GC marca `include_in_monthly_audit` | sem permissão |
| 22 | Coordenador cria indicador | sem permissão |
| 23 | Regional edita tema **de outra região** | fora do escopo |
| 24 | Regional configura ponderação **de outra região** | fora do escopo |
| 25 | Excluir tema com histórico | recusado por gatilho |
| 26 | Excluir indicador com histórico | recusado por gatilho |
| 27 | Publicar indicador auditável **sem critério ativo** | recusado |
| ~~28~~ ✅ | Abrir 2º ciclo semanal na mesma semana | recusado pela unicidade — **verde** |
| ~~29~~ ✅ | Fechar ciclo com desvio **sem** diagnóstico/plano | recusado — **verde** |
| ~~30~~ ✅ | GC abre ciclo em parceiro de outro GC | fora do escopo — **verde** |
| ~~31~~ ✅ | GC valida o **próprio** plano concluído | **recusado por regra de ator** — **FECHADO em 02/08/2026** |
| 32 | Alterar critério materializado de auditoria criada | recusado |
| 33 | `anon` em cada RPC nova | HTTP 401 |
| 34 | `anon` em cada tabela nova | conjunto vazio |
| 35 | Exportar fora do escopo | só o permitido |
| 36 | Gravar `overdue` manualmente | recusado |

## 9. Pendências

| # | Pendência |
|---|---|
| **A-07** | A autoridade regional se resolve apenas por `user_scopes.region_id`? A Fase 1 usa `app.scoped_region_ids()`, que já devolve conjunto, e por isso **não depende** da resposta |
| ~~**A-08**~~ ✅ | **Resolvida** — modelo híbrido, [ADR-135-001](ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md) |
| **O-11** | Teste dirigido: plano em `completed`, criador tenta validar |
