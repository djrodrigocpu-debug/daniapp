-- =============================================================================
-- AAPEX 1.3.5 — Migration 0036: escopo de catálogo e entidade TEMA
-- =============================================================================
-- DECISÃO QUE ESTA MIGRATION MATERIALIZA. A-08, aprovada em 01/08/2026 e
-- registrada em docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md:
--
--   CATÁLOGO GLOBAL + CONFIGURAÇÃO REGIONAL VERSIONADA + CONTEÚDO REGIONAL
--
-- Esta migration entrega a PRIMEIRA e a TERCEIRA parte para temas, além das
-- funções de autorização que as três partes usam. A configuração regional dos
-- indicadores vem na 0037; os critérios de processo, na 0038.
--
-- POR QUE TEMA VIRA ENTIDADE. Até a 1.3.4 o papel de tema era exercido por três
-- coisas ao mesmo tempo: `audit_items.pillar` (texto), `audit_items.code`
-- projetado como `themeId` e `action_plans.theme_code` (texto). Nenhuma delas
-- tem versão, ordem, escopo ou autoria — e nenhuma delas some daqui: `audit_items`
-- continua intacto servindo o histórico legado, e NADA é convertido.
--
-- POR QUE O NOME MORA NA VERSÃO. O Modelo Operacional §4.3 exige preservar "o
-- nome do tema vigente na data do registro". Nome na definição faria um rename
-- reescrever a leitura de todo o histórico.
--
-- ADITIVA. Nenhuma tabela existente perde coluna, muda tipo ou tem linha
-- reescrita. Nada é aplicado em staging ou produção por esta sessão.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums de escopo e de estado editorial
-- ---------------------------------------------------------------------------
-- `scope_kind` é o eixo de A-08. `catalog_status` é o par draft/published que o
-- escopo desta fase exige para tema, versão de indicador, configuração regional
-- e critério — publicar é ato explícito, e só o publicado é operável.
--
-- Blocos defensivos: o rollback 0001 derruba `schema app cascade`, e o harness
-- reaplica todas as migrations sobre o mesmo banco. Sem o guarda, um `reset()`
-- que preservasse o tipo quebraria a reaplicação.
do $$ begin
  create type app.scope_kind as enum ('global', 'regional');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.catalog_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Alcance de leitura e autoridade de escrita por região
-- ---------------------------------------------------------------------------
-- `app.reaches_region` responde "este usuário enxerga esta região?" — usado pela
-- RLS de leitura do conteúdo regional. Um tema regional de outra região não pode
-- sequer ser listado (escopo desta fase, §4).
--
-- Admin cai no primeiro ramo porque `app.scoped_region_ids()` (0002) já devolve
-- TODAS as regiões para ele. Coordenador alcança a região da sua coordenadoria;
-- GC alcança a região das operações a que está atribuído.
create or replace function app.reaches_region(p_region_id uuid) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select p_region_id is not null and (
    p_region_id in (select app.scoped_region_ids())
    or exists (
      select 1 from public.coordinations c
       where c.id in (select app.scoped_coordination_ids())
         and c.region_id = p_region_id
    )
    or exists (
      select 1
        from public.operation_assignments a
        join public.operations o on o.id = a.operation_id
        join public.units u       on u.id = o.unit_id
       where a.user_id = auth.uid()
         and a.active
         and (a.valid_to is null or a.valid_to > now())
         and u.region_id = p_region_id
    )
  )
$$;

