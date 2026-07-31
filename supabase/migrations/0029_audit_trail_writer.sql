-- =============================================================================
-- AAPEX 1.3.1 — Migration 0029: trilha de auditoria operante (D-01)
-- =============================================================================
-- DEFEITO OBSERVADO. Depois de uma simulação de 30 dias com avaliações criadas,
-- enviadas, devolvidas e aprovadas, planos abertos e validados, indicadores
-- medidos e usuários provisionados, `public.audit_logs` continuava com ZERO
-- registros. A tabela existia desde a 0001, tinha índices e tinha proteção
-- contra alteração e exclusão (0003) — só não tinha quem escrevesse nela.
--
-- POR QUE GATILHO E NÃO RPC. Instrumentar cada RPC exigiria reescrever o corpo
-- de mais de uma dúzia de funções vivas só para acrescentar uma linha em cada;
-- foi exatamente uma reescrita dessas que fez a guarda de envio desaparecer
-- (D-04). O gatilho, além de não tocar em regra de negócio nenhuma, é mais
-- verdadeiro: lê o registro REAL depois de gravado, participa da MESMA
-- transação (transação abortada não deixa log de sucesso) e pega também a
-- escrita que não passou por RPC.
--
-- Um gatilho por tabela e por fato, para que nenhum evento seja registrado duas
-- vezes. Onde o estado da avaliação já conta a história (a linha em
-- `validations`, por exemplo), não há gatilho — seria o mesmo fato contado de
-- novo.
--
-- O QUE NÃO É REGISTRADO. Nenhuma leitura. Nenhum conteúdo de resposta, de
-- evidência ou de documento. Nenhum e-mail, nome, senha, token ou chave. O
-- `metadata` carrega identificadores e transições de estado — o suficiente para
-- reconstruir quem fez o quê, em qual objeto e quando, e nada além disso.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- O gravador
-- ---------------------------------------------------------------------------
-- `security definer` é indispensável aqui: `audit_logs` deixa de aceitar escrita
-- do cliente (ver adiante), então só um gravador com o privilégio do dono pode
-- inserir. O ator NUNCA é parâmetro — vem sempre de `auth.uid()`, e por isso não
-- há como o cliente atribuir a ação a outra pessoa.
--
-- `actor_user_id` tem FK para `public.users`. Um `auth.uid()` que ainda não tem
-- perfil na aplicação (ou uma escrita de migration/seed, sem JWT) gravaria ator
-- inexistente e derrubaria a transação EMPRESARIAL por causa do log — o log
-- nunca pode ser o motivo de uma operação legítima falhar. Nesse caso o ator
-- fica nulo, que é a verdade: não foi um usuário da aplicação.
create or replace function app.write_audit(
  p_event text, p_object_type text, p_object_id text, p_metadata jsonb
) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_actor uuid;
begin
  v_actor := auth.uid();
  if v_actor is not null and not exists (select 1 from public.users u where u.id = v_actor) then
    v_actor := null;
  end if;

  insert into public.audit_logs (actor_user_id, event, object_type, object_id, result, metadata)
  values (v_actor, p_event, p_object_type, p_object_id, 'success', p_metadata);
end $$;

-- ---------------------------------------------------------------------------
-- Avaliações — criação e cada transição de estado
-- ---------------------------------------------------------------------------
create or replace function app.audit_evaluation() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare v_event text;
begin
  if tg_op = 'INSERT' then
    perform app.write_audit('evaluation.created', 'evaluation', new.id::text,
      jsonb_build_object('operationId', new.operation_id, 'frequency', new.frequency,
                         'status', new.status::text));
    return null;
  end if;

  -- Só a mudança de ESTADO é fato auditável; salvar resposta não é.
  if new.status is not distinct from old.status then return null; end if;

  v_event := case new.status::text
    when 'submitted' then 'evaluation.submitted'
    when 'returned'  then 'evaluation.returned'
    when 'approved'  then 'evaluation.approved'
    else 'evaluation.status_changed'
  end;

  perform app.write_audit(v_event, 'evaluation', new.id::text,
    jsonb_build_object('operationId', new.operation_id,
                       'from', old.status::text, 'to', new.status::text));
  return null;
end $$;

drop trigger if exists trg_audit_evaluation_insert on public.evaluations;
create trigger trg_audit_evaluation_insert after insert on public.evaluations
  for each row execute function app.audit_evaluation();
drop trigger if exists trg_audit_evaluation_update on public.evaluations;
create trigger trg_audit_evaluation_update after update on public.evaluations
  for each row execute function app.audit_evaluation();

