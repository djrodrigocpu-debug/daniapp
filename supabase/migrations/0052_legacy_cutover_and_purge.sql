-- ---------------------------------------------------------------------------
-- AAPEX 1.3.5 — Migration 0052: cutover total do modelo legado e expurgo auditado
-- ---------------------------------------------------------------------------
-- Decisão do proprietário em 02/08/2026 (Fase 12-B, opção 4):
--
--   1. desligar imediatamente os checklists legados SEMANAL e MENSAL;
--   2. impedir a abertura de qualquer novo checklist legado;
--   3. limpar as avaliações em rascunho e suas respostas;
--   4. começar com zero dado operacional de avaliação;
--   5. manter a Gestão Assistida disponível e a Auditoria Mensal desligada.
--
-- O QUE ESTA MIGRATION **NÃO** FAZ, DE PROPÓSITO:
--   * não apaga tabela, catálogo, migration nem estrutura histórica;
--   * não apaga NENHUMA linha por conta própria. O expurgo é ato administrativo
--     EXPLÍCITO, por RPC auditada, executado uma vez e sob autorização.
--
-- Por isso ela é segura de aplicar em qualquer ambiente: é estrutural.
--
-- ---------------------------------------------------------------------------
-- POR QUE O CUTOVER PASSA A VALER PARA AS DUAS FREQUÊNCIAS
-- ---------------------------------------------------------------------------
-- A guarda da 0047 só disparava para `weekly`, porque a decisão D5 falava da
-- "Auditoria Semanal". A decisão de 02/08 é mais ampla: o MODELO LEGADO inteiro
-- sai de operação. Um cutover que fechasse só a semanal deixaria o checklist
-- mensal legado aberto — exatamente o botão que também precisa sumir.
--
-- A CHAVE `weekly_audit_cutover_date` É PRESERVADA. Renomeá-la quebraria a
-- semente da 0047, `get_system_settings` e `admin_set_weekly_audit_cutover`.
-- O nome passa a ser HISTÓRICO: a partir daqui ela governa o modelo legado
-- inteiro, e a descrição no próprio banco diz isso.
--
-- ---------------------------------------------------------------------------
-- A CLÁUSULA DE ESCAPE FOI REMOVIDA, E ISSO É DELIBERADO
-- ---------------------------------------------------------------------------
-- A 0047 deixava passar quem já tivesse rascunho aberto, para não orfanar
-- ninguém. Com o expurgo, NÃO EXISTE rascunho — e a exigência agora é
-- "impedir a abertura de QUALQUER novo checklist legado". Manter o escape
-- deixaria uma porta aberta para quem tivesse rascunho, que é justamente o
-- estado que deixa de existir.
--
-- Ordem de verificação preservada da 0047 e do O-16: ator, escopo, e só então
-- a fronteira nova. A delegação continua integral.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. A descrição da chave passa a declarar o alcance novo
-- ---------------------------------------------------------------------------
update public.system_settings
   set description = 'Data a partir da qual nao se cria checklist legado NOVO, '
                  || 'semanal nem mensal. JSON null = modelo legado ATIVO. '
                  || 'Nasceu da pendencia A-02 (0047), restrita a semanal; '
                  || 'A-02 foi decidida em 02/08/2026 e desde a 0052 esta chave '
                  || 'governa o modelo legado inteiro. Nome e historico.'
 where key = 'weekly_audit_cutover_date';

-- ---------------------------------------------------------------------------
-- 2. O wrapper de start_evaluation — agora fecha as duas frequências
-- ---------------------------------------------------------------------------
create or replace function public.start_evaluation(
  p_operation_id uuid, p_frequency text, p_evaluator_id uuid
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  -- Cast no DECLARE, como na 0031 e na 0047: frequência inválida falha ANTES de
  -- tudo, exatamente como sempre falhou.
  v_freq app.visit_type := p_frequency::app.visit_type;
  v_uid  uuid;
  v_cut  date;
begin
  -- (1) ATOR.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) ESCOPO. A fronteira nova nunca fala antes destas duas (O-16).
  if not coalesce(app.has_operation_access(p_operation_id), false) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- (3) CUTOVER DO MODELO LEGADO — as DUAS frequências, sem escape.
  v_cut := app.weekly_audit_cutover_date();
  if v_cut is not null and v_cut <= app.assisted_today() then
    raise exception
      'modelo legado encerrado em %: use a Gestao Assistida (semanal) ou a Auditoria Mensal por criterios',
      to_char(v_cut, 'DD/MM/YYYY')
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (4) DELEGAÇÃO INTEGRAL. Com data nula, o caminho é literalmente o de sempre.
  return app.start_evaluation_legacy(p_operation_id, p_frequency, p_evaluator_id);
end $$;

comment on function public.start_evaluation(uuid, text, uuid) is
  'Wrapper legado. Ator, escopo e cutover do MODELO LEGADO (semanal E mensal) antes de delegar a app.start_evaluation_legacy (0052).';