-- `app.can_manage_catalog` é a AUTORIDADE DE ESCRITA da Matriz de Permissões
-- §7.3, e é a função que A-08 tornou possível escrever: agora todo objeto de
-- catálogo sabe a que região pertence.
--
--   região NULA  = objeto GLOBAL  -> somente ADMIN;
--   região dada  = objeto REGIONAL -> ADMIN, ou REGIONAL daquela região.
--
-- Coordenador e Gerente de Canal NUNCA administram catálogo — nem no próprio
-- escopo. Eles consultam (RLS de leitura) e utilizam o que está publicado.
--
-- A autoridade regional é lida de `app.scoped_region_ids()`, que já devolve
-- CONJUNTO. Por isso esta fase não depende da pendência A-07: um regional com
-- mais de uma região funciona sem alteração de código.
create or replace function app.can_manage_catalog(p_region_id uuid) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select case
    when auth.uid() is null then false
    when app.is_admin() then true
    when p_region_id is null then false      -- catálogo global é só do ADMIN
    else app.has_role('regional') and p_region_id in (select app.scoped_region_ids())
  end
$$;

revoke all on function app.reaches_region(uuid)     from public, anon;
revoke all on function app.can_manage_catalog(uuid) from public, anon;
grant execute on function app.reaches_region(uuid)     to authenticated;
grant execute on function app.can_manage_catalog(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Temas: identidade + versões
-- ---------------------------------------------------------------------------
create table if not exists public.themes (
  id          uuid primary key default gen_random_uuid(),
  -- Código é IDENTIDADE GLOBAL, único em todo o catálogo — não por escopo
  -- (ADR-135-001, decisão D-E). O escopo decide quem administra e quem enxerga;
  -- não decide se a sigla pode repetir. Repetir faria a mesma sigla significar
  -- coisas diferentes em regiões diferentes, e exportação, PDF e comparação
  -- entre regiões passariam a depender de um qualificador que hoje não existe.
  code        text not null unique,
  scope_kind  app.scope_kind not null default 'global',
  region_id   uuid references public.regions(id),
  lifecycle   app.indicator_lifecycle not null default 'draft',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id),
  -- O invariante central de A-08, imposto pelo BANCO e não pela aplicação.
  constraint themes_scope_ck check (
    (scope_kind = 'global'   and region_id is null)
    or (scope_kind = 'regional' and region_id is not null)
  )
);
create index if not exists themes_region_idx on public.themes(region_id);

create table if not exists public.theme_versions (
  id              uuid primary key default gen_random_uuid(),
  theme_id        uuid not null references public.themes(id),
  version_number  int  not null,
  name            text not null,
  description     text,
  sort_order      int  not null default 0,
  status          app.catalog_status not null default 'draft',
  active          boolean not null default true,
  effective_from  timestamptz not null default now(),
  effective_to    timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id),
  unique (theme_id, version_number),
  constraint theme_versions_validity_ck check (effective_to is null or effective_to > effective_from)
);
create index if not exists theme_versions_theme_idx on public.theme_versions(theme_id, version_number);

-- ---------------------------------------------------------------------------
-- 4. Guardas de integridade
-- ---------------------------------------------------------------------------
-- Vigência sem sobreposição entre versões PUBLICADAS do mesmo tema. Rascunho não
-- entra na conta: rascunho não é operável, e exigir janela livre para rascunho
-- impediria preparar a próxima versão enquanto a atual está no ar.
create or replace function app.guard_theme_version_overlap() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if new.status <> 'published' then
    return new;
  end if;
  if exists (
    select 1 from public.theme_versions v
     where v.theme_id = new.theme_id
       and v.id <> new.id
       and v.status = 'published'
       and tstzrange(v.effective_from, v.effective_to, '[)')
        && tstzrange(new.effective_from, new.effective_to, '[)')
  ) then
    raise exception 'vigencia sobreposta: ja existe versao publicada deste tema no periodo'
      using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_theme_version_overlap on public.theme_versions;
create trigger trg_theme_version_overlap
  before insert or update on public.theme_versions
  for each row execute function app.guard_theme_version_overlap();

-- Exclusão destrutiva com histórico é PROIBIDA para todos os papéis, inclusive o
-- ADMIN (Matriz de Permissões §2). Não é permissão: é invariante do modelo. O
-- caminho de aposentadoria é inativar.
--
-- A 0037 SUBSTITUI as duas funções abaixo para incluir também as configurações
-- regionais que apontem para as versões — aqui elas ainda não existem.
create or replace function app.guard_theme_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if exists (select 1 from public.theme_versions v where v.theme_id = old.id and v.status = 'published') then
    raise exception 'tema % ja publicado: inative em vez de excluir', old.code
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

