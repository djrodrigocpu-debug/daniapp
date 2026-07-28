-- =============================================================================
-- AAPEX \ AACE V2.0 — Migration 0020: indicadores de ponta a ponta (Fatia 6C)
-- =============================================================================
-- Fecha o caminho de CRIAÇÃO de resultados de indicador: `update_indicator_result`
-- (0006) apenas atualiza linha preexistente e nas migrations 0001–0019 não existe
-- nenhum INSERT operacional em `public.indicator_results` nem em
-- `public.measurements` — um indicador cadastrado não podia receber o primeiro
-- resultado pelo produto.
--
--   * `save_indicator_result(p_input)` cria OU atualiza o resultado corrente de
--     operação+indicador+período e registra a medição histórica na versão
--     VIGENTE (maior version_number), numa única transação;
--   * a chave do resultado é a UNIQUE já existente
--     (operation_id, indicator_id, period) — 0004; a da medição é
--     (operation_id, indicator_version_id, period) — 0001. Nenhuma alteração de
--     schema é necessária;
--   * autorização: mesma autoridade de `update_indicator_result` e das policies
--     de 0002/0004 — `app.has_operation_access(operation_id)`;
--   * valores só entram como JSON numérico explícito: texto, ausência ou NaN
--     (que nem é JSON válido) são recusados — nunca coagidos para zero.
--
-- Aditiva, idempotente (create or replace + grants re-executáveis) e
-- determinística. Não semeia indicador, resultado ou medição; não contém dado
-- de ambiente; não altera 0001–0019.
-- =============================================================================

create or replace function public.save_indicator_result(p_input jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op      uuid;
  v_def     uuid;
  v_period  text;
  v_actual  numeric;
  v_target  numeric;
  v_version public.indicator_versions%rowtype;
  v_id      uuid;
begin
  -- Operação: UUID canônico, existência confirmada e escopo verificado.
  begin
    v_op := (p_input->>'operationId')::uuid;
  exception when others then
    raise exception 'operationId invalido' using errcode = 'invalid_parameter_value';
  end;
  if v_op is null or not exists (select 1 from public.operations o where o.id = v_op) then
    raise exception 'operacao inexistente' using errcode = 'invalid_parameter_value';
  end if;
  if not app.has_operation_access(v_op) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- Indicador: definição existente e não inativa; a versão vigente é a de maior
  -- version_number — a mesma regra que a UI aplica sobre ui_indicators.
  begin
    v_def := (p_input->>'indicatorId')::uuid;
  exception when others then
    raise exception 'indicatorId invalido' using errcode = 'invalid_parameter_value';
  end;
  if v_def is null or not exists (
    select 1 from public.indicator_definitions d where d.id = v_def and d.lifecycle <> 'inactive'
  ) then
    raise exception 'indicador inexistente ou inativo' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_version
    from public.indicator_versions
   where definition_id = v_def
   order by version_number desc
   limit 1;
  if v_version.id is null then
    raise exception 'indicador sem versao vigente' using errcode = 'invalid_parameter_value';
  end if;

  -- Realizado é obrigatório e numérico; meta é opcional (default: meta da
  -- versão vigente) mas, se enviada, também precisa ser numérica. Zero é valor
  -- válido e é preservado.
  if p_input->'actual' is null or jsonb_typeof(p_input->'actual') <> 'number' then
    raise exception 'valor realizado obrigatorio e numerico' using errcode = 'invalid_parameter_value';
  end if;
  v_actual := (p_input->>'actual')::numeric;
  if p_input->'target' is not null and jsonb_typeof(p_input->'target') <> 'number' then
    raise exception 'meta invalida' using errcode = 'invalid_parameter_value';
  end if;
  v_target := coalesce((p_input->>'target')::numeric, v_version.target);

  -- Período YYYY-MM; ausência = mês corrente.
  v_period := coalesce(nullif(p_input->>'period', ''), to_char(now(), 'YYYY-MM'));
  if v_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'periodo invalido (use YYYY-MM)' using errcode = 'invalid_parameter_value';
  end if;

  -- Medição histórica + estado corrente na MESMA transação da função: ou os
  -- dois persistem, ou nenhum.
  insert into public.measurements (operation_id, indicator_version_id, period, target_value, actual_value, created_by)
  values (v_op, v_version.id, v_period, v_target, v_actual, auth.uid())
  on conflict (operation_id, indicator_version_id, period) do update set
    target_value = excluded.target_value,
    actual_value = excluded.actual_value,
    updated_at   = now();

  insert into public.indicator_results (
    operation_id, indicator_id, period, target, actual, diagnosis, observation, created_by
  ) values (
    v_op, v_def, v_period, v_target, v_actual,
    nullif(p_input->>'diagnosis', ''), nullif(p_input->>'observation', ''), auth.uid()
  )
  on conflict (operation_id, indicator_id, period) do update set
    previous_actual = public.indicator_results.actual,
    actual          = excluded.actual,
    target          = excluded.target,
    diagnosis       = coalesce(excluded.diagnosis, public.indicator_results.diagnosis),
    observation     = coalesce(excluded.observation, public.indicator_results.observation)
  returning id into v_id;

  return (
    select jsonb_build_object(
      'id', r.id, 'operationId', r.operation_id, 'indicatorId', r.indicator_id,
      'period', r.period, 'target', r.target::double precision, 'actual', r.actual::double precision,
      'previousActual', r.previous_actual::double precision, 'diagnosis', r.diagnosis,
      'observation', r.observation, 'updatedAt', r.updated_at
    ) from public.indicator_results r where r.id = v_id
  );
end $$;

revoke all on function public.save_indicator_result(jsonb) from public, anon;
grant execute on function public.save_indicator_result(jsonb) to authenticated;