-- ---------------------------------------------------------------------------
-- Snapshot oficial — o registro que congela o resultado
-- ---------------------------------------------------------------------------
create or replace function app.audit_snapshot() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  -- `payload` guarda a avaliação inteira e NÃO entra no log: só os ponteiros.
  perform app.write_audit('snapshot.created', 'official_snapshot', new.id::text,
    jsonb_build_object('evaluationId', new.evaluation_id, 'operationId', new.operation_id,
                       'period', new.period));
  return null;
end $$;

drop trigger if exists trg_audit_snapshot on public.official_snapshots;
create trigger trg_audit_snapshot after insert on public.official_snapshots
  for each row execute function app.audit_snapshot();

-- ---------------------------------------------------------------------------
-- Planos de ação — criação, mudança de estado e validação
-- ---------------------------------------------------------------------------
create or replace function app.audit_action_plan() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    perform app.write_audit('action_plan.created', 'action_plan', new.id::text,
      jsonb_build_object('operationId', new.operation_id, 'evaluationId', new.evaluation_id,
                         'status', new.status::text));
    return null;
  end if;

  -- A validação é o fato mais forte da atualização: quando ela acontece, é ela
  -- que fica registrada — não duas linhas para o mesmo UPDATE.
  if old.validated_at is null and new.validated_at is not null then
    perform app.write_audit('action_plan.validated', 'action_plan', new.id::text,
      jsonb_build_object('operationId', new.operation_id, 'status', new.status::text));
    return null;
  end if;

  if new.status is distinct from old.status then
    perform app.write_audit('action_plan.status_changed', 'action_plan', new.id::text,
      jsonb_build_object('operationId', new.operation_id,
                         'from', old.status::text, 'to', new.status::text));
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_action_plan_insert on public.action_plans;
create trigger trg_audit_action_plan_insert after insert on public.action_plans
  for each row execute function app.audit_action_plan();
drop trigger if exists trg_audit_action_plan_update on public.action_plans;
create trigger trg_audit_action_plan_update after update on public.action_plans
  for each row execute function app.audit_action_plan();

-- ---------------------------------------------------------------------------
-- Indicadores — resultado e medição
-- ---------------------------------------------------------------------------
create or replace function app.audit_indicator_result() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  perform app.write_audit(
    case tg_op when 'INSERT' then 'indicator_result.created' else 'indicator_result.updated' end,
    'indicator_result', new.id::text,
    jsonb_build_object('operationId', new.operation_id, 'indicatorId', new.indicator_id,
                       'period', new.period));
  return null;
end $$;

drop trigger if exists trg_audit_indicator_result on public.indicator_results;
create trigger trg_audit_indicator_result after insert or update on public.indicator_results
  for each row execute function app.audit_indicator_result();

create or replace function app.audit_measurement() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  perform app.write_audit(
    case tg_op when 'INSERT' then 'measurement.created' else 'measurement.updated' end,
    'measurement', new.id::text,
    jsonb_build_object('operationId', new.operation_id,
                       'indicatorVersionId', new.indicator_version_id, 'period', new.period));
  return null;
end $$;

drop trigger if exists trg_audit_measurement on public.measurements;
create trigger trg_audit_measurement after insert or update on public.measurements
  for each row execute function app.audit_measurement();

-- ---------------------------------------------------------------------------
-- Catálogo de indicadores — mudança de definição e de versão pelo Administrador
-- ---------------------------------------------------------------------------
create or replace function app.audit_indicator_definition() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    perform app.write_audit('indicator_definition.created', 'indicator_definition', new.id::text,
      jsonb_build_object('code', new.code, 'lifecycle', new.lifecycle::text));
    return null;
  end if;
  if new.lifecycle is distinct from old.lifecycle or new.code is distinct from old.code
     or new.name is distinct from old.name then
    perform app.write_audit('indicator_definition.updated', 'indicator_definition', new.id::text,
      jsonb_build_object('code', new.code,
                         'lifecycleFrom', old.lifecycle::text, 'lifecycleTo', new.lifecycle::text));
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_indicator_definition_insert on public.indicator_definitions;
create trigger trg_audit_indicator_definition_insert after insert on public.indicator_definitions
  for each row execute function app.audit_indicator_definition();
drop trigger if exists trg_audit_indicator_definition_update on public.indicator_definitions;
create trigger trg_audit_indicator_definition_update after update on public.indicator_definitions
  for each row execute function app.audit_indicator_definition();

create or replace function app.audit_indicator_version() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  perform app.write_audit('indicator_version.created', 'indicator_version', new.id::text,
    jsonb_build_object('definitionId', new.definition_id, 'versionNumber', new.version_number));
  return null;
end $$;

drop trigger if exists trg_audit_indicator_version on public.indicator_versions;
create trigger trg_audit_indicator_version after insert on public.indicator_versions
  for each row execute function app.audit_indicator_version();

