-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0013: semântica real do campo `active`
-- =============================================================================
-- DEFEITO CORRIGIDO: `public.admin_import_users` (0010) NUNCA leu `active` da
-- linha. O corpo gravava, incondicionalmente:
--
--     insert into public.users (..., status) values (..., 'invited');
--     update public.user_scopes set active = false, valid_to = now() ...;
--     insert into public.user_scopes (...) values (...);   -- SEMPRE ativo
--
-- Com o provisionamento por senha (identidade criada com `email_confirm`), o
-- perfil 'invited' era promovido a 'active' por
-- `admin_activate_confirmed_users` logo em seguida. Resultado: uma planilha com
-- "Ativo = Não" produzia usuário ATIVO com escopo VIGENTE — o oposto do pedido,
-- e de forma silenciosa. Desativar alguém é decisão de segurança; ser ignorada
-- é o pior desfecho possível.
--
-- Esta migration substitui APENAS o corpo da função, com a mesma assinatura,
-- os mesmos grants e o mesmo contrato de saída (acrescido de dois campos por
-- linha). A 0010 é histórica e NÃO é alterada (§28). Nenhuma tabela, coluna,
-- índice ou política é criada, alterada ou removida — a migration é puramente
-- comportamental e reversível reaplicando o corpo da 0010.
--
-- `admin_activate_confirmed_users` NÃO precisou mudar: ela só promove
-- `status = 'invited'`, então 'inactive' e 'suspended' já ficam fora do alcance.
-- =============================================================================

create or replace function public.admin_import_users(p_rows jsonb, p_commit boolean)
  returns jsonb
  language plpgsql security definer
  set search_path = public, app
