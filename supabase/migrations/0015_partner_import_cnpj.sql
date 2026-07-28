-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0015: CNPJ no importador de Parceiros AACE
-- =============================================================================
-- A 0014 deu CNPJ a `public.operations` e às RPCs de criação/edição, mas o
-- IMPORTADOR continuou ignorando o campo. Deixar assim repetiria o defeito que a
-- 0013 corrigiu no importador de usuários: um valor que sai da planilha, é aceito
-- na tela e desaparece em silêncio no servidor.
--
-- O ponto delicado aqui é que o parceiro passa a ter DUAS chaves naturais dentro
-- da unidade — o CNPJ e o escritório. Elas podem discordar, e discordância nunca
-- é resolvida por adivinhação: registros não são fundidos, CNPJ não é movido de
-- uma operação para outra, e a linha vira erro nominal.
--
-- Preservado: assinatura, grants, autorização, simulação sem escrita, isolamento
-- de erro POR LINHA (savepoint do bloco), auto-criação idempotente da estrutura
-- organizacional, resolução estrita de Coordenador/GC (E2), regra E4 de
-- coordenador titular, limite de 200 linhas e o formato geral do relatório.
--
-- Migrations 0001–0014 não são alteradas (§28).
-- =============================================================================

/** Exibição cadastral `00.000.000/0000-00`. Só para relatório; o banco guarda 14 dígitos. */
create or replace function app.format_cnpj(p text) returns text
  language sql immutable parallel safe
  set search_path = ''
as $$
  select case
    when app.normalize_cnpj(p) = '' then null
    when length(app.normalize_cnpj(p)) <> 14 then null
    else substr(app.normalize_cnpj(p),1,2) || '.' || substr(app.normalize_cnpj(p),3,3) || '.'
      || substr(app.normalize_cnpj(p),6,3) || '/' || substr(app.normalize_cnpj(p),9,4) || '-'
      || substr(app.normalize_cnpj(p),13,2)
  end
$$;

revoke all on function app.format_cnpj(text) from public, anon;
grant execute on function app.format_cnpj(text) to authenticated;