create or replace function app.guard_theme_version_delete() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if old.status = 'published' then
    raise exception 'versao de tema publicada nao pode ser excluida: publique uma nova versao'
      using errcode = 'integrity_constraint_violation';
  end if;
  return old;
end $$;

drop trigger if exists trg_guard_theme_delete on public.themes;
create trigger trg_guard_theme_delete before delete on public.themes
  for each row execute function app.guard_theme_delete();

drop trigger if exists trg_guard_theme_version_delete on public.theme_versions;
create trigger trg_guard_theme_version_delete before delete on public.theme_versions
  for each row execute function app.guard_theme_version_delete();

-- ---------------------------------------------------------------------------
-- 5. RLS: leitura por alcance regional, escrita SOMENTE por RPC
-- ---------------------------------------------------------------------------
-- Tema global é legível por qualquer autenticado — é catálogo comum. Tema
-- regional só é legível por quem alcança a região: outra região não pode nem
-- listar (escopo desta fase, §4).
--
-- NÃO existe policy de INSERT/UPDATE/DELETE. Toda escrita passa pelas RPCs
-- `security definer` da seção 7, que verificam ator, papel e região na ordem da
-- Matriz §7.2. Fechar a escrita direta é o que impede um regional de contornar
-- `can_manage_catalog` escrevendo pelo PostgREST.
alter table public.themes         enable row level security;
alter table public.themes         force  row level security;
alter table public.theme_versions enable row level security;
alter table public.theme_versions force  row level security;

drop policy if exists themes_scoped_read on public.themes;
create policy themes_scoped_read on public.themes for select to authenticated
  using (scope_kind = 'global' or app.reaches_region(region_id));

drop policy if exists theme_versions_scoped_read on public.theme_versions;
create policy theme_versions_scoped_read on public.theme_versions for select to authenticated
  using (exists (
    select 1 from public.themes t
     where t.id = theme_id
       and (t.scope_kind = 'global' or app.reaches_region(t.region_id))
  ));

-- Mitiga o achado O-10 na superfície nova: no ambiente real toda tabela de
-- `public` nasce com privilégio amplo para `anon` e `authenticated`, e só a RLS
-- separa. Aqui o privilégio some antes disso.
revoke all on table public.themes         from anon, public;
revoke all on table public.theme_versions from anon, public;
revoke insert, update, delete, truncate on table public.themes         from authenticated;
revoke insert, update, delete, truncate on table public.theme_versions from authenticated;
grant select on table public.themes         to authenticated;
grant select on table public.theme_versions to authenticated;

-- ---------------------------------------------------------------------------
-- 6. DTO interno
-- ---------------------------------------------------------------------------
-- `security definer` e revogado de todo mundo: só é chamado DEPOIS que a RPC
-- autorizou. Mesmo padrão de `app.indicator_dto` (0006) e `app.partner_dto`.
create or replace function app.theme_dto(p_theme_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',         t.id,
    'code',       t.code,
    'scopeKind',  t.scope_kind,
    'regionId',   t.region_id,
    'lifecycle',  t.lifecycle,
    'createdAt',  t.created_at,
    'versions',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            v.id,
               'versionNumber', v.version_number,
               'name',          v.name,
               'description',   v.description,
               'sortOrder',     v.sort_order,
               'status',        v.status,
               'active',        v.active,
               'effectiveFrom', v.effective_from,
               'effectiveTo',   v.effective_to
             ) order by v.version_number)
        from public.theme_versions v where v.theme_id = t.id
    ), '[]'::jsonb)
  )
  from public.themes t where t.id = p_theme_id
$$;

