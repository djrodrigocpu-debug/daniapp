-- =============================================================================
-- AAPEX 1.3.5 — Migration 0044: RPCs da Auditoria Mensal por competência
-- =============================================================================
-- O fluxo do Modelo Operacional §3.2, do servidor:
--
--   criar por competência -> materializar critérios -> responder ->
--   N/A com justificativa -> evidência -> diagnóstico e plano ->
--   enviar -> validar/aprovar -> snapshot imutável -> consultar
--
-- ORDEM DE VERIFICAÇÃO em toda RPC, padrão da Matriz §7.2 estabelecido em 0031:
--
--   1. ator não nulo   -> 'autenticacao obrigatoria'
--   2. registro
--   3. escopo          -> 'inexistente ou fora do escopo' (mesma frase para os dois)
--   4. papel
--   5. estado
--   6. efeito
--
-- O ATOR NUNCA VEM DO CLIENTE. Nenhuma RPC aceita `actorId`, `role`, `regionId`,
-- `status` final ou `score`.
--
-- REAPROVEITAMENTO DELIBERADO. A aprovação continua sendo `validate_evaluation`
-- e o caminho físico de evidência continua sendo `reserve`/`confirm`. As duas
-- ganham um RAMO para o modelo novo — não uma cópia.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DTOs
-- ---------------------------------------------------------------------------
-- Ordenação EXPLÍCITA e estável em todo agregado: `sort_order` e depois o
-- código. Sem ela o snapshot mensal não seria determinístico, e determinismo é
-- exigência de §18 tanto para o legado quanto para o novo.
create or replace function app.monthly_criterion_dto(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',                       c.id,
    'evaluationId',             c.evaluation_id,
    'regionalConfigId',         c.regional_config_id,
    'regionalConfigVersionId',  c.regional_config_version_id,
    'indicatorDefinitionId',    c.indicator_definition_id,
    'indicatorVersionId',       c.indicator_version_id,
    'themeId',                  c.theme_id,
    'themeVersionId',           c.theme_version_id,
    'criterionId',              c.criterion_id,
    'criterionVersionId',       c.criterion_version_id,
    'criterionCode',            c.criterion_code,
    'indicatorCode',            c.indicator_code,
    'indicatorName',            c.indicator_name,
    'themeCode',                c.theme_code,
    'themeName',                c.theme_name,
    'question',                 c.question,
    'description',              c.description,
    'guidance',                 c.guidance,
    'sortOrder',                c.sort_order,
    'required',                 c.required,
    'evidenceRequired',         c.evidence_required,
    'allowsNa',                 c.allows_na,
    'requiresJustification',    c.requires_justification,
    'effectiveFrom',            c.effective_from,
    'effectiveTo',              c.effective_to,
    'answer', (
      select jsonb_build_object(
        'id',            a.id,
        'status',        a.status,
        'justification', a.justification,
        'observation',   a.observation,
        'diagnosis',     a.diagnosis,
        'answeredBy',    a.answered_by,
        'answeredAt',    a.answered_at,
        'evidences', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id',        ef.id,
                   'name',      regexp_replace(ef.path, '^.*/[0-9a-f-]{36}-', ''),
                   'mimeType',  ef.mime_type,
                   'sizeBytes', ef.size_bytes,
                   'createdAt', ef.created_at
                 ) order by ef.created_at, ef.id)
            from public.evaluation_criterion_answer_evidence l
            join public.evidence_files ef on ef.id = l.evidence_id
           where l.answer_id = a.id
        ), '[]'::jsonb),
        'plans', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id',       p.id,
                   'action',   coalesce(nullif(p.action_text, ''), p.description),
                   'owner',    coalesce(nullif(p.owner_name, ''), ''),
                   'dueDate',  p.due_date::text,
                   'priority', p.priority,
                   'status',   app.action_status_to_ui(p.status)
                 ) order by p.due_date, p.id)
            from public.action_plans p where p.monthly_criterion_answer_id = a.id
        ), '[]'::jsonb)
      )
      from public.evaluation_criterion_answers a where a.evaluation_criterion_id = c.id
    )
  )
  from public.evaluation_criteria c where c.id = p_id
$$;

create or replace function app.monthly_audit_dto(p_eval uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',              e.id,
    'operationId',     e.operation_id,
    'partnerName',     o.partner_name,
    'evaluationModel', e.evaluation_model,
    'competence',      to_char(e.period_start, 'YYYY-MM'),
    'periodStart',     e.period_start::text,
    'periodEnd',       e.period_end::text,
    'cycleLabel',      coalesce(e.cycle_label, ''),
    'status',          e.status,
    'score',           e.score::double precision,
    'authorUserId',    e.author_user_id,
    'authorName',      app.user_display_name(e.author_user_id),
    'submittedAt',     e.submitted_at,
    'validatedAt',     e.validated_at,
    'validatorId',     e.validator_user_id,
    'validatorName',   app.user_display_name(e.validator_user_id),
    'validatorNote',   coalesce(e.validator_note, ''),
    'approvedAt',      e.approved_at,
    'createdAt',       e.created_at,
    'criteria', coalesce((
      select jsonb_agg(app.monthly_criterion_dto(c.id) order by c.sort_order, c.criterion_code)
        from public.evaluation_criteria c where c.evaluation_id = e.id
    ), '[]'::jsonb)
  )
  from public.evaluations e
  join public.operations o on o.id = e.operation_id
 where e.id = p_eval
