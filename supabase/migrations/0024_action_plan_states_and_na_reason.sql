-- ===========================================================================
-- 0024 — ESTADOS PERSISTENTES DO PLANO DE AÇÃO + JUSTIFICATIVA DE NÃO APLICÁVEL
-- (Parte 1 de 2 — apenas tipos e colunas. As funções que USAM os valores novos
--  estão na 0025: o PostgreSQL proíbe referenciar um valor de enum na mesma
--  transação em que ele foi adicionado, e cada migration roda em uma transação.)
--
-- POR QUE ESTA MIGRATION EXISTE. O Manual do Gerente de Canal é normativo e
-- descreve sete estados humanos para o plano de ação; o banco só distinguia
-- seis (open/in_progress/blocked/done/overdue/cancelled_justified) e a tradução
-- da 0004 colapsava dois pares:
--
--   * "Aguardando parceiro" E "Aguardando área interna" -> blocked
--   * "Concluído" E "Validado"                          -> done
--
-- Resultado observado: o estado escolhido na tela não sobrevivia ao F5 —
-- "Aguardando parceiro" voltava como "Aguardando área interna" e "Validado"
-- voltava como "Concluído". A decisão do proprietário é corrigir o APP para
-- obedecer ao manual, não reescrever o manual.
--
-- MAPEAMENTO AUTORIZADO (0025 aplica):
--   not_started <-> open            | in_progress <-> in_progress
--   waiting_partner <-> waiting_partner (valor NOVO)
--   waiting_internal <-> blocked    (compatibilidade: legado preservado)
--   completed <-> done              | validated <-> validated (valor NOVO)
--   overdue continua derivado da data — nunca escolha manual.
--
-- REGISTROS HISTÓRICOS: nenhum UPDATE de dados aqui. 'blocked' permanece
-- "Aguardando área interna" e 'done' permanece "Concluído" — done NÃO vira
-- validated, porque validação é um fato real (validador + data), não inferência.
-- ===========================================================================

alter type app.action_status add value if not exists 'waiting_partner';
alter type app.action_status add value if not exists 'validated';

-- Trilha auditável da validação segregada (§7.8 do manual): quem validou e
-- quando. Preenchida SOMENTE pela transição done -> validated (0025).
alter table public.action_plans
  add column if not exists validated_by uuid references public.users(id),
  add column if not exists validated_at timestamptz;

-- Justificativa obrigatória do "Não aplicável" (governança da Correção B).
-- Campo próprio: `observation` já carrega a análise do gerente de canal e
-- reutilizá-lo conflitaria com essa finalidade. NOT NULL com default '' para
-- não reinterpretar rascunhos existentes; o portão de envio (0025) é quem
-- exige conteúdo útil.
alter table public.evaluation_answers
  add column if not exists not_applicable_reason text not null default '';
