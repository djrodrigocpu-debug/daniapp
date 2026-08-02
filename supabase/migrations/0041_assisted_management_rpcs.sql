-- =============================================================================
-- AAPEX 1.3.5 — Migration 0041: RPCs da GESTÃO ASSISTIDA semanal
-- =============================================================================
-- O fluxo do Gerente de Canal (Modelo Operacional §2.1), do servidor:
--
--   abrir (idempotente) -> registrar item a item -> status calculado ->
--   diagnóstico e plano onde houver desvio -> fechar -> consultar
--
-- ORDEM DE VERIFICAÇÃO em toda RPC, padrão da Matriz §7.2 estabelecido em 0031:
--
--   1. ator não nulo   -> 'autenticacao obrigatoria'
--   2. papel           -> 'apenas o gerente de canal ...'
--   3. escopo          -> 'operacao fora do escopo'
--   4. estado          -> 'ciclo fechado ...'
--   5. efeito
--
-- Inverter 2 e 3 vaza existência: dizer "fora do escopo" a quem não tinha nem o
-- papel já revela que o objeto existe.
--
-- O ATOR NUNCA VEM DO CLIENTE. Nenhuma RPC aceita `actorId`, `role`, `regionId`
-- ou `status`: todos são derivados de `auth.uid()` e do banco.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DTOs
-- ---------------------------------------------------------------------------
-- `plan` traz o ESTADO ATUAL do plano, e o restante da entrada traz o estado
-- HISTÓRICO do ciclo. São coisas diferentes de propósito (ADR-135-002 §5): o
-- plano evolui — muda de estado, é validado, vence — sem que nada disso
-- reescreva o snapshot do ciclo fechado.
create or replace function app.assisted_entry_dto(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',                      e.id,
    'cycleId',                 e.cycle_id,
    'indicatorDefinitionId',   e.indicator_definition_id,
    'indicatorVersionId',      e.indicator_version_id,
    'regionalConfigId',        e.regional_config_id,
    'regionalConfigVersionId', e.regional_config_version_id,
    'themeId',                 e.theme_id,
    'themeVersionId',          e.theme_version_id,
    'indicatorCode',           e.indicator_code,
    'indicatorName',           e.indicator_name,
    'themeCode',               e.theme_code,
    'themeName',               e.theme_name,
    'unit',                    e.unit,
    'direction',               e.direction,
    'orientation',             e.orientation,
    'target',                  e.target,
    'tolerance',               e.tolerance,
    'weight',                  e.weight,
    'sortOrder',               e.sort_order,
    'actual',                  e.actual,
    'sourcePeriod',            e.source_period,
    'sourceConsultedAt',       e.source_consulted_at,
    'sourceReference',         e.source_reference,
    'observation',             e.observation,
    'diagnosis',               e.diagnosis,
    'status',                  e.status,
    'ruleVersion',             e.rule_version,
    'recordedBy',              e.recorded_by,
    'recordedAt',              e.recorded_at,
    'plan', (
      select jsonb_build_object(
        'id',       a.id,
        'action',   coalesce(nullif(a.action_text, ''), a.description),
        'problem',  a.problem,
        'owner',    coalesce(nullif(a.owner_name, ''), ''),
        'dueDate',  a.due_date::text,
        'priority', a.priority,
        'status',   app.action_status_to_ui(a.status),
        'source',   a.source::text
      )
      from public.action_plans a where a.assisted_entry_id = e.id
    )
  )
  from public.assisted_cycle_entries e where e.id = p_id
$$;

create or replace function app.assisted_cycle_dto(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',             c.id,
    'operationId',    c.operation_id,
    'partnerName',    o.partner_name,
    'weekStartDate',  c.week_start_date::text,
    'weekEndDate',    (c.week_start_date + 6)::text,
    'status',         c.status,
    'authorUserId',   c.author_user_id,
    'closedAt',       c.closed_at,
    'closedBy',       c.closed_by,
    'ruleVersion',    c.rule_version,
    'entries', coalesce((
      select jsonb_agg(app.assisted_entry_dto(e.id) order by e.sort_order, e.indicator_code)
        from public.assisted_cycle_entries e where e.cycle_id = c.id
    ), '[]'::jsonb)
  )
  from public.assisted_cycles c
  join public.operations o on o.id = c.operation_id
 where c.id = p_id