-- ---------------------------------------------------------------------------
-- Administração — usuário, papel/escopo e Parceiro AACE
-- ---------------------------------------------------------------------------
-- NADA de nome ou e-mail no log: identidade fica pelo UUID, que já é a chave
-- usada em todo o resto do sistema.
create or replace function app.audit_user() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    perform app.write_audit('user.provisioned', 'user', new.id::text,
      jsonb_build_object('status', new.status::text));
    return null;
  end if;
  if new.status is distinct from old.status then
    perform app.write_audit('user.status_changed', 'user', new.id::text,
      jsonb_build_object('from', old.status::text, 'to', new.status::text));
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_user_insert on public.users;
create trigger trg_audit_user_insert after insert on public.users
  for each row execute function app.audit_user();
drop trigger if exists trg_audit_user_update on public.users;
create trigger trg_audit_user_update after update on public.users
  for each row execute function app.audit_user();

-- Papel e escopo vivem em `user_scopes`: é aqui que "papel alterado" e "escopo
-- alterado" acontecem de fato.
create or replace function app.audit_user_scope() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'DELETE' then
    perform app.write_audit('user.scope_revoked', 'user_scope', old.id::text,
      jsonb_build_object('userId', old.user_id, 'role', old.role::text));
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform app.write_audit('user.scope_granted', 'user_scope', new.id::text,
      jsonb_build_object('userId', new.user_id, 'role', new.role::text, 'active', new.active,
                         'regionId', new.region_id, 'coordinationId', new.coordination_id,
                         'unitId', new.unit_id));
    return null;
  end if;
  if new.role is distinct from old.role or new.active is distinct from old.active
     or new.region_id is distinct from old.region_id
     or new.coordination_id is distinct from old.coordination_id
     or new.unit_id is distinct from old.unit_id then
    perform app.write_audit('user.scope_changed', 'user_scope', new.id::text,
      jsonb_build_object('userId', new.user_id,
                         'roleFrom', old.role::text, 'roleTo', new.role::text,
                         'activeFrom', old.active, 'activeTo', new.active));
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_user_scope_insert on public.user_scopes;
create trigger trg_audit_user_scope_insert after insert on public.user_scopes
  for each row execute function app.audit_user_scope();
drop trigger if exists trg_audit_user_scope_update on public.user_scopes;
create trigger trg_audit_user_scope_update after update on public.user_scopes
  for each row execute function app.audit_user_scope();
drop trigger if exists trg_audit_user_scope_delete on public.user_scopes;
create trigger trg_audit_user_scope_delete after delete on public.user_scopes
  for each row execute function app.audit_user_scope();

create or replace function app.audit_operation() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    perform app.write_audit('operation.created', 'operation', new.id::text,
      jsonb_build_object('unitId', new.unit_id, 'coordinationId', new.coordination_id,
                         'active', new.active));
    return null;
  end if;
  -- `updated_at` sozinho não é fato: registra o que muda a identidade do
  -- Parceiro, sua lotação, seu responsável ou sua vigência.
  if new.active is distinct from old.active
     or new.coordination_id is distinct from old.coordination_id
     or new.unit_id is distinct from old.unit_id
     or new.channel_manager_user_id is distinct from old.channel_manager_user_id
     or new.partner_name is distinct from old.partner_name
     or new.cnpj is distinct from old.cnpj then
    perform app.write_audit('operation.updated', 'operation', new.id::text,
      jsonb_build_object('activeFrom', old.active, 'activeTo', new.active,
                         'coordinationId', new.coordination_id, 'unitId', new.unit_id));
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_operation_insert on public.operations;
create trigger trg_audit_operation_insert after insert on public.operations
  for each row execute function app.audit_operation();
drop trigger if exists trg_audit_operation_update on public.operations;
create trigger trg_audit_operation_update after update on public.operations
  for each row execute function app.audit_operation();

-- ---------------------------------------------------------------------------
-- A trilha deixa de aceitar escrita do cliente
-- ---------------------------------------------------------------------------
-- `audit_insert` era `with check (true)`: qualquer autenticado podia inserir
-- qualquer linha, inclusive atribuindo a ação a outra pessoa — uma trilha que
-- aceita log forjado não serve como trilha. Quem escreve agora é só o gravador
-- `security definer`, que carimba `auth.uid()`.
--
-- A leitura (`audit_read`: o próprio ator, Administrador ou Gerência Regional) e
-- a imutabilidade (`trg_audit_no_update` / `trg_audit_no_delete`, da 0003)
-- continuam exatamente como estavam.
drop policy if exists audit_insert on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated, anon;

-- O gravador só é chamado de dentro dos gatilhos, que rodam como dono: nenhum
-- grant para o cliente.
revoke all on function app.write_audit(text, text, text, jsonb) from public, anon, authenticated;