revoke all on function app.theme_dto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPCs de tema
-- ---------------------------------------------------------------------------
-- ORDEM DE VERIFICAÇÃO (Matriz §7.2): ator -> registro -> autoridade -> estado
-- -> efeito. "Inexistente" e "fora do escopo" devolvem A MESMA MENSAGEM, para
-- que a existência de um tema de outra região não seja observável pela diferença
-- das recusas.

-- Cria a identidade do tema e a VERSÃO 1 em rascunho. Nasce em rascunho de
-- propósito: publicar é ato explícito, e um tema recém-criado ainda não tem nome
-- revisado nem ordem definida.
create or replace function public.catalog_create_theme(
  p_scope     text,
  p_region_id uuid,
  p_code      text,
  p_payload   jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_scope  app.scope_kind;
  v_region uuid;
  v_code   text := upper(btrim(coalesce(p_code, '')));
  v_name   text := btrim(coalesce(p_payload->>'name', ''));
  v_theme  uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  begin
    v_scope := coalesce(nullif(btrim(coalesce(p_scope, '')), ''), 'global')::app.scope_kind;
  exception when others then
    raise exception 'escopo invalido: use global ou regional' using errcode = 'check_violation';
  end;

  -- A região efetiva é derivada do ESCOPO, nunca aceita como veio. Um cliente
  -- que mande região junto de 'global' não cria um híbrido silencioso.
  v_region := case when v_scope = 'regional' then p_region_id else null end;
  if v_scope = 'regional' and v_region is null then
    raise exception 'tema regional exige regiao' using errcode = 'check_violation';
  end if;

  if not app.can_manage_catalog(v_region) then
    raise exception 'sem permissao para administrar o catalogo desta regiao'
      using errcode = 'insufficient_privilege';
  end if;

  if v_scope = 'regional' and not exists (select 1 from public.regions where id = v_region) then
    raise exception 'sem permissao para administrar o catalogo desta regiao'
      using errcode = 'insufficient_privilege';
  end if;

  if v_code = '' or v_name = '' then
    raise exception 'codigo e nome sao obrigatorios' using errcode = 'check_violation';
  end if;

  -- Mensagem própria em vez de deixar estourar a unique, no padrão de
  -- `admin_update_indicator` (0022): o cliente mostra `message` cru ao operador.
  -- Diz que a sigla está tomada e NÃO diz por quem — a existência de um tema de
  -- outra região continua não observável.
  if exists (select 1 from public.themes t where t.code = v_code) then
    raise exception 'ja existe um tema com o codigo %', v_code
      using errcode = 'unique_violation';
  end if;

  insert into public.themes (code, scope_kind, region_id, lifecycle, created_by)
    values (v_code, v_scope, v_region, 'draft', v_uid)
    returning id into v_theme;

  insert into public.theme_versions
    (theme_id, version_number, name, description, sort_order, status, created_by)
    values (
      v_theme, 1, v_name, nullif(btrim(coalesce(p_payload->>'description','')), ''),
      coalesce((p_payload->>'sortOrder')::int, 0), 'draft', v_uid
    );

  return app.theme_dto(v_theme);
end $$;

-- Nova versão em RASCUNHO. Editar tema é sempre nova versão: alterar a versão em
-- uso reescreveria a leitura do histórico (Modelo Operacional §4.1).
create or replace function public.catalog_add_theme_version(
  p_theme_id uuid,
  p_payload  jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_region uuid;
  v_scope  app.scope_kind;
  v_name   text := btrim(coalesce(p_payload->>'name', ''));
  v_next   int;
  v_from   timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select region_id, scope_kind into v_region, v_scope
    from public.themes where id = p_theme_id;

  if v_scope is null or not app.can_manage_catalog(v_region) then
    raise exception 'tema inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_name = '' then
    raise exception 'nome e obrigatorio' using errcode = 'check_violation';
  end if;

  begin
    v_from := coalesce(nullif(p_payload->>'effectiveFrom', '')::timestamptz, now());
  exception when others then
    raise exception 'vigencia invalida: use o formato AAAA-MM-DD' using errcode = 'check_violation';
  end;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.theme_versions where theme_id = p_theme_id;

  insert into public.theme_versions
    (theme_id, version_number, name, description, sort_order, status, effective_from, created_by)
    values (
      p_theme_id, v_next, v_name,
      nullif(btrim(coalesce(p_payload->>'description','')), ''),
      coalesce((p_payload->>'sortOrder')::int, 0), 'draft', v_from, v_uid
    );

  return app.theme_dto(p_theme_id);
end $$;

-- Publicar. IDEMPOTENTE: publicar duas vezes devolve o mesmo estado, sem tocar
-- vigência nem reabrir a versão anterior.
--
-- Publicar a versão N ENCERRA a vigência da versão publicada em curso — é isso
-- que mantém "nenhuma sobreposição indevida de vigência" sem obrigar o operador
-- a fechar a janela na mão, e é o que o gatilho de sobreposição exige.
create or replace function public.catalog_publish_theme_version(p_version_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_theme  uuid;
  v_region uuid;
  v_status app.catalog_status;
  v_from   timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select v.theme_id, t.region_id, v.status, v.effective_from
    into v_theme, v_region, v_status, v_from
    from public.theme_versions v
    join public.themes t on t.id = v.theme_id
   where v.id = p_version_id;

  if v_theme is null or not app.can_manage_catalog(v_region) then
    raise exception 'versao de tema inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  if v_status = 'published' then
    return app.theme_dto(v_theme);      -- idempotência
  end if;

  update public.theme_versions
     set effective_to = v_from
   where theme_id = v_theme
     and id <> p_version_id
     and status = 'published'
     and effective_to is null
     and effective_from <= v_from;

  update public.theme_versions set status = 'published' where id = p_version_id;

  -- Tema com versão publicada passa a ser utilizável; o lifecycle acompanha.
  update public.themes set lifecycle = 'active'
   where id = v_theme and lifecycle = 'draft';

  return app.theme_dto(v_theme);
end $$;

-- Aposentadoria: inativar, nunca excluir. `active` e `inactive` são os dois
-- destinos aceitos; voltar para `draft` reabriria um tema já publicado.
create or replace function public.catalog_set_theme_lifecycle(
  p_theme_id  uuid,
  p_lifecycle text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_region uuid;
  v_scope  app.scope_kind;
  v_next   app.indicator_lifecycle;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select region_id, scope_kind into v_region, v_scope from public.themes where id = p_theme_id;
  if v_scope is null or not app.can_manage_catalog(v_region) then
    raise exception 'tema inexistente ou fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  begin
    v_next := p_lifecycle::app.indicator_lifecycle;
  exception when others then
    raise exception 'situacao invalida: use active ou inactive' using errcode = 'check_violation';
  end;

  if v_next = 'draft' then
    raise exception 'situacao invalida: use active ou inactive' using errcode = 'check_violation';
  end if;

  update public.themes set lifecycle = v_next where id = p_theme_id;
  return app.theme_dto(p_theme_id);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants mínimos das RPCs
-- ---------------------------------------------------------------------------
-- A autorização verdadeira está no corpo. O grant apenas fecha a porta para
-- `anon` e `PUBLIC`, na convenção que 0010–0031 já aplicam.
revoke all on function public.catalog_create_theme(text, uuid, text, jsonb)  from public, anon;
revoke all on function public.catalog_add_theme_version(uuid, jsonb)         from public, anon;
revoke all on function public.catalog_publish_theme_version(uuid)            from public, anon;
revoke all on function public.catalog_set_theme_lifecycle(uuid, text)        from public, anon;

grant execute on function public.catalog_create_theme(text, uuid, text, jsonb) to authenticated;
grant execute on function public.catalog_add_theme_version(uuid, jsonb)        to authenticated;
grant execute on function public.catalog_publish_theme_version(uuid)           to authenticated;
grant execute on function public.catalog_set_theme_lifecycle(uuid, text)       to authenticated;