as $$
declare
  v_max_rows   int := 200;
  v_max        int := 300;
  v_row        jsonb;
  v_index      int;
  v_total      int := 0;
  v_inserted   int := 0;
  v_updated    int := 0;
  v_errors     int := 0;
  v_name       text;
  v_email      text;
  v_role_txt   text;
  v_role       app.role_code;
  v_area       text;
  v_auth_id    uuid;
  v_auth_email text;
  v_msgs       jsonb;
  v_warns      jsonb;
  v_region     uuid;
  v_coord      uuid;
  v_err        text;
  v_existing   uuid;
  v_action     text;
  v_status     text;
  v_seen       jsonb := '{}'::jsonb;
  v_pending    jsonb := '[]'::jsonb;
  v_rows_out   jsonb := '[]'::jsonb;
  v_plan       jsonb := '[]'::jsonb;   -- linhas válidas, prontas para gravar
  v_item       jsonb;
  v_user_id    uuid;
  v_applied    boolean := false;
  v_coord_owner uuid;
  -- Novos nesta migration:
  v_active_raw  jsonb;                 -- valor cru de `active` na linha
  v_active_txt  text;
  v_active      boolean;               -- ativação PEDIDA pela planilha
  v_cur_status  text;                  -- status atual do perfil (se existir)
  v_final       text;                  -- status esperado ao fim desta RPC
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows deve ser um array jsonb' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_rows) > v_max_rows then
    raise exception 'lote excede o limite de % linhas', v_max_rows using errcode = 'program_limit_exceeded';
  end if;

  -- ---------------------------------------------------------------------
  -- PASSO 1 — validação COMPLETA do lote. Nenhuma escrita acontece aqui.
  -- ---------------------------------------------------------------------
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_index := coalesce((v_row->>'index')::int, v_total);
    v_msgs  := '[]'::jsonb;
    v_warns := '[]'::jsonb;
    v_region := null; v_coord := null; v_existing := null; v_auth_id := null;
    v_action := 'insert'; v_status := 'ok';
    v_cur_status := null; v_final := null;

    v_name     := regexp_replace(btrim(coalesce(v_row->>'name','')), '\s+', ' ', 'g');
    v_email    := lower(btrim(coalesce(v_row->>'email','')));
    v_role_txt := btrim(coalesce(v_row->>'role',''));
    v_area     := regexp_replace(btrim(coalesce(v_row->>'region','')), '\s+', ' ', 'g');

    -- `active`: AUSENTE equivale a true, para que planilhas antigas (sem a
    -- coluna Ativo) e clientes antigos continuem funcionando exatamente como
    -- antes. Valor presente e irreconhecível é ERRO da linha — nunca um default
    -- silencioso, que foi justamente o defeito que esta migration corrige.
    v_active_raw := v_row->'active';
    if v_active_raw is null or jsonb_typeof(v_active_raw) = 'null' then
      v_active := true;
    elsif jsonb_typeof(v_active_raw) = 'boolean' then
      v_active := (v_active_raw #>> '{}')::boolean;
    elsif jsonb_typeof(v_active_raw) = 'string' then
      v_active_txt := lower(btrim(v_active_raw #>> '{}'));
      if v_active_txt in ('true','sim','s','ativo','1','x') then
        v_active := true;
      elsif v_active_txt in ('false','nao','não','n','inativo','0') then
        v_active := false;
      else
        v_active := true;
        v_msgs := v_msgs || to_jsonb(('Valor invalido em ativo: ' || v_active_txt)::text);
      end if;
    else
      v_active := true;
      v_msgs := v_msgs || to_jsonb('Valor invalido em ativo'::text);
    end if;

    if v_name = '' then
      v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: nome'::text);
    elsif length(v_name) > v_max then
      v_msgs := v_msgs || to_jsonb(('Nome excede o limite de ' || v_max || ' caracteres')::text);
    end if;

    if v_email = '' then
      v_msgs := v_msgs || to_jsonb('Campo obrigatorio ausente: e-mail'::text);
    elsif length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_msgs := v_msgs || to_jsonb(('E-mail invalido: ' || v_email)::text);
    elsif v_seen ? v_email then
      -- Colisão dentro do próprio lote: resultado determinístico e auditável,
      -- nunca "on conflict do nothing".
      v_msgs := v_msgs || to_jsonb(('E-mail repetido no lote: ' || v_email
        || ' (ja usado no registro ' || (v_seen->>v_email) || ')')::text);
    end if;

    if v_role_txt not in ('admin','regional','coordinator','channel_manager') then
      v_msgs := v_msgs || to_jsonb(('Perfil invalido: '
        || coalesce(nullif(v_role_txt,''),'(vazio)')
        || ' (aceitos: admin, regional, coordinator, channel_manager)')::text);
    else
      v_role := v_role_txt::app.role_code;
      -- A área só é exigida quando o papel exige. Desativação NÃO dispensa a
      -- validação: uma planilha errada não vira desativação por acidente.
      select ras.region_id, ras.coordination_id, ras.error_msg
        into v_region, v_coord, v_err
        from app.resolve_area_scope(v_role, v_area) ras;
      if v_err is not null then
        v_msgs := v_msgs || to_jsonb(v_err);
      end if;
    end if;

    if jsonb_array_length(v_msgs) = 0 then
      v_seen := v_seen || jsonb_build_object(v_email, v_index);

      select u.id, u.status::text into v_existing, v_cur_status
        from public.users u
       where lower(u.corporate_email) = v_email;

      if v_existing is not null then
        v_action := 'update';
        v_status := 'duplicate';

        -- SUSPENSO é decisão administrativa deliberada. Reativar por planilha
        -- seria desfazer uma suspensão sem que ninguém percebesse, então é erro
        -- explícito. Já uma linha que pede DESATIVAÇÃO de suspenso é inofensiva:
        -- o perfil segue suspenso e os escopos são encerrados.
        if v_cur_status = 'suspended' and v_active then
          v_msgs := v_msgs || to_jsonb(('Usuario suspenso nao pode ser reativado por importacao: '
            || v_email || ' — reative pela administracao antes')::text);
        end if;

        if v_active then
          -- Já ativo continua ativo; invited/inactive voltam para a fila de
          -- ativação e só viram 'active' quando a identidade estiver confirmada
          -- (admin_activate_confirmed_users). Nunca promovemos aqui.
          v_final := case when v_cur_status = 'active' then 'active' else 'invited' end;
        else
          v_final := case when v_cur_status = 'suspended' then 'suspended' else 'inactive' end;
        end if;
      else
        -- Usuário novo exige identidade Auth previamente criada (P0-C): o
        -- perfil referencia auth.users(id) e NUNCA a inventamos aqui. Isso vale
        -- inclusive para active=false — perfil sem identidade é órfão.
        if coalesce(v_row->>'authUserId','') = '' then
          v_pending := v_pending || to_jsonb(v_email);
          v_status  := 'pending_auth';
          v_action  := 'none';
        else
          begin
            v_auth_id := (v_row->>'authUserId')::uuid;
          exception when others then
            v_msgs := v_msgs || to_jsonb('authUserId nao e um uuid valido'::text);
          end;
          -- O par (authUserId, email) vem do CLIENTE e não pode ser aceito por
          -- confiança: um id válido apontando para OUTRO e-mail criaria um perfil
          -- corporativo colado na identidade errada — a pessoa entraria com a
          -- credencial dela e assumiria o papel/escopo de outra. O servidor
          -- confere o vínculo contra auth.users; divergência é erro nominal e,
          -- pela regra de tudo-ou-nada, impede a gravação do lote inteiro.
          if v_auth_id is not null then
            select lower(btrim(a.email)) into v_auth_email
              from auth.users a where a.id = v_auth_id;
            if v_auth_email is null then
              v_msgs := v_msgs || to_jsonb(('Identidade Auth inexistente para '
                || v_email || ' — provisione a identidade antes de confirmar')::text);
            elsif v_auth_email <> v_email then
              -- Não revela a QUEM pertence a identidade (dado de outra pessoa).
              v_msgs := v_msgs || to_jsonb(('Identidade Auth informada pertence a outro e-mail; '
                || 'recusada para ' || v_email)::text);
            end if;
          end if;
          -- Novo com active=true nasce 'invited' (a promoção é da RPC de
          -- ativação); com active=false nasce 'inactive' e nunca é promovido.
          v_final := case when v_active then 'invited' else 'inactive' end;
        end if;
      end if;
    end if;

    if jsonb_array_length(v_msgs) > 0 then
      v_errors := v_errors + 1;
      v_status := 'error';
      v_action := 'none';
      v_final  := null;
    elsif v_action = 'update' then
      v_updated := v_updated + 1;
    elsif v_action = 'insert' then
      v_inserted := v_inserted + 1;
    end if;

    -- Plano de gravação: só linhas sem erro e sem pendência de identidade.
    if jsonb_array_length(v_msgs) = 0 and v_action <> 'none' then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'index', v_index, 'name', v_name, 'email', v_email, 'role', v_role_txt,
        'regionId', v_region, 'coordinationId', v_coord,
        'existingId', v_existing, 'authUserId', v_auth_id,
        'active', v_active, 'finalStatus', v_final));
    end if;

    v_rows_out := v_rows_out || jsonb_build_array(jsonb_build_object(
      'index', v_index, 'name', v_name, 'email', v_email, 'role', v_role_txt,
      'status', v_status, 'action', v_action,
      'userId', coalesce(v_existing, v_auth_id),
      'requestedActive', v_active, 'finalStatus', v_final,
      'messages', v_msgs, 'warnings', v_warns));
  end loop;

  -- ---------------------------------------------------------------------
  -- PASSO 2 — gravação. Só acontece se o lote INTEIRO estiver apto.
  -- Erro ou pendência de identidade ⇒ nada é gravado (sem aplicação parcial).
  -- ---------------------------------------------------------------------
  if p_commit and v_errors = 0 and jsonb_array_length(v_pending) = 0 then
    for v_item in select * from jsonb_array_elements(v_plan) loop
      v_user_id := coalesce((v_item->>'existingId')::uuid, (v_item->>'authUserId')::uuid);
      v_active  := (v_item->>'active')::boolean;
      v_final   := v_item->>'finalStatus';

      if (v_item->>'existingId') is null then
        insert into public.users (id, display_name, corporate_email, status)
        values (v_user_id, v_item->>'name', v_item->>'email', v_final::app.user_status);
      else
        -- Atualiza o nome SEMPRE e o status conforme a ativação pedida. Promover
        -- para 'active' continua sendo exclusividade de
        -- admin_activate_confirmed_users; aqui só chegamos a 'invited',
        -- 'inactive' ou à manutenção de 'active'/'suspended'.
        update public.users
           set display_name = v_item->>'name',
               status = v_final::app.user_status,
               updated_at = now()
         where id = v_user_id;
      end if;

      -- Escopo anterior é SEMPRE encerrado: tanto na troca de papel/área quanto
      -- na desativação. O que muda é se um novo escopo vigente nasce.
      update public.user_scopes
         set active = false, valid_to = now()
       where user_id = v_user_id and active;

      if v_active then
        insert into public.user_scopes (user_id, role, region_id, coordination_id, created_by)
        values (v_user_id, (v_item->>'role')::app.role_code,
                nullif(v_item->>'regionId','')::uuid,
                nullif(v_item->>'coordinationId','')::uuid,
                auth.uid());

        -- Coordenador titular da coordenação. Divergência é ERRO explícito, não
        -- sobrescrita silenciosa — e derruba a transação inteira. Só faz sentido
        -- para quem está sendo ATIVADO: titular inativo não titulariza nada.
        if (v_item->>'role') = 'coordinator' and (v_item->>'coordinationId') is not null then
          select c.coordinator_user_id into v_coord_owner
            from public.coordinations c where c.id = (v_item->>'coordinationId')::uuid;
          if v_coord_owner is null or v_coord_owner = v_user_id then
            update public.coordinations
               set coordinator_user_id = v_user_id, updated_at = now()
             where id = (v_item->>'coordinationId')::uuid;
          else
            raise exception 'Coordenacao ja possui outro coordenador titular (linha %)', v_item->>'index'
              using errcode = 'integrity_constraint_violation';
          end if;
        end if;
      end if;
    end loop;
    v_applied := true;
  end if;

  return jsonb_build_object(
    'mode', case when p_commit then 'commit' else 'simulate' end,
    'applied', v_applied,
    'counters', jsonb_build_object(
      'total', v_total, 'inserted', v_inserted, 'updated', v_updated,
      'errors', v_errors, 'pendingAuth', jsonb_array_length(v_pending)),
    'pendingAuth', v_pending,
    'rows', v_rows_out);
end $$;

-- ---------------------------------------------------------------------------
-- Permissões — idênticas às da 0010. `create or replace` preserva os grants
-- existentes; reafirmá-los mantém a migration autocontida e reexecutável.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_import_users(jsonb, boolean) from public, anon;
grant execute on function public.admin_import_users(jsonb, boolean) to authenticated;