revoke all on function public.start_evaluation(uuid, text, uuid) from public, anon;
grant execute on function public.start_evaluation(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Expurgo administrativo, auditado e recusável
-- ---------------------------------------------------------------------------
-- Apaga SOMENTE avaliações que nunca produziram resultado oficial. As guardas
-- não são conveniência: `official_snapshots`, `diagnoses` e `validations`
-- referenciam `evaluations` SEM cascade, então uma delas povoada faria o delete
-- estourar no meio. Preferimos recusar ANTES, com a contagem na mensagem.
--
-- `evaluation_answers`, `evidence_files`, `evaluation_criteria` e
-- `evaluation_criterion_answers` têm `on delete cascade` — saem junto, por
-- construção, e não por DML solta.
--
-- A TRILHA NÃO É TOCADA. `audit_logs.object_id` é `text` SEM FK, então os
-- eventos das avaliações apagadas PERMANECEM. E um evento novo de expurgo é
-- gravado, com motivo, contagens e ator.
create or replace function public.admin_purge_legacy_evaluations(
  p_reason text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid          uuid;
  v_reason       text := btrim(coalesce(p_reason, ''));
  v_total        int;
  v_bloqueadas   int;
  v_snapshots    int;
  v_validacoes   int;
  v_diagnosticos int;
  v_evidencias   int;
  v_planos       int;
  v_respostas    int;
  v_apagadas     int;
  v_ids          text;
begin
  -- (1) ATOR.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) PAPEL. Expurgo é ato administrativo nacional, como o cutover.
  if not coalesce(app.is_admin(), false) then
    raise exception 'apenas administrador executa o expurgo do modelo legado'
      using errcode = 'insufficient_privilege';
  end if;

  -- (3) MOTIVO OBRIGATÓRIO. Sem motivo não há trilha útil.
  if length(v_reason) < 10 then
    raise exception 'informe o motivo do expurgo, com referencia ao backup'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (4) INVENTÁRIO ANTES.
  select count(*) into v_total        from public.evaluations;
  select count(*) into v_bloqueadas   from public.evaluations where status not in ('draft', 'returned');
  select count(*) into v_snapshots    from public.official_snapshots;
  select count(*) into v_validacoes   from public.validations;
  select count(*) into v_diagnosticos from public.diagnoses;
  select count(*) into v_evidencias   from public.evidence_files;
  select count(*) into v_respostas    from public.evaluation_answers;
  select count(*) into v_planos       from public.action_plans where evaluation_id is not null;

  -- (5) AS RECUSAS. Cada uma protege uma perda diferente e IRREVERSÍVEL.
  if v_bloqueadas > 0 then
    raise exception 'expurgo recusado: % avaliacao(oes) fora de rascunho — historico concluido nao se apaga', v_bloqueadas
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_snapshots > 0 then
    raise exception 'expurgo recusado: % snapshot(s) oficial(is) existem', v_snapshots
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_validacoes > 0 then
    raise exception 'expurgo recusado: % validacao(oes) existem', v_validacoes
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_diagnosticos > 0 then
    raise exception 'expurgo recusado: % diagnostico(s) existem', v_diagnosticos
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_evidencias > 0 then
    raise exception 'expurgo recusado: % arquivo(s) de evidencia existem', v_evidencias
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_planos > 0 then
    raise exception 'expurgo recusado: % plano(s) de acao vinculados a avaliacao', v_planos
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (6) IDEMPOTÊNCIA. Nada a apagar não é erro.
  if v_total = 0 then
    return jsonb_build_object(
      'purged', 0, 'answersPurged', 0, 'alreadyEmpty', true,
      'evaluationsAfter', 0, 'answersAfter', 0);
  end if;

  -- (7) OS IDS VÃO PARA A TRILHA ANTES DE SUMIREM.
  select string_agg(id::text, ',' order by created_at) into v_ids from public.evaluations;

  -- (8) EFEITO. As respostas saem por cascade.
  delete from public.evaluations;
  get diagnostics v_apagadas = row_count;

  -- (9) TRILHA CANÔNICA. Mesmo escritor de sempre; o ator vem de auth.uid().
  perform app.write_audit(
    'legacy_evaluations_purged', 'evaluation', 'ALL',
    jsonb_build_object(
      'reason', v_reason,
      'evaluationsPurged', v_apagadas,
      'answersPurged', v_respostas,
      'purgedIds', v_ids,
      'timezone', 'America/Sao_Paulo',
      'purgedAt', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS')
    )
  );

  return jsonb_build_object(
    'purged', v_apagadas,
    'answersPurged', v_respostas,
    'alreadyEmpty', false,
    'evaluationsAfter', (select count(*) from public.evaluations),
    'answersAfter', (select count(*) from public.evaluation_answers)
  );
end $$;

comment on function public.admin_purge_legacy_evaluations(text) is
  'Expurgo administrativo do modelo legado (0052). So administrador, so avaliacoes em rascunho, recusa se houver snapshot, validacao, diagnostico, evidencia ou plano vinculado. Grava evento legacy_evaluations_purged.';

revoke all on function public.admin_purge_legacy_evaluations(text) from public, anon;
grant execute on function public.admin_purge_legacy_evaluations(text) to authenticated;