$$;

revoke all on function app.monthly_criterion_dto(uuid) from public, anon, authenticated;
revoke all on function app.monthly_audit_dto(uuid)     from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Autoridade de execução
-- ---------------------------------------------------------------------------
-- Matriz §4: criar, responder, anexar, marcar N/A e enviar são do GERENTE DE
-- CANAL responsável pelo parceiro. Validar/aprovar é de outro papel, e continua
-- em `validate_evaluation`.
--
-- Reutiliza `app.is_assisted_operator` — o nome nasceu na Gestão Assistida, mas
-- a pergunta que ela responde é "este ator é o GC responsável por este
-- parceiro?", e é a mesma aqui. Duplicá-la criaria duas verdades sobre a mesma
-- coisa, que é justamente o que esta versão vem evitando.
--
-- `app.is_admin()` NÃO é atalho: permissão administrativa não é ser o
-- responsável operacional pelo parceiro.

-- ---------------------------------------------------------------------------
-- 3. Criação por competência
-- ---------------------------------------------------------------------------
-- A COMPETÊNCIA VEM POR PARÂMETRO. É isto que fecha o achado O-06:
-- `start_evaluation` (0006) deriva `cycle_label`, `period_start` e `period_end`
-- de `now()`, e por isso competência passada era irregistrável pelo caminho
-- oficial.
--
-- IDEMPOTÊNCIA: `on conflict` sobre o índice único parcial de 0042, e não busca
-- seguida de insert. Duas chamadas simultâneas produzem uma auditoria só porque
-- a unicidade é do BANCO.
create or replace function public.start_monthly_audit(
  p_operation_id uuid,
  p_competence   text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_start  date;
  v_end    date;
  v_region uuid;
  v_eval   uuid;
  v_new    boolean;
  v_at     timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if not app.has_role('channel_manager') then
    raise exception 'apenas o gerente de canal responsavel executa a Auditoria Mensal'
      using errcode = 'insufficient_privilege';
  end if;

  if not app.is_assisted_operator(p_operation_id) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- Competência é `AAAA-MM`, e é validada aqui em vez de deixar o cast falhar
  -- com mensagem de PostgreSQL na cara do operador.
  if p_competence is null or p_competence !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'competencia invalida: use o formato AAAA-MM'
      using errcode = 'check_violation';
  end if;
  begin
    v_start := (p_competence || '-01')::date;
  exception when others then
    raise exception 'competencia invalida: use o formato AAAA-MM' using errcode = 'check_violation';
  end;
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  select u.region_id into v_region
    from public.operations o join public.units u on u.id = o.unit_id
   where o.id = p_operation_id;

  -- `template_version_id` fica NULO: o modelo novo não usa template legado, e o
  -- CHECK de 0042 recusaria se usasse.
  insert into public.evaluations (
    operation_id, template_version_id, author_user_id, status, score,
    frequency, cycle_label, period_start, period_end, evaluation_model
  ) values (
    p_operation_id, null, v_uid, 'draft', 0,
    'monthly',
    initcap(to_char(v_start, 'TMMonth')) || ' de ' || to_char(v_start, 'YYYY'),
    v_start, v_end, 'monthly_criteria'
  )
  on conflict (operation_id, period_start) where evaluation_model = 'monthly_criteria'
  do nothing
  returning id into v_eval;

  v_new := v_eval is not null;
  if not v_new then
    select id into v_eval from public.evaluations
     where operation_id = p_operation_id
       and period_start = v_start
       and evaluation_model = 'monthly_criteria';
    return app.monthly_audit_dto(v_eval);        -- idempotência
  end if;

  -- MATERIALIZAÇÃO. Acontece UMA VEZ, na criação. Alterar o catálogo depois não
  -- muda auditoria existente — é o que D4 exige.
  --
  -- O que entra: configuração regional PUBLICADA, VIGENTE, ATIVA, com
  -- `include_in_monthly_audit`, da REGIÃO da operação; e, dela, os critérios com
  -- versão publicada, ativa e vigente, de critério não inativado.
  --
  -- A vigência é lida NO ATO DA CRIAÇÃO (`now()`), e não no fim da competência:
  -- uma auditoria de competência passada criada hoje usa o questionário de hoje,
  -- porque é ele que o auditor tem em mãos. A alternativa — reconstituir o
  -- catálogo de meses atrás — inventaria uma auditoria que ninguém aplicou.
  insert into public.evaluation_criteria (
    evaluation_id,
    regional_config_id, regional_config_version_id,
    indicator_definition_id, indicator_version_id,
    theme_id, theme_version_id,
    criterion_id, criterion_version_id,
    criterion_code, indicator_code, indicator_name, theme_code, theme_name,
    question, description, guidance, sort_order,
    required, evidence_required, allows_na, requires_justification,
    effective_from, effective_to
  )
  select
    v_eval,
    rc.id, cv.id,
    d.id, iv.id,
    t.id, tv.id,
    cr.id, crv.id,
    cr.code, d.code, coalesce(iv.name, d.name), t.code, tv.name,
    crv.question, coalesce(crv.description, ''), coalesce(crv.guidance, ''),
    (cv.sort_order * 1000) + crv.sort_order,
    crv.required, crv.evidence_required, crv.allows_na, crv.requires_justification,
    crv.effective_from, crv.effective_to
  from public.indicator_regional_configs rc
  join public.indicator_regional_config_versions cv on cv.config_id = rc.id
  join public.indicator_definitions d  on d.id  = rc.indicator_definition_id
  join public.indicator_versions   iv on iv.id  = cv.indicator_version_id
  join public.theme_versions       tv on tv.id  = cv.theme_version_id
  join public.themes               t  on t.id   = tv.theme_id
  join public.audit_criteria         cr  on cr.config_id  = rc.id
  join public.audit_criteria_versions crv on crv.criterion_id = cr.id
 where rc.region_id = v_region
   and cv.status = 'published'
   and cv.active
   and cv.include_in_monthly_audit
   and cv.effective_from <= v_at
   and (cv.effective_to is null or cv.effective_to > v_at)
   and iv.status = 'published'
   and tv.status = 'published'
   and d.lifecycle <> 'inactive'
   and cr.lifecycle <> 'inactive'
   and crv.status = 'published'
   and crv.active
   and crv.effective_from <= v_at
   and (crv.effective_to is null or crv.effective_to > v_at)
  on conflict on constraint evaluation_criteria_uk do nothing;

  -- Respostas em branco, uma por critério materializado. Nascem
  -- `nao_avaliado` — que é diferente de "conforme por omissão".
  insert into public.evaluation_criterion_answers (evaluation_id, evaluation_criterion_id)
  select v_eval, c.id from public.evaluation_criteria c where c.evaluation_id = v_eval;

  perform app.write_audit(
    'monthly_audit_started', 'evaluation', v_eval::text,
    jsonb_build_object('operationId', p_operation_id, 'competence', p_competence)
  );

  return app.monthly_audit_dto(v_eval);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Resposta a um critério
-- ---------------------------------------------------------------------------
-- O gatilho `trg_criterion_answer_coherence` (0042) é quem impõe N/A permitido e
-- justificativa exigida. A RPC não repete a regra — o banco é a autoridade — mas
-- verifica ator, escopo e estado antes de qualquer escrita.
create or replace function public.save_criterion_answer(
  p_answer_id uuid,
  p_patch     jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_eval   uuid;
  v_op     uuid;
  v_author uuid;
  v_status app.evaluation_status;
  v_crit   uuid;
  v_new    app.criterion_answer_status;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select a.evaluation_id, a.evaluation_criterion_id, e.operation_id, e.author_user_id, e.status
    into v_eval, v_crit, v_op, v_author, v_status
    from public.evaluation_criterion_answers a
    join public.evaluations e on e.id = a.evaluation_id
   where a.id = p_answer_id;

  -- Inexistente e fora do escopo respondem a MESMA coisa.
  if v_op is null or not app.has_operation_access(v_op) then
    raise exception 'resposta inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- Responder é do AUTOR da auditoria. Quem apenas alcança a operação —
  -- coordenador, regional, admin — consulta, não responde.
  if v_author is distinct from v_uid then
    raise exception 'apenas o autor da auditoria responde aos criterios'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('draft', 'returned') then
    raise exception 'respostas so podem mudar em rascunho/devolvida'
      using errcode = 'integrity_constraint_violation';
  end if;

  if p_patch ? 'status' then
    begin
      v_new := (p_patch->>'status')::app.criterion_answer_status;
    exception when others then
      raise exception 'situacao invalida: use conforme, nao_conforme, nao_aplicavel ou nao_avaliado'
        using errcode = 'check_violation';
    end;
  end if;

  update public.evaluation_criterion_answers set
    status        = coalesce(v_new, status),
    justification = coalesce(btrim(p_patch->>'justification'), justification),
    observation   = coalesce(btrim(p_patch->>'observation'), observation),
    diagnosis     = coalesce(btrim(p_patch->>'diagnosis'), diagnosis),
    answered_by   = v_uid,
    answered_at   = now(),
    row_version   = row_version + 1
   where id = p_answer_id;

  -- A nota do rascunho acompanha as respostas. É PROVISÓRIA (pendência A-10):
  -- proporção simples de conformidade, sem peso — critério não tem peso.
  update public.evaluations set score = app.monthly_audit_score(v_eval) where id = v_eval;

  return app.monthly_criterion_dto(v_crit);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Evidência — o caminho físico provado, com um ramo a mais
-- ---------------------------------------------------------------------------
-- O que NÃO muda: a trava D-02 (sem objeto no bucket, não nasce metadata), a
-- higiene de reservas abandonadas, os limites de tipo e tamanho, o formato do
-- caminho e as policies do bucket privado. `app.can_read_evidence_object`
-- também não muda: ela resolve por `evidence_files.source_object_id ->
-- evaluations -> has_operation_access`, e `source_object_id` é a avaliação nos
-- DOIS modelos.
--
-- O que muda: `p_theme_id` passa a ser o CÓDIGO DO CRITÉRIO quando a avaliação
-- é `monthly_criteria`, e a reserva guarda `criterion_answer_id` em vez de
-- `answer_id`.
create or replace function public.reserve_evidence_upload(
  p_evaluation_id uuid, p_theme_id text, p_input jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid; v_author uuid; v_status app.evaluation_status; v_answer uuid;
  v_manswer uuid; v_model app.evaluation_model;
  v_mime text; v_size bigint; v_name text; v_path text; v_res uuid;
begin
  select operation_id, author_user_id, status, evaluation_model
    into v_op, v_author, v_status, v_model
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('draft','returned') then
    raise exception 'evidencia so em rascunho/devolvida' using errcode = 'integrity_constraint_violation';
  end if;

  if v_model = 'monthly_criteria' then
    select a.id into v_manswer
      from public.evaluation_criterion_answers a
      join public.evaluation_criteria c on c.id = a.evaluation_criterion_id
     where a.evaluation_id = p_evaluation_id and c.criterion_code = p_theme_id;
    if v_manswer is null then
      raise exception 'criterio % nao pertence a auditoria', p_theme_id;
    end if;
  else
    select ea.id into v_answer from public.evaluation_answers ea
      join public.audit_items ai on ai.id = ea.item_id
     where ea.evaluation_id = p_evaluation_id and ai.code = p_theme_id;
    if v_answer is null then raise exception 'item % nao pertence a avaliacao', p_theme_id; end if;
  end if;

  v_mime := coalesce(p_input->>'mimeType', '');
  v_size := coalesce((p_input->>'sizeBytes')::bigint, 0);
  if not (v_mime like 'image/%' or v_mime = 'application/pdf') then
    raise exception 'tipo de arquivo nao permitido: use imagem ou PDF'
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_size <= 0 or v_size > 15 * 1024 * 1024 then
    raise exception 'tamanho de arquivo invalido: ate 15 MB'
      using errcode = 'integrity_constraint_violation';
  end if;

  delete from public.evidence_upload_reservations
   where author_user_id = auth.uid() and created_at < now() - interval '1 hour';

  v_name := app.evidence_safe_name(p_input->>'name');
  v_path := p_theme_id || '/' || gen_random_uuid()::text || '-' || v_name;

  insert into public.evidence_upload_reservations (
    evaluation_id, answer_id, criterion_answer_id, bucket, path,
    mime_type, size_bytes, original_name, author_user_id
  ) values (
    p_evaluation_id, v_answer, v_manswer, 'evidencias', v_path, v_mime, v_size,
    coalesce(p_input->>'name', v_name), auth.uid()
  ) returning id into v_res;

  return jsonb_build_object(
    'reservationId', v_res, 'bucket', 'evidencias', 'path', v_path, 'name', v_name
  );
end $$;

create or replace function public.confirm_evidence_upload(p_reservation_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  r record; v_op uuid; v_eval_status app.evaluation_status; v_evid uuid; v_theme text;
begin
  select * into r from public.evidence_upload_reservations
   where id = p_reservation_id for update;
  if not found then raise exception 'reserva inexistente ou ja consumida'; end if;
  if r.author_user_id <> auth.uid() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  select operation_id, status into v_op, v_eval_status
    from public.evaluations where id = r.evaluation_id;
  if v_op is null or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if v_eval_status not in ('draft','returned') then
    raise exception 'evidencia so em rascunho/devolvida' using errcode = 'integrity_constraint_violation';
  end if;

  if not app.evidence_object_exists(r.bucket, r.path) then
    raise exception 'arquivo nao chegou ao armazenamento'
      using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.evidence_files (
    bucket, path, mime_type, size_bytes, author_user_id, source_object_id, status
  ) values (
    r.bucket, r.path, r.mime_type, r.size_bytes, auth.uid(), r.evaluation_id, 'stored'
  ) returning id into v_evid;

  if r.criterion_answer_id is not null then
    insert into public.evaluation_criterion_answer_evidence (answer_id, evidence_id)
    values (r.criterion_answer_id, v_evid);
    select c.criterion_code into v_theme
      from public.evaluation_criterion_answers a
      join public.evaluation_criteria c on c.id = a.evaluation_criterion_id
     where a.id = r.criterion_answer_id;
  else
    insert into public.evaluation_answer_evidence (answer_id, evidence_id)
    values (r.answer_id, v_evid);
    select ai.code into v_theme from public.evaluation_answers ea
      join public.audit_items ai on ai.id = ea.item_id where ea.id = r.answer_id;
  end if;

  delete from public.evidence_upload_reservations where id = r.id;

  return jsonb_build_object(
    'id', v_evid, 'themeId', v_theme, 'name', r.original_name, 'uri', r.path,
    'mimeType', r.mime_type,
    'type', (case when r.mime_type like 'image/%' then 'photo' else 'document' end),
    'status', 'stored', 'sizeBytes', r.size_bytes, 'createdAt', now()
  );
end $$;

-- `remove_evidence` ganha o mesmo ramo. As cinco verificações de 0034 — ator,
-- trava `for update`, avaliação da evidência derivada do registro, autorização
-- fechada por `coalesce` e janela de estado — permanecem palavra por palavra.
create or replace function public.remove_evidence(p_evaluation_id uuid, p_evidence_id uuid)
  returns void
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid        uuid;
  v_op         uuid;
  v_autor      uuid;
  v_status     app.evaluation_status;
  v_eval_da_ev uuid;
  v_autor_ev   uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select e.operation_id, e.author_user_id, e.status
    into v_op, v_autor, v_status
    from public.evaluations e
   where e.id = p_evaluation_id
     for update;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;

  select ef.source_object_id, ef.author_user_id
    into v_eval_da_ev, v_autor_ev
    from public.evidence_files ef
   where ef.id = p_evidence_id;

  if not coalesce(
       v_autor       = v_uid
       and v_autor_ev = v_uid
       and v_eval_da_ev = p_evaluation_id
       and app.has_operation_access(v_op),
       false) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  if v_status not in ('draft', 'returned') then
    raise exception 'Evidencias so podem ser removidas enquanto a avaliacao estiver em rascunho ou devolvida.'
      using errcode = 'integrity_constraint_violation';
  end if;

  delete from public.evaluation_answer_evidence
   where evidence_id = p_evidence_id
     and answer_id in (select id from public.evaluation_answers where evaluation_id = p_evaluation_id);
  delete from public.evaluation_criterion_answer_evidence
   where evidence_id = p_evidence_id
     and answer_id in (
       select id from public.evaluation_criterion_answers where evaluation_id = p_evaluation_id
     );
  delete from public.evidence_files where id = p_evidence_id and author_user_id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Submissão
-- ---------------------------------------------------------------------------
-- RPC PRÓPRIA, e não um ramo de `submit_evaluation`: os quatro portões daquela
-- (completude por `audit_items`, evidência por `audit_items.evidence_required`,
-- item vermelho sem plano, N/A sem justificativa) consultam tabelas que a
-- auditoria mensal não usa. Ramificar teria feito a função crescer para o dobro
-- sem que nenhuma linha fosse compartilhada.
--
-- `submit_evaluation` recebe, na seção 9, a recusa explícita do modelo novo — e
-- vice-versa — para que nenhum dos dois caminhos aceite a auditoria do outro.
create or replace function public.submit_monthly_audit(p_evaluation_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid uuid; v_op uuid; v_author uuid; v_status app.evaluation_status;
  v_model app.evaluation_model; v_code text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select operation_id, author_user_id, status, evaluation_model
    into v_op, v_author, v_status, v_model
    from public.evaluations where id = p_evaluation_id for update;

  if v_op is null or not app.has_operation_access(v_op) then
    raise exception 'auditoria inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  if v_model <> 'monthly_criteria' then
    raise exception 'esta auditoria segue o modelo antigo: use submit_evaluation'
      using errcode = 'integrity_constraint_violation';
  end if;
  if v_author is distinct from v_uid then
    raise exception 'apenas o autor da auditoria pode envia-la' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('draft', 'returned') then
    raise exception 'auditoria nao esta em rascunho/devolvida'
      using errcode = 'integrity_constraint_violation';
  end if;

  if not exists (select 1 from public.evaluation_criteria where evaluation_id = p_evaluation_id) then
    raise exception 'auditoria sem criterios aplicaveis: nao ha o que enviar'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (1) Critério obrigatório sem avaliação.
  select c.criterion_code into v_code
    from public.evaluation_criteria c
    join public.evaluation_criterion_answers a on a.evaluation_criterion_id = c.id
   where c.evaluation_id = p_evaluation_id and c.required and a.status = 'nao_avaliado'
   order by c.sort_order, c.criterion_code limit 1;
  if v_code is not null then
    raise exception 'envio bloqueado: criterio obrigatorio % sem avaliacao', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (2) Evidência obrigatória. `nao_aplicavel` fica de fora, no mesmo critério
  -- que `submit_evaluation` já aplica ao `not_applicable` legado.
  select c.criterion_code into v_code
    from public.evaluation_criteria c
    join public.evaluation_criterion_answers a on a.evaluation_criterion_id = c.id
   where c.evaluation_id = p_evaluation_id
     and c.evidence_required
     and a.status <> 'nao_aplicavel'
     and not exists (
       select 1 from public.evaluation_criterion_answer_evidence l where l.answer_id = a.id
     )
   order by c.sort_order, c.criterion_code limit 1;
  if v_code is not null then
    raise exception 'envio bloqueado: criterio % exige evidencia', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (3) Não conformidade exige diagnóstico.
  select c.criterion_code into v_code
    from public.evaluation_criteria c
    join public.evaluation_criterion_answers a on a.evaluation_criterion_id = c.id
   where c.evaluation_id = p_evaluation_id
     and a.status = 'nao_conforme' and btrim(a.diagnosis) = ''
   order by c.sort_order, c.criterion_code limit 1;
  if v_code is not null then
    raise exception 'envio bloqueado: % em nao conformidade sem diagnostico', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (4) Não conformidade exige AO MENOS UM plano (ADR-135-003, D-R: não é 1:1).
  select c.criterion_code into v_code
    from public.evaluation_criteria c
    join public.evaluation_criterion_answers a on a.evaluation_criterion_id = c.id
   where c.evaluation_id = p_evaluation_id
     and a.status = 'nao_conforme'
     and not exists (select 1 from public.action_plans p where p.monthly_criterion_answer_id = a.id)
   order by c.sort_order, c.criterion_code limit 1;
  if v_code is not null then
    raise exception 'envio bloqueado: % em nao conformidade sem plano de acao', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (5) Responsável e prazo. `due_date` é `not null` desde 0001; o responsável
  -- não é, e é o que falta verificar.
  select c.criterion_code into v_code
    from public.evaluation_criteria c
    join public.evaluation_criterion_answers a on a.evaluation_criterion_id = c.id
    join public.action_plans p on p.monthly_criterion_answer_id = a.id
   where c.evaluation_id = p_evaluation_id
     and a.status = 'nao_conforme'
     and (btrim(coalesce(p.owner_name, '')) = '' or p.due_date is null)
   order by c.sort_order, c.criterion_code limit 1;
  if v_code is not null then
    raise exception 'envio bloqueado: o plano de % precisa de responsavel e prazo', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (6) N/A sem justificativa, quando o critério a exige. O gatilho de 0042 já
  -- recusa na escrita; aqui a verificação existe porque a parametrização pode
  -- ter sido cumprida e depois esvaziada por outro caminho.
  select c.criterion_code into v_code
    from public.evaluation_criteria c
    join public.evaluation_criterion_answers a on a.evaluation_criterion_id = c.id
   where c.evaluation_id = p_evaluation_id
     and a.status = 'nao_aplicavel' and c.requires_justification
     and not app.na_reason_is_valid(a.justification)
   order by c.sort_order, c.criterion_code limit 1;
  if v_code is not null then
    raise exception 'envio bloqueado: % marcado como nao aplicavel sem justificativa', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- O SCORE é do servidor. Nenhum cliente o envia, e ele é recalculado aqui.
  update public.evaluations set
    status = 'submitted', submitted_at = now(), score = app.monthly_audit_score(p_evaluation_id)
   where id = p_evaluation_id;

  perform app.write_audit(
    'monthly_audit_submitted', 'evaluation', p_evaluation_id::text,
    jsonb_build_object('operationId', v_op)
  );

  return app.monthly_audit_dto(p_evaluation_id);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Aprovação — MESMA RPC, um ramo a mais
-- ---------------------------------------------------------------------------
-- `validate_evaluation` continua sendo a porta única de validação, com a mesma
-- ordem de verificação de 0031 palavra por palavra: ator, registro, escopo,
-- segregação de funções (T02), papel autorizador, estado. Nenhum papel novo é
-- inventado — a Matriz §4 já diz quem valida.
--
-- O que muda: o snapshot da auditoria mensal guarda o DTO MENSAL,
-- `evaluation_model = 'monthly_criteria'` e `template_version_id` nulo. O
-- caminho legado continua guardando `app.evaluation_dto` e o template, sem
-- desvio.
create or replace function public.validate_evaluation(
  p_evaluation_id uuid, p_decision text, p_note text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid uuid; v_op uuid; v_author uuid; v_status app.evaluation_status;
  v_tpl uuid; v_score numeric; v_model app.evaluation_model;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select operation_id, author_user_id, status, template_version_id, score, evaluation_model
    into v_op, v_author, v_status, v_tpl, v_score, v_model
    from public.evaluations where id = p_evaluation_id;

  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'avaliacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(v_author = v_uid, false) then
    raise exception 'nao e permitido validar a propria avaliacao'
      using errcode = 'insufficient_privilege';
  end if;

  if not coalesce(
       app.is_admin() or app.has_role('regional') or app.has_role('coordinator'),
       false) then
    raise exception 'perfil sem permissao de validacao' using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'submitted' then
    raise exception 'avaliacao nao esta aguardando validacao'
      using errcode = 'integrity_constraint_violation';
  end if;

  if p_decision = 'approved' then
    update public.evaluations set
      status = 'approved', approved_at = now(), validated_at = now(),
      validator_user_id = v_uid, validator_note = p_note
     where id = p_evaluation_id;

    insert into public.official_snapshots (
      evaluation_id, operation_id, period, score, template_version_id, payload,
      approved_by_user_id, evaluation_model
    ) values (
      p_evaluation_id, v_op,
      coalesce((select to_char(period_start, 'YYYY-MM') from public.evaluations where id = p_evaluation_id),
               to_char(now(), 'YYYY-MM')),
      v_score, v_tpl,
      (case when v_model = 'monthly_criteria'
            then app.monthly_audit_dto(p_evaluation_id)
            else app.evaluation_dto(p_evaluation_id) end),
      v_uid, v_model
    );

    insert into public.validations (evaluation_id, validator_user_id, decision, reason)
    values (p_evaluation_id, v_uid, 'approved', p_note);

  elsif p_decision = 'returned' then
    update public.evaluations set
      status = 'returned', validated_at = now(),
      validator_user_id = v_uid, validator_note = p_note
     where id = p_evaluation_id;

    insert into public.validations (evaluation_id, validator_user_id, decision, reason)
    values (p_evaluation_id, v_uid, 'returned', p_note);
  else
    raise exception 'decisao invalida: %', p_decision;
  end if;

  return (case when v_model = 'monthly_criteria'
               then app.monthly_audit_dto(p_evaluation_id)
               else app.evaluation_dto(p_evaluation_id) end);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Consulta
-- ---------------------------------------------------------------------------
-- Leitura segue o alcance da Matriz §4, linha "Consultar aprovada + PDF":
-- `app.has_operation_access`. Consultar não é executar.
create or replace function public.get_monthly_audit(
  p_operation_id uuid,
  p_competence   text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_start date; v_eval uuid;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_operation_access(p_operation_id) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  if p_competence is null or p_competence !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'competencia invalida: use o formato AAAA-MM' using errcode = 'check_violation';
  end if;
  v_start := (p_competence || '-01')::date;

  select id into v_eval from public.evaluations
   where operation_id = p_operation_id
     and period_start = v_start
     and evaluation_model = 'monthly_criteria';

  -- Competência ainda não iniciada devolve NULO, não erro: é estado legítimo da
  -- tela, e não falha.
  if v_eval is null then return null; end if;
  return app.monthly_audit_dto(v_eval);
end $$;

create or replace function public.list_monthly_audits(
  p_operation_id uuid,
  p_limit        int default 24
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_limit int := least(greatest(coalesce(p_limit, 24), 1), 120);
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_operation_access(p_operation_id) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(x.j order by x.competence desc)
      from (
        select e.period_start as competence, jsonb_build_object(
          'id',            e.id,
          'operationId',   e.operation_id,
          'competence',    to_char(e.period_start, 'YYYY-MM'),
          'cycleLabel',    coalesce(e.cycle_label, ''),
          'status',        e.status,
          'score',         e.score::double precision,
          'submittedAt',   e.submitted_at,
          'approvedAt',    e.approved_at,
          'criteriaCount', (select count(*)::int from public.evaluation_criteria c
                             where c.evaluation_id = e.id),
          'nonConformCount', (select count(*)::int from public.evaluation_criterion_answers a
                               where a.evaluation_id = e.id and a.status = 'nao_conforme'),
          'pendingCount',  (select count(*)::int from public.evaluation_criterion_answers a
                             where a.evaluation_id = e.id and a.status = 'nao_avaliado')
        ) as j
        from public.evaluations e
       where e.operation_id = p_operation_id and e.evaluation_model = 'monthly_criteria'
       order by e.period_start desc
       limit v_limit
      ) x
  ), '[]'::jsonb);
end $$;

-- Leitura do SNAPSHOT mensal — o conteúdo oficial imutável, para a tela de
-- auditoria aprovada. É a contraparte de `get_official_audit_report_data` para o
-- modelo novo, e devolve o payload congelado, NÃO o estado atual.
--
-- NÃO produz PDF e NÃO carrega `REPORT_FORMAT_VERSION`: o contrato do novo
-- documento não foi congelado (pendência A-05), e versionar agora seria fingir
-- homologação.
create or replace function public.get_monthly_audit_snapshot(p_evaluation_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare v_op uuid; v_model app.evaluation_model; v_snap record;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select operation_id, evaluation_model into v_op, v_model
    from public.evaluations where id = p_evaluation_id;
  if v_op is null or not app.has_operation_access(v_op) then
    raise exception 'auditoria inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;
  if v_model <> 'monthly_criteria' then
    raise exception 'esta auditoria segue o modelo antigo: use get_official_audit_report_data'
      using errcode = 'integrity_constraint_violation';
  end if;

  select s.id, s.period, s.score, s.payload, s.approved_by_user_id, s.created_at
    into v_snap
    from public.official_snapshots s
   where s.evaluation_id = p_evaluation_id and s.evaluation_model = 'monthly_criteria'
   order by s.created_at desc, s.id desc
   limit 1;

  if v_snap.id is null then
    raise exception 'auditoria ainda nao aprovada: nao ha snapshot oficial'
      using errcode = 'integrity_constraint_violation';
  end if;

  return jsonb_build_object(
    'snapshotId',   v_snap.id,
    'evaluationId', p_evaluation_id,
    'period',       v_snap.period,
    'score',        v_snap.score::double precision,
    'approvedBy',   app.user_display_name(v_snap.approved_by_user_id),
    'approvedAt',   v_snap.created_at,
    -- Provisório enquanto A-10 estiver aberta: proporção simples de
    -- conformidade, sem peso. Dito aqui para a tela não chamar de Índice.
    'scoreRule',    'proporcao-simples/A-10-pendente',
    'official',     v_snap.payload
  );
end $$;

-- ---------------------------------------------------------------------------
-- 9. As duas fronteiras que faltavam
-- ---------------------------------------------------------------------------
-- `submit_evaluation` recusa o modelo novo. Sem isto, uma auditoria mensal
-- passaria pelos portões legados — que consultam `evaluation_answers` e
-- `audit_items`, ambos VAZIOS para ela — e seria enviada sem verificação
-- nenhuma.
--
-- WRAPPER, e não reescrita. A função vigente (0025 + a guarda de estado da
-- 0027) é renomeada para `app.submit_evaluation_legacy` sem UMA LINHA alterada,
-- e a nova `public.submit_evaluation` só acrescenta a fronteira antes de
-- delegar.
--
-- Copiar o corpo teria sido o caminho óbvio, e é justamente o que NÃO se pode
-- fazer: a primeira tentativa desta migration reescreveu o corpo a partir da
-- 0025 e perdeu, em silêncio, a guarda de estado que a 0027 acrescentou —
-- avaliação já enviada voltava a poder ser reenviada. Cinco testes pegaram.
-- Com o wrapper, "o corpo legado é o mesmo" deixa de ser uma promessa e passa a
-- ser uma propriedade do comando.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_evaluation';

  execute replace(
    v_src,
    'FUNCTION public.submit_evaluation(p_evaluation_id uuid)',
    'FUNCTION app.submit_evaluation_legacy(p_evaluation_id uuid)'
  );
end $$;

create or replace function public.submit_evaluation(p_evaluation_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_model app.evaluation_model;
begin
  select evaluation_model into v_model from public.evaluations where id = p_evaluation_id;

  if v_model = 'monthly_criteria' then
    raise exception 'esta auditoria segue o modelo por criterios: use submit_monthly_audit'
      using errcode = 'integrity_constraint_violation';
  end if;

  return app.submit_evaluation_legacy(p_evaluation_id);
end $$;

revoke all on function app.submit_evaluation_legacy(uuid) from public, anon, authenticated;

-- `get_official_audit_report_data` RECUSA o modelo novo, em vez de produzir um
-- relatório sintaticamente válido e VAZIO (ADR-135-003, decisão D-S).
--
-- A função lê `official_snapshots.payload`, que para o legado é
-- `app.evaluation_dto` — cujas `answers` vêm de `evaluation_answers` com `join
-- audit_items`. Sobre uma auditoria mensal ela devolveria um documento oficial
-- sem uma resposta sequer, com o mesmo formato do verdadeiro.
--
-- A guarda é um WRAPPER: a função original de 0035 é renomeada para
-- `app.official_audit_report_legacy` sem UMA LINHA alterada, e o caminho legado
-- passa a chamá-la. É isto que permite afirmar que o payload legado é o mesmo —
-- não há "mesmo código com um if a mais", há literalmente a mesma função.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_official_audit_report_data';

  execute replace(
    v_src,
    'FUNCTION public.get_official_audit_report_data(p_evaluation_id uuid)',
    'FUNCTION app.official_audit_report_legacy(p_evaluation_id uuid)'
  );
end $$;

create or replace function public.get_official_audit_report_data(p_evaluation_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare v_model app.evaluation_model;
begin
  select evaluation_model into v_model from public.evaluations where id = p_evaluation_id;

  if v_model = 'monthly_criteria' then
    raise exception 'a Auditoria Mensal por criterios ainda nao tem formato de relatorio oficial '
                    '(pendencia A-05): use get_monthly_audit_snapshot'
      using errcode = 'feature_not_supported';
  end if;

  return app.official_audit_report_legacy(p_evaluation_id);
end $$;

revoke all on function app.official_audit_report_legacy(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Grants mínimos
-- ---------------------------------------------------------------------------
revoke all on function public.start_monthly_audit(uuid, text)        from public, anon;
revoke all on function public.save_criterion_answer(uuid, jsonb)     from public, anon;
revoke all on function public.submit_monthly_audit(uuid)             from public, anon;
revoke all on function public.get_monthly_audit(uuid, text)          from public, anon;
revoke all on function public.list_monthly_audits(uuid, int)         from public, anon;
revoke all on function public.get_monthly_audit_snapshot(uuid)       from public, anon;
revoke all on function public.validate_evaluation(uuid, text, text)  from public, anon;
revoke all on function public.submit_evaluation(uuid)                from public, anon;
revoke all on function public.reserve_evidence_upload(uuid, text, jsonb) from public, anon;
revoke all on function public.confirm_evidence_upload(uuid)          from public, anon;
revoke all on function public.remove_evidence(uuid, uuid)            from public, anon;
revoke all on function public.get_official_audit_report_data(uuid)   from public, anon;

grant execute on function public.start_monthly_audit(uuid, text)        to authenticated;
grant execute on function public.save_criterion_answer(uuid, jsonb)     to authenticated;
grant execute on function public.submit_monthly_audit(uuid)             to authenticated;
grant execute on function public.get_monthly_audit(uuid, text)          to authenticated;
grant execute on function public.list_monthly_audits(uuid, int)         to authenticated;
grant execute on function public.get_monthly_audit_snapshot(uuid)       to authenticated;
grant execute on function public.validate_evaluation(uuid, text, text)  to authenticated;
grant execute on function public.submit_evaluation(uuid)                to authenticated;
grant execute on function public.reserve_evidence_upload(uuid, text, jsonb) to authenticated;
grant execute on function public.confirm_evidence_upload(uuid)          to authenticated;
grant execute on function public.remove_evidence(uuid, uuid)            to authenticated;
grant execute on function public.get_official_audit_report_data(uuid)   to authenticated;