create or replace function public.admin_import_partners(p_rows jsonb, p_commit boolean) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_max constant int := 300;
  v_max_rows constant int := 200;
  v_row jsonb;
  v_index int;
  v_org_name text; v_region_name text; v_unit_name text; v_coordination_name text;
  v_partner text; v_office text; v_city text; v_state text;
  v_coord_email text; v_gc_email text;
  v_org_key text; v_region_key text; v_unit_key text; v_coordination_key text; v_office_key text;
  v_org_id uuid; v_region_id uuid; v_unit_id uuid; v_coordination_id uuid;
  v_existing_coordinator uuid;
  v_coord_id uuid; v_gc_id uuid; v_err text;
  v_op_id uuid;
  v_status text; v_action text;
  v_msgs jsonb; v_warns jsonb;
  v_seen text[] := '{}';
  v_seen_key text;
  v_new_orgs jsonb := '{}'::jsonb;
  v_new_regions jsonb := '{}'::jsonb;
  v_new_units jsonb := '{}'::jsonb;
  v_new_coordinations jsonb := '{}'::jsonb;
  v_report jsonb := '[]'::jsonb;
  v_total int := 0; v_inserted int := 0; v_updated int := 0; v_errors int := 0;
  v_created int;
  v_created_actual int := 0;
  v_rc int;
  -- Novos nesta migration:
  v_cnpj text;                -- somente dígitos, '' quando ausente
  v_tem_cnpj boolean;
  v_seen_cnpj text[] := '{}';
  v_op_by_cnpj uuid;
  v_op_by_office uuid;
  v_office_cnpj text;         -- CNPJ atual da operação achada pelo escritório
  v_cnpj_final text;          -- o que será gravado (pode ser o atual, no legado)
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
    v_status := 'ok'; v_action := 'insert';
    v_msgs := '[]'::jsonb; v_warns := '[]'::jsonb;
    v_op_id := null;
    v_org_id := null; v_region_id := null; v_unit_id := null; v_coordination_id := null;
    v_coord_id := null; v_gc_id := null;
    v_op_by_cnpj := null; v_op_by_office := null; v_office_cnpj := null; v_cnpj_final := null;

    begin
      v_org_name          := regexp_replace(btrim(coalesce(v_row->>'organizationName','')), '\s+', ' ', 'g');
      v_region_name       := regexp_replace(btrim(coalesce(v_row->>'regionName','')), '\s+', ' ', 'g');
      v_unit_name         := regexp_replace(btrim(coalesce(v_row->>'unitName','')), '\s+', ' ', 'g');
      v_coordination_name := regexp_replace(btrim(coalesce(v_row->>'coordinationName','')), '\s+', ' ', 'g');
      v_partner           := regexp_replace(btrim(coalesce(v_row->>'partnerName','')), '\s+', ' ', 'g');
      v_office            := regexp_replace(btrim(coalesce(v_row->>'officeName','')), '\s+', ' ', 'g');
      v_city              := regexp_replace(btrim(coalesce(v_row->>'city','')), '\s+', ' ', 'g');
      v_state             := upper(btrim(coalesce(v_row->>'state','')));
      v_coord_email       := lower(btrim(coalesce(v_row->>'coordinatorEmail','')));
      v_gc_email          := lower(btrim(coalesce(v_row->>'managerEmail','')));
      v_cnpj              := app.normalize_cnpj(coalesce(v_row->>'cnpj',''));
      v_tem_cnpj          := v_cnpj <> '';

      if v_org_name = ''          then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: organizacao'::text); end if;
      if v_region_name = ''       then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: regiao'::text); end if;
      if v_unit_name = ''         then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: unidade'::text); end if;
      if v_coordination_name = '' then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: coordenacao'::text); end if;
      if v_partner = ''           then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: empresa parceira'::text); end if;
      if v_office = ''            then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: escritorio'::text); end if;
      if v_city = ''              then v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: cidade'::text); end if;
      if v_state not in ('PR','SC') then
        v_msgs := v_msgs || to_jsonb(('Estado invalido: ' || coalesce(nullif(v_state,''),'(vazio)') || ' (esperado PR ou SC)')::text);
      end if;
      if length(v_org_name) > v_max or length(v_region_name) > v_max or length(v_unit_name) > v_max
         or length(v_coordination_name) > v_max or length(v_partner) > v_max
         or length(v_office) > v_max or length(v_city) > v_max then
        v_msgs := v_msgs || to_jsonb(('Campo excede o limite de ' || v_max || ' caracteres')::text);
      end if;
      -- CNPJ presente precisa ser VÁLIDO. A mensagem não devolve o valor
      -- recebido: entrada inválida pode ser qualquer coisa colada na célula.
      if v_tem_cnpj and not app.is_valid_cnpj(v_cnpj) then
        v_msgs := v_msgs || to_jsonb('CNPJ invalido'::text);
      end if;
      if v_coord_email = '' then
        v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: e-mail do coordenador'::text);
      elsif length(v_coord_email) > 254 or v_coord_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_msgs := v_msgs || to_jsonb(('E-mail de coordenador invalido: ' || v_coord_email)::text);
      end if;
      if v_gc_email = '' then
        v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: e-mail do GC'::text);
      elsif length(v_gc_email) > 254 or v_gc_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_msgs := v_msgs || to_jsonb(('E-mail de GC invalido: ' || v_gc_email)::text);
      end if;

      if jsonb_array_length(v_msgs) = 0 then
        v_org_key          := app.normalize_text(v_org_name);
        v_region_key       := v_org_key || '|' || app.normalize_text(v_region_name);
        v_unit_key         := v_region_key || '|' || app.normalize_text(v_unit_name);
        v_coordination_key := v_region_key || '|' || app.normalize_text(v_coordination_name);
        v_office_key       := app.normalize_text(v_office);

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

        v_existing_coordinator := null;
        if v_region_id is not null then
          select c.id, c.coordinator_user_id into v_coordination_id, v_existing_coordinator
            from public.coordinations c
           where c.region_id = v_region_id
             and app.normalize_text(c.name) = app.normalize_text(v_coordination_name);
        end if;
        if v_coordination_id is null and not (v_new_coordinations ? v_coordination_key) then
          v_new_coordinations := v_new_coordinations || jsonb_build_object(v_coordination_key, v_coordination_name);
        end if;

        select ru.user_id, ru.error_msg into v_coord_id, v_err
          from app.resolve_scoped_user(v_coord_email, 'coordinator'::app.role_code, 'Coordenador',
                                       v_region_id, v_region_name, v_coordination_id) ru;
        if v_coord_id is null then v_msgs := v_msgs || to_jsonb(v_err); end if;

        select ru.user_id, ru.error_msg into v_gc_id, v_err
          from app.resolve_scoped_user(v_gc_email, 'channel_manager'::app.role_code, 'GC',
                                       v_region_id, v_region_name, v_coordination_id) ru;
        if v_gc_id is null then v_msgs := v_msgs || to_jsonb(v_err); end if;

        if v_coordination_id is not null and v_coord_id is not null
           and v_existing_coordinator is not null and v_existing_coordinator <> v_coord_id then
          v_msgs := v_msgs || to_jsonb(('Coordenacao ' || v_coordination_name
            || ' ja possui coordenador diferente de ' || v_coord_email
            || ' — resolucao manual pelo ADMIN necessaria')::text);
        end if;

        -- Duplicidade DENTRO da planilha: escritório e, agora, CNPJ.
        v_seen_key := coalesce(v_unit_id::text, 'new:' || v_unit_key) || '#' || v_office_key;
        if v_seen_key = any(v_seen) then
          v_msgs := v_msgs || to_jsonb(('Escritorio duplicado na planilha: ' || v_office
            || ' (unidade ' || v_unit_name || ')')::text);
        else
          v_seen := v_seen || v_seen_key;
        end if;

        if v_tem_cnpj then
          v_seen_key := coalesce(v_unit_id::text, 'new:' || v_unit_key) || '#' || v_cnpj;
          if v_seen_key = any(v_seen_cnpj) then
            v_msgs := v_msgs || to_jsonb(('CNPJ duplicado na planilha para a unidade ' || v_unit_name)::text);
          else
            v_seen_cnpj := v_seen_cnpj || v_seen_key;
          end if;
        end if;

        -- ------------------------------------------------------------------
        -- Resolução pelas DUAS chaves naturais da unidade.
        -- ------------------------------------------------------------------
        if v_unit_id is not null then
          if v_tem_cnpj then
            select o.id into v_op_by_cnpj from public.operations o
             where o.unit_id = v_unit_id and o.cnpj = v_cnpj;
          end if;
          select o.id, o.cnpj into v_op_by_office, v_office_cnpj
            from public.operations o
           where o.unit_id = v_unit_id
             and app.normalize_text(o.office_name) = v_office_key;
        end if;

        if v_op_by_cnpj is not null and v_op_by_office is not null
           and v_op_by_cnpj <> v_op_by_office then
          -- Cada chave aponta para uma operação diferente. Fundir registros ou
          -- transferir o CNPJ seria decidir por conta própria qual dos dois
          -- cadastros está certo — recusamos e devolvemos para o ADMIN.
          v_msgs := v_msgs || to_jsonb(('Conflito: o CNPJ e o escritorio '
            || v_office || ' apontam para parceiros diferentes na unidade '
            || v_unit_name || ' — resolucao manual pelo ADMIN necessaria')::text);
        elsif v_op_by_cnpj is not null then
          v_op_id := v_op_by_cnpj;
          v_cnpj_final := v_cnpj;
        elsif v_op_by_office is not null then
          v_op_id := v_op_by_office;
          if v_tem_cnpj then
            if v_office_cnpj is not null and v_office_cnpj <> v_cnpj then
              -- O escritório já tem outro CNPJ gravado. Sobrescrever trocaria a
              -- identidade da empresa sem ninguém pedir.
              v_msgs := v_msgs || to_jsonb(('Conflito: o escritorio ' || v_office
                || ' ja esta cadastrado com outro CNPJ — resolucao manual pelo ADMIN necessaria')::text);
            else
              v_cnpj_final := v_cnpj;  -- preenche legado ou confirma o mesmo
            end if;
          else
            v_cnpj_final := v_office_cnpj;  -- linha antiga: preserva o atual
            if v_office_cnpj is null then
              v_warns := v_warns || to_jsonb('Registro legado ainda sem CNPJ.'::text);
            end if;
          end if;
        else
          -- Nenhuma chave encontrou operação: é INSERÇÃO, e aí o CNPJ é exigido.
          if not v_tem_cnpj then
            v_msgs := v_msgs || to_jsonb('CNPJ obrigatorio para novo parceiro'::text);
          else
            v_cnpj_final := v_cnpj;
          end if;
        end if;

        if v_op_id is not null and jsonb_array_length(v_msgs) = 0 then
          v_status := 'duplicate';
          v_action := 'update';
        end if;
      end if;

      if jsonb_array_length(v_msgs) > 0 then
        v_status := 'error';
        v_action := 'none';
        v_op_id := null;
        v_errors := v_errors + 1;
      else
        if p_commit then
          if v_org_id is null then
            insert into public.organizations (name) values (v_org_name)
              on conflict ((app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select o.id into v_org_id from public.organizations o
             where app.normalize_text(o.name) = v_org_key;
          end if;
          if v_region_id is null then
            insert into public.regions (organization_id, name) values (v_org_id, v_region_name)
              on conflict (organization_id, (app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select r.id into v_region_id from public.regions r
             where r.organization_id = v_org_id
               and app.normalize_text(r.name) = app.normalize_text(v_region_name);
          end if;
          if v_unit_id is null then
            insert into public.units (region_id, name) values (v_region_id, v_unit_name)
              on conflict (region_id, (app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select u.id into v_unit_id from public.units u
             where u.region_id = v_region_id
               and app.normalize_text(u.name) = app.normalize_text(v_unit_name);
          end if;
          if v_coordination_id is null then
            insert into public.coordinations (region_id, name, coordinator_user_id)
              values (v_region_id, v_coordination_name, v_coord_id)
              on conflict (region_id, (app.normalize_text(name))) do nothing;
            get diagnostics v_rc = row_count;
            v_created_actual := v_created_actual + v_rc;
            select c.id, c.coordinator_user_id into v_coordination_id, v_existing_coordinator
              from public.coordinations c
             where c.region_id = v_region_id
               and app.normalize_text(c.name) = app.normalize_text(v_coordination_name);
            if v_existing_coordinator is not null and v_existing_coordinator <> v_coord_id then
              raise exception 'Coordenacao % ja possui coordenador diferente de %',
                v_coordination_name, v_coord_email using errcode = 'check_violation';
            end if;
          elsif v_existing_coordinator is null then
            update public.coordinations set coordinator_user_id = v_coord_id
             where id = v_coordination_id and coordinator_user_id is null;
          end if;

          -- Reresolução com a unidade REAL (pode ter nascido agora). Repete as
          -- duas chaves: se a unidade é nova, nenhuma acha nada e cai no insert.
          v_op_by_cnpj := null; v_op_by_office := null; v_office_cnpj := null;
          if v_tem_cnpj then
            select o.id into v_op_by_cnpj from public.operations o
             where o.unit_id = v_unit_id and o.cnpj = v_cnpj;
          end if;
          select o.id, o.cnpj into v_op_by_office, v_office_cnpj
            from public.operations o
           where o.unit_id = v_unit_id
             and app.normalize_text(o.office_name) = v_office_key;

          if v_op_by_cnpj is not null and v_op_by_office is not null
             and v_op_by_cnpj <> v_op_by_office then
            raise exception 'Conflito: CNPJ e escritorio % apontam para parceiros diferentes', v_office
              using errcode = 'check_violation';
          end if;
          v_op_id := coalesce(v_op_by_cnpj, v_op_by_office);

          if v_op_id is null then
            insert into public.operations
              (unit_id, coordination_id, partner_name, office_name, city, state,
               channel_manager_user_id, active, cnpj)
            values
              (v_unit_id, v_coordination_id, v_partner, v_office, v_city, v_state,
               v_gc_id, true, v_cnpj_final)
            returning id into v_op_id;
            v_status := 'ok'; v_action := 'insert';
            v_inserted := v_inserted + 1;
          else
            -- Trocar o escritório de uma operação achada pelo CNPJ não pode
            -- colidir com outra operação da mesma unidade (índice antigo).
            if v_op_by_cnpj is not null and exists (
                  select 1 from public.operations o
                   where o.unit_id = v_unit_id
                     and app.normalize_text(o.office_name) = v_office_key
                     and o.id <> v_op_id) then
              raise exception 'Escritorio % ja pertence a outro parceiro nesta unidade', v_office
                using errcode = 'unique_violation';
            end if;
            update public.operations set
              coordination_id = v_coordination_id,
              partner_name = v_partner,
              office_name = v_office,
              city = v_city,
              state = v_state,
              channel_manager_user_id = v_gc_id,
              cnpj = coalesce(v_cnpj_final, cnpj)
            where id = v_op_id;
            v_status := 'duplicate'; v_action := 'update';
            v_updated := v_updated + 1;
          end if;

          perform app.sync_operation_assignment(v_op_id, v_gc_id);
        else
          if v_status = 'ok' then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
        end if;
      end if;

    exception when others then
      -- Isolamento por linha (E8): erro inesperado vira relatorio, e o bloco
      -- (savepoint implicito do plpgsql) desfaz apenas as escritas DESTA linha.
      v_status := 'error';
      v_action := 'none';
      v_op_id := null;
      v_msgs := v_msgs || to_jsonb(('Erro na linha: ' || sqlerrm)::text);
      v_errors := v_errors + 1;
    end;

    v_report := v_report || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'officeName', v_office,
      'partnerName', v_partner,
      -- Formatado quando válido; null quando ausente. Entrada inválida NÃO é
      -- devolvida — `format_cnpj` só formata o que tem 14 dígitos.
      'cnpj', app.format_cnpj(v_cnpj_final),
      'status', v_status,
      'action', v_action,
      'operationId', v_op_id,
      'messages', v_msgs,
      'warnings', v_warns));
  end loop;

  if p_commit then
    v_created := v_created_actual;
  else
    v_created :=
        (select count(*)::int from jsonb_object_keys(v_new_orgs))
      + (select count(*)::int from jsonb_object_keys(v_new_regions))
      + (select count(*)::int from jsonb_object_keys(v_new_units))
      + (select count(*)::int from jsonb_object_keys(v_new_coordinations));
  end if;

  return jsonb_build_object(
    'mode', case when p_commit then 'commit' else 'simulate' end,
    'counters', jsonb_build_object(
      'total', v_total,
      'inserted', v_inserted,
      'updated', v_updated,
      'errors', v_errors,
      'createdEntities', v_created),
    'toCreate', jsonb_build_object(
      'organizations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_orgs)), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_regions)), '[]'::jsonb),
      'units', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_units)), '[]'::jsonb),
      'coordinations', coalesce((select jsonb_agg(value order by value) from jsonb_each_text(v_new_coordinations)), '[]'::jsonb)),
    'rows', v_report);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões — idênticas às da 0009.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_import_partners(jsonb, boolean) from public, anon;
grant execute on function public.admin_import_partners(jsonb, boolean) to authenticated;
