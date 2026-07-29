-- ===========================================================================
-- 0022 — EDIÇÃO DE INDICADOR E EXCLUSÃO TRANSACIONAL
--
-- POR QUE ESTA MIGRATION EXISTE. Dois buracos no Admin de indicadores, ambos
-- observados em runtime.
--
-- 1) EXCLUSÃO IMPOSSÍVEL — HTTP 409 SEMPRE. `admin_delete_indicator` (0006)
--    apagava SOMENTE `indicator_definitions`. Como `indicator_versions
--    .definition_id` referencia a definição SEM `on delete cascade` (0001) e
--    `admin_create_indicator` sempre cria a versão 1, TODA definição tem ao menos
--    uma versão — e o delete violava a chave estrangeira. O botão "Excluir"
--    devolvia 409 para qualquer indicador, inclusive sem resultado e sem medição.
--    O trigger `guard_indicator_delete` (0003) nunca foi a causa: ele só barra
--    quando existe medição, e não existia.
--
--    A correção NÃO é `on delete cascade` — decisão registrada do proprietário —
--    porque cascade apagaria histórico de medição em silêncio, exatamente o que
--    D-05/T05 proíbe. Aqui a exclusão vira explícita e transacional: recusa se em
--    uso, apaga as versões, apaga a definição. O corpo da função roda em uma
--    única transação, então ou tudo acontece ou nada acontece.
--
-- 2) DEFINIÇÃO NÃO EDITÁVEL. Não havia caminho para corrigir código ou nome de um
--    indicador já cadastrado: errou ao criar, convivia com o erro. Código e nome
--    são IDENTIDADE e RÓTULO — não o contrato medido. Unidade, direção, meta,
--    tolerância e peso continuam sendo versionados por `admin_add_indicator_
--    version`, e nada aqui os altera. Por isso corrigir código/nome não exige
--    versão nova.
--
-- INVARIANTE PRESERVADO (D-05/T05). Indicador já MEDIDO nunca é apagado
-- fisicamente NEM tem o código trocado: relatório histórico referencia o código,
-- e renomear depois da medição faria a série mudar de nome no passado. Para esse
-- caso o caminho continua sendo inativar.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Correção de identidade e rótulo da definição.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_indicator(
  p_indicator_id uuid,
  p_code         text,
  p_name         text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_code    text := upper(btrim(coalesce(p_code, '')));
  v_name    text := btrim(coalesce(p_name, ''));
  v_current text;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  if v_code = '' or v_name = '' then
    raise exception 'codigo e nome sao obrigatorios' using errcode = 'check_violation';
  end if;

  select code into v_current from public.indicator_definitions where id = p_indicator_id;
  if v_current is null then
    raise exception 'indicador inexistente';
  end if;

  -- Trocar o código de algo já medido reescreveria o passado (T05).
  if v_code <> v_current and exists (
    select 1
      from public.measurements m
      join public.indicator_versions v on v.id = m.indicator_version_id
     where v.definition_id = p_indicator_id
  ) then
    raise exception 'indicador % ja medido: o codigo nao pode ser alterado, apenas o nome', v_current
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Mensagem própria em vez de deixar estourar a unique da tabela: o cliente
  -- mostra `message` cru ao operador, e "duplicate key value violates..." não
  -- diz a ninguém qual código já está em uso.
  if exists (
    select 1 from public.indicator_definitions where code = v_code and id <> p_indicator_id
  ) then
    raise exception 'ja existe um indicador com o codigo %', v_code
      using errcode = 'unique_violation';
  end if;

  update public.indicator_definitions
     set code = v_code, name = v_name
   where id = p_indicator_id;

  return app.indicator_dto(p_indicator_id);
end $$;

-- ---------------------------------------------------------------------------
-- Exclusão física transacional. Substitui o corpo de 0006 — assinatura e tipo de
-- retorno preservados (`create or replace` não permite trocá-los).
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_indicator(p_indicator_id uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_code text;
begin
  if not app.is_admin() then
    raise exception 'apenas administrador' using errcode = 'insufficient_privilege';
  end if;

  select code into v_code from public.indicator_definitions where id = p_indicator_id;
  if v_code is null then
    raise exception 'indicador inexistente';
  end if;

  -- As duas recusas abaixo são explícitas e vêm ANTES de apagar qualquer versão.
  -- Sem elas, o `delete from indicator_versions` esbarraria no trigger
  -- guard_indicator_version_delete no meio do caminho — mesma proteção, mensagem
  -- pior, e depois de já ter tentado escrever.
  if exists (
    select 1
      from public.measurements m
      join public.indicator_versions v on v.id = m.indicator_version_id
     where v.definition_id = p_indicator_id
  ) then
    raise exception 'indicador % ja medido: inative para novas avaliacoes, nao exclua', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  if exists (select 1 from public.indicator_results where indicator_id = p_indicator_id) then
    raise exception 'indicador % ja tem resultado lancado: inative em vez de excluir', v_code
      using errcode = 'integrity_constraint_violation';
  end if;

  delete from public.indicator_versions   where definition_id = p_indicator_id;
  delete from public.indicator_definitions where id = p_indicator_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3) VIGÊNCIA DESCARTADA EM SILÊNCIO. `admin_add_indicator_version` (0006) não
--    lia `effectiveFrom` do payload: o cliente mandava a data, o INSERT não a
--    listava e a coluna caía no `default now()`. Toda versão passava a valer no
--    instante da gravação, sem ninguém perceber. Com o formulário de versão
--    oferecendo vigência, isso vira mentira visível — então a RPC passa a honrar
--    o campo, mantendo `now()` quando ele não vem.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_indicator_version(p_indicator_id uuid, p_version jsonb) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_next int;
  v_from timestamptz;
begin
  if not app.is_admin() then raise exception 'apenas administrador' using errcode = 'insufficient_privilege'; end if;

  select coalesce(max(version_number),0) + 1 into v_next from public.indicator_versions where definition_id = p_indicator_id;
  if v_next = 1 and not exists (select 1 from public.indicator_definitions where id = p_indicator_id) then
    raise exception 'indicador inexistente';
  end if;

  -- Data inválida não vira `now()` silenciosamente: recusa nomeando o campo.
  begin
    v_from := coalesce(nullif(p_version->>'effectiveFrom', '')::timestamptz, now());
  exception when others then
    raise exception 'vigencia invalida: use o formato AAAA-MM-DD' using errcode = 'check_violation';
  end;

  insert into public.indicator_versions
    (definition_id, version_number, unit, direction, target, yellow_tolerance, weight, effective_from)
    values (
      p_indicator_id, v_next, coalesce(p_version->>'unit','%'),
      coalesce(p_version->>'direction','higher_better')::app.indicator_direction,
      coalesce((p_version->>'target')::numeric, 0),
      coalesce((p_version->>'yellowTolerance')::numeric, 0),
      coalesce((p_version->>'weight')::numeric, 1),
      v_from
    );
  return app.indicator_dto(p_indicator_id);
end $$;

-- ---------------------------------------------------------------------------
-- Autorização real está no corpo (`app.is_admin()`); o grant só abre a porta ao
-- papel autenticado e fecha para anônimo, como nas demais RPCs administrativas.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_update_indicator(uuid, text, text) from public, anon;
grant execute on function public.admin_update_indicator(uuid, text, text) to authenticated;