$$;

revoke all on function app.assisted_entry_dto(uuid) from public, anon, authenticated;
revoke all on function app.assisted_cycle_dto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abertura idempotente
-- ---------------------------------------------------------------------------
-- IDEMPOTÊNCIA: `on conflict (operation_id, week_start_date) do nothing` seguido
-- de leitura. Duas chamadas simultâneas produzem um ciclo só porque a unicidade
-- é do BANCO — não porque a aplicação procurou antes de inserir. Era essa a
-- lacuna do achado O-06.
--
-- MATERIALIZAÇÃO: acontece UMA VEZ, na criação. Reabrir devolve o ciclo como
-- ele está. A alternativa — remontar o catálogo a cada abertura — faria a
-- composição de um rascunho mudar sozinha no meio da semana, quando alguma
-- região publicasse configuração nova. O que entra é a configuração vigente NO
-- ATO DA ABERTURA, e isso fica gravado nas sete FKs de proveniência.
--
-- O QUE ENTRA (ADR-135-001, decisão D-G — existir no catálogo não ativa nada):
--   · configuração regional PUBLICADA e VIGENTE,
--   · `active = true`,
--   · `include_in_assisted_management = true`,
--   · da REGIÃO da operação,
--   · com a versão de indicador e a de tema publicadas.
--
-- Indicador APOSENTADO não entra: `lifecycle = 'inactive'` é o caminho de
-- aposentadoria que D3 define ("inativar", nunca excluir), e um indicador
-- inativo que continuasse sendo medido tornaria a inativação decorativa. É a
-- única condição desta lista que não está literalmente no escopo da fase; está
-- aqui declarada para ser rastreável.
create or replace function public.open_assisted_cycle(
  p_operation_id   uuid,
  p_reference_date date default null
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_week   date;
  v_region uuid;
  v_cycle  uuid;
  v_new    boolean := false;
  v_at     timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if not app.has_role('channel_manager') then
    raise exception 'apenas o gerente de canal responsavel executa a Gestao Assistida'
      using errcode = 'insufficient_privilege';
  end if;

  if not app.is_assisted_operator(p_operation_id) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- A data de referência é do SERVIDOR quando o cliente não a informa. O relógio
  -- do cliente nunca decide de que semana é o ciclo (risco RT-04).
  v_week := app.assisted_week_start(coalesce(p_reference_date, app.assisted_today()));

  select u.region_id into v_region
    from public.operations o join public.units u on u.id = o.unit_id
   where o.id = p_operation_id;

  insert into public.assisted_cycles (operation_id, week_start_date, author_user_id)
  values (p_operation_id, v_week, v_uid)
  on conflict on constraint assisted_cycles_week_uk do nothing;

  select id into v_cycle from public.assisted_cycles
   where operation_id = p_operation_id and week_start_date = v_week;

  v_new := not exists (select 1 from public.assisted_cycle_entries where cycle_id = v_cycle);

  if v_new then
    insert into public.assisted_cycle_entries (
      cycle_id,
      indicator_definition_id, indicator_version_id,
      regional_config_id, regional_config_version_id,
      theme_id, theme_version_id,
      indicator_code, indicator_name, theme_code, theme_name,
      unit, direction, orientation, target, tolerance, weight, sort_order
    )
    select
      v_cycle,
      d.id, iv.id,
      rc.id, cv.id,
      t.id, tv.id,
      d.code, coalesce(iv.name, d.name), t.code, tv.name,
      iv.unit, iv.direction, coalesce(iv.description, ''),
      cv.target, cv.tolerance, cv.weight, cv.sort_order
    from public.indicator_regional_configs rc
    join public.indicator_regional_config_versions cv on cv.config_id = rc.id
    join public.indicator_definitions d on d.id = rc.indicator_definition_id
    join public.indicator_versions   iv on iv.id = cv.indicator_version_id
    join public.theme_versions       tv on tv.id = cv.theme_version_id
    join public.themes               t  on t.id  = tv.theme_id
   where rc.region_id = v_region
     and cv.status = 'published'
     and cv.active
     and cv.include_in_assisted_management
     and cv.effective_from <= v_at
     and (cv.effective_to is null or cv.effective_to > v_at)
     and iv.status = 'published'
     and tv.status = 'published'
     and d.lifecycle <> 'inactive'
    on conflict on constraint assisted_entries_indicator_uk do nothing;

    perform app.write_audit(
      'assisted_cycle_opened', 'assisted_cycle', v_cycle::text,
      jsonb_build_object('operationId', p_operation_id, 'weekStartDate', v_week::text)
    );
  end if;

  return app.assisted_cycle_dto(v_cycle);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Registro do resultado
-- ---------------------------------------------------------------------------
-- O AAPEx NÃO PRODUZ o resultado. O GC o consulta no RELATÓRIO OFICIAL DA
-- OPERAÇÃO — fonte externa — e o informa aqui, junto com o período de que o
-- número veio e a data em que consultou. É por isso que os dois campos são
-- exigidos com o valor, e não antes: cobrar data de consulta de quem ainda não
-- consultou nada seria ruído.
--
-- O STATUS NÃO ESTÁ NO CONTRATO desta RPC. Um cliente não consegue enviá-lo:
-- quem o grava é o gatilho `trg_assisted_entry_status`, sobre a regra
-- materializada da própria linha.
create or replace function public.save_assisted_entry(
  p_entry_id uuid,
  p_patch    jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_op     uuid;
  v_cycle  uuid;
  v_cstat  app.assisted_cycle_status;
  v_actual numeric;
  v_period text;
  v_at     date;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if not app.has_role('channel_manager') then
    raise exception 'apenas o gerente de canal responsavel executa a Gestao Assistida'
      using errcode = 'insufficient_privilege';
  end if;

  select c.id, c.operation_id, c.status into v_cycle, v_op, v_cstat
    from public.assisted_cycle_entries e
    join public.assisted_cycles c on c.id = e.cycle_id
   where e.id = p_entry_id;

  -- Item inexistente e item fora do escopo respondem a MESMA coisa: distinguir
  -- confirmaria a existência de um item que o ator não pode ver.
  if v_op is null or not app.is_assisted_operator(v_op) then
    raise exception 'item inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_cstat = 'closed' then
    raise exception 'ciclo fechado e imutavel: o registro nao pode ser alterado'
      using errcode = 'integrity_constraint_violation';
  end if;

  select
    case when p_patch ? 'actual' then nullif(p_patch->>'actual','')::numeric else e.actual end,
    coalesce(btrim(p_patch->>'sourcePeriod'), e.source_period),
    case when p_patch ? 'sourceConsultedAt'
         then nullif(p_patch->>'sourceConsultedAt','')::date else e.source_consulted_at end
    into v_actual, v_period, v_at
    from public.assisted_cycle_entries e where e.id = p_entry_id;

  if v_actual is not null and (v_period = '' or v_at is null) then
    raise exception 'informe o periodo da fonte e a data da consulta junto com o resultado'
      using errcode = 'check_violation';
  end if;

  update public.assisted_cycle_entries set
    actual              = v_actual,
    source_period       = v_period,
    source_consulted_at = v_at,
    source_reference    = coalesce(btrim(p_patch->>'sourceReference'), source_reference),
    observation         = coalesce(btrim(p_patch->>'observation'), observation),
    diagnosis           = coalesce(btrim(p_patch->>'diagnosis'), diagnosis),
    recorded_by         = v_uid,
    recorded_at         = now()
   where id = p_entry_id;

  perform app.write_audit(
    'assisted_entry_saved', 'assisted_cycle_entry', p_entry_id::text,
    jsonb_build_object('cycleId', v_cycle, 'hasActual', v_actual is not null)
  );

  return app.assisted_entry_dto(p_entry_id);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Fechamento
-- ---------------------------------------------------------------------------
-- As guardas de D2, na ordem em que fazem sentido para quem lê a mensagem:
--
--   · ciclo com catálogo vazio não fecha — não haveria o que registrar;
--   · item obrigatório SEM DADO impede o fechamento. Regra PROVISÓRIA de
--     integridade, declarada como tal: `sem_dado` NÃO vira não conformidade
--     (Modelo Operacional §2.4 é expresso), e por isso a ausência bloqueia em
--     vez de ser convertida. Se a decisão empresarial vier a permitir fechar com
--     lacuna, é aqui que ela entra — e não em outro lugar;
--   · `atencao` e `nao_conforme` exigem diagnóstico, plano, responsável e prazo.
--     Para `conforme` os quatro são opcionais;
--   · o plano é o do MOTOR ÚNICO, ligado por FK ao item. Texto solto e UUID
--     arbitrário não passam — não porque a RPC os recuse, mas porque o banco
--     não os aceitaria.
--
-- IDEMPOTÊNCIA DO FECHAMENTO: fechar ciclo já fechado é NO-OP que devolve a
-- representação final, no mesmo padrão de `catalog_publish_*` (0037). Não gera
-- evento duplicado na trilha. A escolha é deliberada: o clique repetido no botão
-- não é um segundo fechamento.
create or replace function public.close_assisted_cycle(p_cycle_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid   uuid;
  v_op    uuid;
  v_stat  app.assisted_cycle_status;
  v_code  text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if not app.has_role('channel_manager') then
    raise exception 'apenas o gerente de canal responsavel executa a Gestao Assistida'
      using errcode = 'insufficient_privilege';
  end if;

  select operation_id, status into v_op, v_stat
    from public.assisted_cycles where id = p_cycle_id;

  if v_op is null or not app.is_assisted_operator(v_op) then
    raise exception 'ciclo inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_stat = 'closed' then
    return app.assisted_cycle_dto(p_cycle_id);          -- idempotência
  end if;

  if not exists (select 1 from public.assisted_cycle_entries where cycle_id = p_cycle_id) then
    raise exception 'ciclo sem indicadores aplicaveis: nao ha o que fechar'
      using errcode = 'integrity_constraint_violation';
  end if;

  select e.indicator_code into v_code
    from public.assisted_cycle_entries e
   where e.cycle_id = p_cycle_id and e.status = 'sem_dado'
   order by e.sort_order, e.indicator_code limit 1;
  if v_code is not null then
    raise exception 'fechamento bloqueado: % esta sem resultado informado', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  select e.indicator_code into v_code
    from public.assisted_cycle_entries e
   where e.cycle_id = p_cycle_id
     and e.status in ('atencao', 'nao_conforme')
     and btrim(e.diagnosis) = ''
   order by e.sort_order, e.indicator_code limit 1;
  if v_code is not null then
    raise exception 'fechamento bloqueado: % apresenta desvio sem diagnostico', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  select e.indicator_code into v_code
    from public.assisted_cycle_entries e
   where e.cycle_id = p_cycle_id
     and e.status in ('atencao', 'nao_conforme')
     and not exists (select 1 from public.action_plans a where a.assisted_entry_id = e.id)
   order by e.sort_order, e.indicator_code limit 1;
  if v_code is not null then
    raise exception 'fechamento bloqueado: % apresenta desvio sem plano de acao', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  -- `due_date` é `not null` desde 0001; o responsável não é, e é o que falta
  -- verificar. As duas exigências de D2 aparecem juntas na mensagem porque, para
  -- quem preenche, são o mesmo campo do formulário.
  select e.indicator_code into v_code
    from public.assisted_cycle_entries e
    join public.action_plans a on a.assisted_entry_id = e.id
   where e.cycle_id = p_cycle_id
     and e.status in ('atencao', 'nao_conforme')
     and (btrim(coalesce(a.owner_name, '')) = '' or a.due_date is null)
   order by e.sort_order, e.indicator_code limit 1;
  if v_code is not null then
    raise exception 'fechamento bloqueado: o plano de % precisa de responsavel e prazo', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  update public.assisted_cycles set
    status       = 'closed',
    closed_at    = now(),
    closed_by    = v_uid,
    rule_version = app.assisted_rule_version(),
    row_version  = row_version + 1
   where id = p_cycle_id;

  perform app.write_audit(
    'assisted_cycle_closed', 'assisted_cycle', p_cycle_id::text,
    jsonb_build_object('operationId', v_op, 'ruleVersion', app.assisted_rule_version())
  );

  return app.assisted_cycle_dto(p_cycle_id);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Consulta
-- ---------------------------------------------------------------------------
-- Leitura segue o alcance da Matriz §3, linha "Consultar ciclos": ADMIN global,
-- REGIONAL na região, COORDENADOR na coordenadoria, GC nos seus parceiros. É
-- `app.has_operation_access`, e NÃO `app.is_assisted_operator` — consultar não é
-- executar.
create or replace function public.get_assisted_cycle(
  p_operation_id    uuid,
  p_week_start_date date default null
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_week date; v_cycle uuid;
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_operation_access(p_operation_id) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  v_week := app.assisted_week_start(coalesce(p_week_start_date, app.assisted_today()));

  select id into v_cycle from public.assisted_cycles
   where operation_id = p_operation_id and week_start_date = v_week;

  -- Ciclo ainda não aberto devolve NULO, não erro: "esta semana ainda não
  -- começou" é um estado legítimo da tela, não uma falha.
  if v_cycle is null then
    return null;
  end if;
  return app.assisted_cycle_dto(v_cycle);
end $$;

create or replace function public.list_assisted_cycles(
  p_operation_id uuid,
  p_limit        int default 26
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_limit int := least(greatest(coalesce(p_limit, 26), 1), 104);
begin
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;
  if not app.has_operation_access(p_operation_id) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(x.j order by x.week desc)
      from (
        select c.week_start_date as week, jsonb_build_object(
          'id',            c.id,
          'operationId',   c.operation_id,
          'weekStartDate', c.week_start_date::text,
          'weekEndDate',   (c.week_start_date + 6)::text,
          'status',        c.status,
          'closedAt',      c.closed_at,
          'entryCount',    (select count(*)::int from public.assisted_cycle_entries e where e.cycle_id = c.id),
          'deviationCount',(select count(*)::int from public.assisted_cycle_entries e
                             where e.cycle_id = c.id and e.status in ('atencao','nao_conforme')),
          'missingCount',  (select count(*)::int from public.assisted_cycle_entries e
                             where e.cycle_id = c.id and e.status = 'sem_dado')
        ) as j
        from public.assisted_cycles c
       where c.operation_id = p_operation_id
       order by c.week_start_date desc
       limit v_limit
      ) x
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants mínimos
-- ---------------------------------------------------------------------------
revoke all on function public.open_assisted_cycle(uuid, date)  from public, anon;
revoke all on function public.save_assisted_entry(uuid, jsonb) from public, anon;
revoke all on function public.close_assisted_cycle(uuid)       from public, anon;
revoke all on function public.get_assisted_cycle(uuid, date)   from public, anon;
revoke all on function public.list_assisted_cycles(uuid, int)  from public, anon;

grant execute on function public.open_assisted_cycle(uuid, date)  to authenticated;
grant execute on function public.save_assisted_entry(uuid, jsonb) to authenticated;
grant execute on function public.close_assisted_cycle(uuid)       to authenticated;
grant execute on function public.get_assisted_cycle(uuid, date)   to authenticated;
grant execute on function public.list_assisted_cycles(uuid, int)  to authenticated;
