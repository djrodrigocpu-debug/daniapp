-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0018: bootstrap da estrutura organizacional
-- =============================================================================
-- DEPENDÊNCIA CIRCULAR num banco vazio, confirmada em runtime contra o staging:
--
--   - admin_import_users (0010) recusa criar um usuário regional/coordinator/
--     channel_manager se a REGIÃO/COORDENAÇÃO nomeada na planilha ainda não
--     existir em public.regions/public.coordinations;
--   - import_partners_core (0016) É quem cria essa estrutura como efeito
--     colateral do import de Parceiros AACE — mas só grava QUALQUER COISA da
--     linha (inclusive a própria região) depois de resolver com sucesso o
--     Coordenador e o Gerente de Canal via app.resolve_scoped_user, que exige
--     um public.users já existente com escopo ativo daquele papel.
--
-- Ou seja: usuário de papel regional/coordinator/channel_manager precisa da
-- estrutura para nascer; a estrutura precisa desses usuários para nascer.
-- Nenhum RPC hoje cria organizations/regions/units/coordinations fora do
-- import de Parceiros (única ocorrência de INSERT nessas quatro tabelas em
-- todo o schema, conferido em 0001–0017).
--
-- Esta migration quebra o ciclo com um RPC administrativo estreito: cria
-- SOMENTE organization/region/unit/coordination, sem depender de nenhum
-- usuário, parceiro ou identidade — coordinator_user_id nasce NULL. O próprio
-- import_partners_core (0016, linhas do bloco de commit) já reconcilia esse
-- campo quando a coordenação é reaproveitada e o UPDATE alvo é
-- `coordinator_user_id is null`; e já RECUSA (na fase de validação, antes de
-- qualquer escrita) substituir um coordenador diferente do já vinculado. Esta
-- migration não precisa alterar esse comportamento — só prová-lo com teste.
--
-- Reaproveita a MESMA normalização e os MESMOS índices únicos normalizados de
-- 0009 (app.normalize_text, organizations_name_norm_uidx e equivalentes), para
-- que o bootstrap e o import de Parceiros enxerguem exatamente as mesmas
-- linhas — idempotência compartilhada, não duas verdades sobre o mesmo dado.
--
-- Migrations 0001–0017 não são alteradas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Núcleo: valida e, se p_commit, grava. Espelha a forma de
-- app.import_partners_core (0016) — mesma normalização, mesmo padrão de
-- relatório por linha — mas SEM tocar em coordenador, parceiro, usuário,
-- identidade Auth, escopo ou onboarding.
-- ---------------------------------------------------------------------------
create or replace function app.bootstrap_organizational_structure(
  p_rows jsonb, p_commit boolean
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_max constant int := 300;
  v_max_rows constant int := 200;
  v_row jsonb;
  v_index int;
  v_org_name text; v_region_name text; v_unit_name text; v_coordination_name text;
  v_active boolean;
  v_org_key text; v_region_key text; v_unit_key text; v_coordination_key text;
  v_org_id uuid; v_region_id uuid; v_unit_id uuid; v_coordination_id uuid;
  v_status text; v_action text;
  v_msgs jsonb;
  v_report jsonb := '[]'::jsonb;
  v_total int := 0; v_created int := 0; v_reused int := 0; v_errors int := 0;
  v_rc int;
  v_new_orgs jsonb := '{}'::jsonb;
  v_new_regions jsonb := '{}'::jsonb;
  v_new_units jsonb := '{}'::jsonb;
  v_new_coordinations jsonb := '{}'::jsonb;
  -- Chave de duplicata DENTRO do lote: mesma unidade+coordenação pedida duas
  -- vezes na mesma chamada é um conflito estrutural do próprio lote, não do
  -- banco — recusado por linha, sem gravar nada daquela linha.
  v_seen text[] := '{}';
  v_seen_key text;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'payload invalido: esperado array de linhas' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'lote excede o limite de % linhas', v_max_rows using errcode = 'check_violation';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_index := coalesce((v_row->>'index')::int, v_total);
    v_status := 'ok'; v_action := 'none';
    v_msgs := '[]'::jsonb;
    v_org_id := null; v_region_id := null; v_unit_id := null; v_coordination_id := null;

    begin
      v_org_name          := regexp_replace(btrim(coalesce(v_row->>'organization','')), '\s+', ' ', 'g');
      v_region_name       := regexp_replace(btrim(coalesce(v_row->>'region','')), '\s+', ' ', 'g');
      v_unit_name         := regexp_replace(btrim(coalesce(v_row->>'unit','')), '\s+', ' ', 'g');
      v_coordination_name := regexp_replace(btrim(coalesce(v_row->>'coordination','')), '\s+', ' ', 'g');
      -- Ausente ⇒ true, igual ao default da coluna — planilha antiga sem a
      -- coluna Ativo continua sendo lida.
      v_active            := coalesce((v_row->>'active')::boolean, true);

      if v_org_name = ''          then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: organization'::text); end if;
      if v_region_name = ''       then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: region'::text); end if;
      if v_unit_name = ''         then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: unit'::text); end if;
      if v_coordination_name = '' then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: coordination'::text); end if;
      if length(v_org_name) > v_max or length(v_region_name) > v_max
         or length(v_unit_name) > v_max or length(v_coordination_name) > v_max then
        v_msgs := v_msgs || to_jsonb(('Campo excede o limite de ' || v_max || ' caracteres')::text);
      end if;

      if jsonb_array_length(v_msgs) = 0 then
        v_org_key          := app.normalize_text(v_org_name);
        v_region_key       := v_org_key || '|' || app.normalize_text(v_region_name);
        v_unit_key         := v_region_key || '|' || app.normalize_text(v_unit_name);
        v_coordination_key := v_region_key || '|' || app.normalize_text(v_coordination_name);

        v_seen_key := v_unit_key || '#' || v_coordination_key;
        if v_seen_key = any(v_seen) then
          v_msgs := v_msgs || to_jsonb(('Linha duplicada no lote: ' || v_unit_name || ' / ' || v_coordination_name)::text);
        else
          v_seen := v_seen || v_seen_key;
        end if;
      end if;

      if jsonb_array_length(v_msgs) = 0 then
        -- Mesma ordem de resolução de app.import_partners_core: organização →
        -- região → unidade → coordenação, cada uma reaproveitada se já existir
        -- (via o MESMO índice único normalizado que o import de Parceiros usa).
        select o.id into v_org_id from public.organizations o
         where app.normalize_text(o.name) = v_org_key;
        if v_org_id is null and not (v_new_orgs ? v_org_key) then
          v_new_orgs := v_new_orgs || jsonb_build_object(v_org_key, v_org_name);
        end if;

        if v_org_id is not null then
          select r.id into v_region_id from public.regions r
           where r.organization_id = v_org_id
             and app.normalize_text(r.name) = app.normalize_text(v_region_name);
        end if;
        if v_region_id is null and not (v_new_regions ? v_region_key) then
          v_new_regions := v_new_regions || jsonb_build_object(v_region_key, v_region_name);
        end if;

        if v_region_id is not null then
          select u.id into v_unit_id from public.units u
           where u.region_id = v_region_id
             and app.normalize_text(u.name) = app.normalize_text(v_unit_name);
        end if;
        if v_unit_id is null and not (v_new_units ? v_unit_key) then
          v_new_units := v_new_units || jsonb_build_object(v_unit_key, v_unit_name);
        end if;

        if v_region_id is not null then
          select c.id into v_coordination_id from public.coordinations c
           where c.region_id = v_region_id
             and app.normalize_text(c.name) = app.normalize_text(v_coordination_name);
        end if;
        if v_coordination_id is null and not (v_new_coordinations ? v_coordination_key) then
          v_new_coordinations := v_new_coordinations || jsonb_build_object(v_coordination_key, v_coordination_name);
        end if;

        if v_org_id is not null and v_region_id is not null
           and v_unit_id is not null and v_coordination_id is not null then
          v_status := 'reused';
        end if;
      end if;

      if jsonb_array_length(v_msgs) > 0 then
        v_status := 'error';
        v_action := 'none';
        v_errors := v_errors + 1;
      elsif p_commit then
        if v_org_id is null then
          insert into public.organizations (name, active) values (v_org_name, v_active)
            on conflict ((app.normalize_text(name))) do nothing;
          get diagnostics v_rc = row_count;
          if v_rc > 0 then v_created := v_created + 1; v_action := 'insert'; end if;
          select o.id into v_org_id from public.organizations o
           where app.normalize_text(o.name) = v_org_key;
        end if;

        if v_region_id is null then
          insert into public.regions (organization_id, name, active) values (v_org_id, v_region_name, v_active)
            on conflict (organization_id, (app.normalize_text(name))) do nothing;
          get diagnostics v_rc = row_count;
          if v_rc > 0 then v_created := v_created + 1; v_action := 'insert'; end if;
          select r.id into v_region_id from public.regions r
           where r.organization_id = v_org_id
             and app.normalize_text(r.name) = app.normalize_text(v_region_name);
        end if;

        if v_unit_id is null then
          insert into public.units (region_id, name, active) values (v_region_id, v_unit_name, v_active)
            on conflict (region_id, (app.normalize_text(name))) do nothing;
          get diagnostics v_rc = row_count;
          if v_rc > 0 then v_created := v_created + 1; v_action := 'insert'; end if;
          select u.id into v_unit_id from public.units u
           where u.region_id = v_region_id
             and app.normalize_text(u.name) = app.normalize_text(v_unit_name);
        end if;

        if v_coordination_id is null then
          -- coordinator_user_id NASCE NULL, sempre. Só o import de Parceiros
          -- (0016) preenche depois — e só quando ainda estiver NULL.
          insert into public.coordinations (region_id, name, active, coordinator_user_id)
            values (v_region_id, v_coordination_name, v_active, null)
            on conflict (region_id, (app.normalize_text(name))) do nothing;
          get diagnostics v_rc = row_count;
          if v_rc > 0 then v_created := v_created + 1; v_action := 'insert'; end if;
          select c.id into v_coordination_id from public.coordinations c
           where c.region_id = v_region_id
             and app.normalize_text(c.name) = app.normalize_text(v_coordination_name);
        end if;

        v_status := case when v_action = 'insert' then 'ok' else 'reused' end;
        if v_action <> 'insert' then v_reused := v_reused + 1; end if;
      end if;

    exception when others then
      v_status := 'error';
      v_action := 'none';
      v_msgs := v_msgs || to_jsonb(('Erro na linha: ' || sqlerrm)::text);
      v_errors := v_errors + 1;
    end;

    v_report := v_report || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'organization', v_org_name,
      'region', v_region_name,
      'unit', v_unit_name,
      'coordination', v_coordination_name,
      'status', v_status,
      'action', v_action,
      'messages', v_msgs));
  end loop;

  return jsonb_build_object(
    'mode', case when p_commit then 'commit' else 'simulate' end,
    'counters', jsonb_build_object(
      'total', v_total, 'created', v_created, 'reused', v_reused, 'errors', v_errors),
    'toCreate', jsonb_build_object(
      'organizations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_orgs)), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_regions)), '[]'::jsonb),
      'units', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_units)), '[]'::jsonb),
      'coordinations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_coordinations)), '[]'::jsonb)),
    'rows', v_report);
end $$;

-- ---------------------------------------------------------------------------
-- RPC pública. p_commit=false por default: chamar sem o segundo argumento
-- nunca escreve — o mesmo hábito seguro de admin_import_partners/
-- admin_bootstrap_partners (0016).
-- ---------------------------------------------------------------------------
create or replace function public.admin_bootstrap_organizational_structure(
  p_rows jsonb, p_commit boolean default false
) returns jsonb
  language sql security definer
  set search_path = public, app
as $$
  select app.bootstrap_organizational_structure(p_rows, p_commit)
$$;

comment on function public.admin_bootstrap_organizational_structure(jsonb, boolean) is
  'Bootstrap administrativo de organization/region/unit/coordination, sem depender de usuário, parceiro ou identidade Auth. Quebra a dependência circular entre admin_import_users e import_partners_core num banco vazio (migration 0018).';

revoke all on function app.bootstrap_organizational_structure(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.admin_bootstrap_organizational_structure(jsonb, boolean) from public, anon;
grant execute on function public.admin_bootstrap_organizational_structure(jsonb, boolean) to authenticated;
