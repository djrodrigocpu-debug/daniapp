-- ===========================================================================
-- 0048 — PONDERAÇÃO REGIONAL VERSIONADA E AGREGAÇÕES SERVER-SIDE
--        (AAPEx 1.3.5, Fase 8)
--
-- Três entregas, e a ordem entre elas não é arbitrária: a ponderação existe
-- porque a Matriz precisa saber se PODE calcular um índice; as agregações
-- existem porque D10 exige agregação server-side; e a Matriz consome as duas.
--
-- ---------------------------------------------------------------------------
-- 1. NENHUM PESO É SEMEADO. NENHUM PESO É INVENTADO.
-- ---------------------------------------------------------------------------
-- D10 é literal: *"não há peso padrão aprovado"*, e a pendência **A-04** segue
-- aberta. A tabela nasce VAZIA. Sem versão publicada e vigente para a região:
--
--   * os dois eixos são entregues;
--   * o estado é `"Ponderação não configurada"`;
--   * o índice consolidado **não é calculado** — nem como zero, nem como média.
--
-- Faltando um dos módulos, o índice também não existe, e o peso restante **NÃO
-- é renormalizado**: renormalizar faria um parceiro sem auditoria parecer melhor
-- do que um auditado (Modelo Operacional §7.2).
--
-- ---------------------------------------------------------------------------
-- 2. OS QUADRANTES SÃO OS QUE JÁ EXISTIAM. NENHUM LIMITE NOVO.
-- ---------------------------------------------------------------------------
-- A Matriz da 1.3.4 vive em `src/domain/dashboard/performanceMatrix.ts`, e as
-- regras dela foram INVENTARIADAS antes de uma linha ser escrita aqui:
--
--   eixo de processo bom  <=>  semáforo VERDE, e o semáforo é
--                              `app.score_traffic_light` (0004): >= 80 verde,
--                              >= 70 amarelo, senão vermelho, nulo = não avaliado
--   eixo de desempenho bom <=> TODOS os indicadores medidos no alvo; um vermelho
--                              vence de imediato, senão um amarelo, senão verde
--   quadrante = conformidade x resultado, exatamente a tabela de quatro células
--   sem dado em qualquer eixo -> quadrante NULO, com o motivo nomeado
--
-- O que muda é **de onde** cada eixo vem (D10): desempenho passa a ser a Gestão
-- Assistida e processo passa a ser a Auditoria Mensal. Os limites, os nomes dos
-- cinco quadrantes e a regra de gravidade são os mesmos. Nada foi renomeado.
--
-- ---------------------------------------------------------------------------
-- 3. A-10 CONTINUA PROVISÓRIA — E A-11 NASCE AQUI, DECLARADA
-- ---------------------------------------------------------------------------
-- `app.monthly_audit_score` **não é tocada**: proporção simples de conformidade,
-- com `nao_aplicavel` fora do numerador e do denominador, e **A-10 aberta**.
--
-- O eixo de DESEMPENHO, porém, não tem número definido em documento nenhum. A
-- Gestão Assistida produz status por indicador (`conforme`, `atencao`,
-- `nao_conforme`, `sem_dado`), não uma nota. Para o índice ponderado existir é
-- preciso um número — e inventá-lo em silêncio é exatamente o que esta versão
-- se proibiu.
--
-- Adotado, portanto, o mesmo caminho que a Fase 5 adotou para A-10: a **mesma
-- forma** de proporção simples — `conforme / (conforme + atencao +
-- nao_conforme) * 100`, com `sem_dado` fora dos dois lados —, declarada
-- **PROVISÓRIA** e registrada como pendência empresarial nova, **A-11**.
--
--   * `atencao` conta como NÃO conformidade porque D2 a trata como desvio, que
--     exige diagnóstico e plano. Não é meia conformidade — não há decisão que
--     diga que é;
--   * `sem_dado` fica fora dos dois lados, como `nao_aplicavel` no mensal;
--   * a regra viaja em `ruleProvenance` em toda resposta, com o identificador
--     `proporcao-simples-desempenho/A-11-pendente`.
--
-- **Não é o Índice de Excelência, não é ponderação homologada, e a interface
-- precisa dizer isso.** A-11 é pendência ABERTA, não decisão tomada.
--
-- ---------------------------------------------------------------------------
-- 4. FILTROS: OITO, CANÔNICOS, E RESOLVIDOS NO SERVIDOR
-- ---------------------------------------------------------------------------
-- D9/D10: período · parceiro · GC · Coordenador · tema · indicador · módulo ·
-- status. Chave fora dessa lista é **recusada por nome**, não ignorada em
-- silêncio — ignorar deixaria o cliente crer que filtrou.
--
-- Filtro ausente = **todo o escopo autorizado**, nunca "todo o banco".
--
-- E a regra de interseção, que concilia os dois documentos canônicos:
--
--   * Matriz §6: *"um filtro que peça mais do que o papel alcança devolve apenas
--     o permitido — nunca erro que revele a existência do que ficou de fora"*
--     -> filtro com interseção NÃO VAZIA devolve a parte permitida;
--   * teste 35: exportar/consultar objeto fora do escopo é **recusa uniforme**
--     -> filtro cuja interseção é VAZIA recusa com
--     `operacao inexistente ou fora do escopo` — a MESMA frase de um UUID que
--     não existe, e portanto sem confirmar existência alheia.
--
-- Pedir parte do que é seu é filtrar. Pedir só o que não é seu é sondar.
--
-- ADITIVA. Cria uma tabela, dois gatilhos e nove funções. Não altera coluna,
-- tipo, policy, gatilho ou dado de nenhuma estrutura existente. Migrations
-- 0001–0047 intactas.
--
-- ROLLBACK: `drop table public.region_weightings cascade` e `drop function` das
-- novas. Nada mais — nenhuma estrutura anterior foi modificada.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Ponderação regional versionada
-- ---------------------------------------------------------------------------
create table if not exists public.region_weightings (
  id              uuid primary key default gen_random_uuid(),
  region_id       uuid not null references public.regions(id),
  version_number  int  not null,

  -- D10: os dois somam 100. O CHECK é o que impede 99 e 101 — não a RPC.
  assisted_weight numeric(5,2) not null,
  audit_weight    numeric(5,2) not null,

  effective_from  date not null,
  -- `null` = vigente. Publicar uma versão nova FECHA a anterior aqui, e isso
  -- não é reescrever histórico: é registrar quando ela deixou de valer. Os
  -- pesos publicados nunca mudam.
  effective_to    date,

  status          app.catalog_status not null default 'draft',
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now(),
  published_by    uuid references public.users(id),
  published_at    timestamptz,

  constraint region_weightings_version_uk unique (region_id, version_number),
  constraint region_weightings_sum_100 check (assisted_weight + audit_weight = 100),
  constraint region_weightings_range check (
    assisted_weight >= 0 and assisted_weight <= 100
    and audit_weight >= 0 and audit_weight <= 100
  ),
  constraint region_weightings_window check (effective_to is null or effective_to > effective_from),
  constraint region_weightings_publish_shape check (
    (status = 'draft' and published_by is null and published_at is null and effective_to is null)
    or (status = 'published' and published_by is not null and published_at is not null)
  )
);

-- UMA versão publicada e vigente por região. Índice, não disciplina.
create unique index if not exists region_weightings_current_uk
  on public.region_weightings(region_id)
  where status = 'published' and effective_to is null;

-- UM rascunho por região: editar o rascunho é editar o mesmo objeto.
create unique index if not exists region_weightings_draft_uk
  on public.region_weightings(region_id) where status = 'draft';

create index if not exists region_weightings_region_idx
  on public.region_weightings(region_id, effective_from desc);

-- Autoria autoritativa e vigências sem sobreposição.
create or replace function app.guard_region_weighting_write() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    -- Exceção deliberada para `auth.uid()` nulo: manutenção por superusuário
    -- fora de sessão, no mesmo padrão da 0025.
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  end if;

  if new.status = 'published' then
    if exists (
      select 1 from public.region_weightings w
       where w.region_id = new.region_id
         and w.id <> new.id
         and w.status = 'published'
         and daterange(w.effective_from, w.effective_to, '[)')
             && daterange(new.effective_from, new.effective_to, '[)')
    ) then
      raise exception 'ponderacao com vigencia sobreposta na mesma regiao'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_region_weightings_write on public.region_weightings;
create trigger trg_region_weightings_write
  before insert or update on public.region_weightings
  for each row execute function app.guard_region_weighting_write();

-- Versão PUBLICADA é imutável nos pesos. Fechar a vigência é permitido; mudar
-- o peso de uma versão já publicada reescreveria a leitura do histórico.
create or replace function app.guard_region_weighting_immutable() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  if old.status = 'published' and (
       new.assisted_weight is distinct from old.assisted_weight
       or new.audit_weight is distinct from old.audit_weight
       or new.effective_from is distinct from old.effective_from
       or new.region_id is distinct from old.region_id
       or new.version_number is distinct from old.version_number
       or new.status is distinct from old.status
     ) then
    raise exception 'ponderacao publicada e imutavel: crie uma nova versao'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_region_weightings_immutable on public.region_weightings;
create trigger trg_region_weightings_immutable
  before update on public.region_weightings
  for each row execute function app.guard_region_weighting_immutable();

alter table public.region_weightings enable row level security;
alter table public.region_weightings force row level security;

drop policy if exists region_weightings_read on public.region_weightings;
create policy region_weightings_read on public.region_weightings
  for select to authenticated using (app.reaches_region(region_id));

revoke all on table public.region_weightings from anon, public, authenticated;
grant select on table public.region_weightings to authenticated;

comment on table public.region_weightings is
  'Ponderacao regional versionada (0048). SEM SEMENTE: A-04 aberta, nao ha peso padrao aprovado.';

-- ---------------------------------------------------------------------------
-- 2. Leitura da ponderação vigente
-- ---------------------------------------------------------------------------
create or replace function app.region_weighting_dto(p_region_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select jsonb_build_object(
       'configured',     true,
       'id',             w.id,
       'regionId',       w.region_id,
       'versionNumber',  w.version_number,
       'assistedWeight', w.assisted_weight::double precision,
       'auditWeight',    w.audit_weight::double precision,
       'effectiveFrom',  w.effective_from::text,
       'publishedAt',    w.published_at
     )
       from public.region_weightings w
      where w.region_id = p_region_id and w.status = 'published' and w.effective_to is null),
    jsonb_build_object('configured', false, 'regionId', p_region_id,
                       'reason', 'Ponderacao nao configurada')
  )
$$;

revoke all on function app.region_weighting_dto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs de administração da ponderação
-- ---------------------------------------------------------------------------
-- Matriz §2: *"Configurar ponderação regional — ADMIN global, REGIONAL da
-- própria região"*. É exatamente `app.can_manage_catalog`, e a mensagem de
-- recusa é a MESMA já usada pelas 14 RPCs de catálogo: fonte única.
create or replace function public.catalog_save_region_weighting_draft(
  p_region_id uuid, p_input jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid       uuid;
  v_assisted  numeric(5,2);
  v_audit     numeric(5,2);
  v_from      date;
  v_id        uuid;
  v_next      int;
begin
  -- (1) ATOR.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) PAPEL + ESCOPO, na mesma chamada e com a mesma frase do catálogo.
  if not coalesce(app.can_manage_catalog(p_region_id), false) then
    raise exception 'sem permissao para administrar o catalogo desta regiao'
      using errcode = 'insufficient_privilege';
  end if;

  -- (3) VALIDAÇÃO. Mensagem empresarial antes do CHECK: o CHECK é a garantia,
  -- não a explicação.
  if p_input->>'assistedWeight' is null or p_input->>'auditWeight' is null then
    raise exception 'informe os dois pesos: desempenho e processo'
      using errcode = 'integrity_constraint_violation';
  end if;
  v_assisted := (p_input->>'assistedWeight')::numeric;
  v_audit    := (p_input->>'auditWeight')::numeric;

  if v_assisted < 0 or v_audit < 0 then
    raise exception 'peso negativo nao e admitido'
      using errcode = 'integrity_constraint_violation';
  end if;
  if (v_assisted + v_audit) <> 100 then
    -- `trim_scale` para a mensagem dizer "99", e não "99.00": ela é lida por
    -- gente, e o zero à direita parece precisão que não existe.
    raise exception 'os pesos devem somar 100: recebido %', trim_scale(v_assisted + v_audit)
      using errcode = 'integrity_constraint_violation';
  end if;

  v_from := coalesce(nullif(p_input->>'effectiveFrom','')::date, app.assisted_today());

  -- (4) EFEITO. Um rascunho por região: o segundo save edita o mesmo objeto.
  select id into v_id from public.region_weightings
   where region_id = p_region_id and status = 'draft';

  if v_id is null then
    select coalesce(max(version_number), 0) + 1 into v_next
      from public.region_weightings where region_id = p_region_id;

    insert into public.region_weightings
      (region_id, version_number, assisted_weight, audit_weight, effective_from, status)
    values (p_region_id, v_next, v_assisted, v_audit, v_from, 'draft')
    returning id into v_id;
  else
    update public.region_weightings
       set assisted_weight = v_assisted, audit_weight = v_audit, effective_from = v_from
     where id = v_id;
  end if;

  perform app.write_audit('region_weighting_draft_saved', 'region_weighting', v_id::text,
    jsonb_build_object('regionId', p_region_id, 'assistedWeight', v_assisted,
                       'auditWeight', v_audit, 'effectiveFrom', v_from));

  return app.region_weighting_version_dto(v_id);
end $$;

create or replace function app.region_weighting_version_dto(p_id uuid) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'id',             w.id,
    'regionId',       w.region_id,
    'versionNumber',  w.version_number,
    'assistedWeight', w.assisted_weight::double precision,
    'auditWeight',    w.audit_weight::double precision,
    'effectiveFrom',  w.effective_from::text,
    'effectiveTo',    w.effective_to::text,
    'status',         w.status::text,
    'createdBy',      w.created_by,
    'createdAt',      w.created_at,
    'publishedBy',    w.published_by,
    'publishedAt',    w.published_at
  ) from public.region_weightings w where w.id = p_id
$$;

revoke all on function app.region_weighting_version_dto(uuid) from public, anon, authenticated;

create or replace function public.catalog_publish_region_weighting(p_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid     uuid;
  v_region  uuid;
  v_status  app.catalog_status;
  v_from    date;
  v_current uuid;
  v_curfrom date;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select region_id, status, effective_from into v_region, v_status, v_from
    from public.region_weightings where id = p_id for update;

  -- ESCOPO antes de tudo, e a frase é uniforme: inexistente e fora do alcance
  -- respondem a mesma coisa (padrão de 0031/0035/0046).
  if v_region is null or not coalesce(app.can_manage_catalog(v_region), false) then
    raise exception 'ponderacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  if v_status <> 'draft' then
    raise exception 'apenas rascunho de ponderacao pode ser publicado'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- Fecha a vigente, se houver. Não reescreve pesos: só diz quando ela acabou.
  select id, effective_from into v_current, v_curfrom
    from public.region_weightings
   where region_id = v_region and status = 'published' and effective_to is null;

  if v_current is not null then
    if v_from <= v_curfrom then
      raise exception 'a nova vigencia deve comecar depois de %', to_char(v_curfrom, 'DD/MM/YYYY')
        using errcode = 'integrity_constraint_violation';
    end if;
    update public.region_weightings set effective_to = v_from where id = v_current;
  end if;

  update public.region_weightings
     set status = 'published', published_by = v_uid, published_at = now()
   where id = p_id;

  perform app.write_audit('region_weighting_published', 'region_weighting', p_id::text,
    jsonb_build_object('regionId', v_region, 'closedVersion', v_current));

  return app.region_weighting_version_dto(p_id);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Estado da ponderação, por região alcançável
-- ---------------------------------------------------------------------------
create or replace function public.get_weighting_status(p_region_id uuid default null) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  if p_region_id is not null and not coalesce(app.reaches_region(p_region_id), false) then
    raise exception 'regiao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'contractVersion', '1.3.5-weighting-1',
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'regionId',   r.id,
               'regionName', r.name,
               'current',    app.region_weighting_dto(r.id),
               'versions',   coalesce((
                 select jsonb_agg(app.region_weighting_version_dto(w.id)
                          order by w.version_number desc)
                   from public.region_weightings w where w.region_id = r.id), '[]'::jsonb)
             ) order by r.name, r.id)
        from public.regions r
       where app.reaches_region(r.id)
         and (p_region_id is null or r.id = p_region_id)), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. Filtros — validação e resolução de escopo
-- ---------------------------------------------------------------------------
-- Chave desconhecida é RECUSADA POR NOME. Ignorar em silêncio deixaria o cliente
-- crer que filtrou.
create or replace function app.validate_dashboard_filters(p_filters jsonb) returns void
  language plpgsql immutable set search_path = public, app as $$
declare v_key text;
begin
  if p_filters is null or jsonb_typeof(p_filters) = 'null' then return; end if;
  if jsonb_typeof(p_filters) <> 'object' then
    raise exception 'filtros devem ser um objeto' using errcode = 'invalid_parameter_value';
  end if;

  for v_key in select jsonb_object_keys(p_filters) loop
    if v_key not in ('periodFrom','periodTo','operationIds','channelManagerIds',
                     'coordinationIds','themeIds','indicatorIds','modules','statuses') then
      raise exception 'filtro desconhecido: %', v_key using errcode = 'invalid_parameter_value';
    end if;

    -- TIPO, e não só nome. Sem isto, `operationIds: "opA"` passaria e depois
    -- explodiria dentro de `jsonb_array_length` — erro de banco cru chegando ao
    -- cliente no lugar de uma recusa de contrato.
    if v_key in ('operationIds','channelManagerIds','coordinationIds',
                 'themeIds','indicatorIds','modules','statuses')
       and jsonb_typeof(p_filters->v_key) not in ('array','null') then
      raise exception 'filtro % deve ser uma lista', v_key using errcode = 'invalid_parameter_value';
    end if;

    if v_key in ('periodFrom','periodTo')
       and jsonb_typeof(p_filters->v_key) not in ('string','null') then
      raise exception 'filtro % deve ser uma data AAAA-MM-DD', v_key
        using errcode = 'invalid_parameter_value';
    end if;
  end loop;
end $$;

-- Quantos valores um filtro de lista traz. **Lista vazia é ausência de filtro**,
-- não "nenhum resultado": `statuses: []` significa *"não filtrei por status"*, e
-- tratá-la como conjunto vazio esvaziaria o dashboard em silêncio.
create or replace function app.filter_len(p_filters jsonb, p_key text) returns int
  language sql immutable set search_path = public, app as $$
  select case
    when p_filters is null then 0
    when jsonb_typeof(p_filters->p_key) = 'array' then jsonb_array_length(p_filters->p_key)
    else 0
  end
$$;

-- Conjunto de operações alcançáveis DEPOIS dos filtros. Ver §4 do cabeçalho
-- para a regra de interseção.
create or replace function app.dashboard_operations(p_filters jsonb) returns uuid[]
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_ops      uuid[];
  v_explicit boolean;
begin
  v_explicit := app.filter_len(p_filters, 'operationIds') > 0
             or app.filter_len(p_filters, 'channelManagerIds') > 0
             or app.filter_len(p_filters, 'coordinationIds') > 0;

  select array_agg(o.id order by o.id) into v_ops
    from public.operations o
   where coalesce(app.has_operation_access(o.id), false)
     and (app.filter_len(p_filters, 'operationIds') = 0
          or o.id::text in (select jsonb_array_elements_text(p_filters->'operationIds')))
     and (app.filter_len(p_filters, 'channelManagerIds') = 0
          or o.channel_manager_user_id::text in
             (select jsonb_array_elements_text(p_filters->'channelManagerIds')))
     and (app.filter_len(p_filters, 'coordinationIds') = 0
          or o.coordination_id::text in
             (select jsonb_array_elements_text(p_filters->'coordinationIds')));

  if v_explicit and coalesce(array_length(v_ops, 1), 0) = 0 then
    raise exception 'operacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(v_ops, '{}'::uuid[]);
end $$;

-- Devolve os filtros SANITIZADOS: só as chaves conhecidas, e sem eco de valor
-- que o servidor não confirmou.
create or replace function app.dashboard_filters_dto(p_filters jsonb, p_ops uuid[]) returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'periodFrom',        p_filters->>'periodFrom',
    'periodTo',          p_filters->>'periodTo',
    'operationIds',      to_jsonb(p_ops),
    'channelManagerIds', coalesce(p_filters->'channelManagerIds', '[]'::jsonb),
    'coordinationIds',   coalesce(p_filters->'coordinationIds', '[]'::jsonb),
    'themeIds',          coalesce(p_filters->'themeIds', '[]'::jsonb),
    'indicatorIds',      coalesce(p_filters->'indicatorIds', '[]'::jsonb),
    'modules',           coalesce(p_filters->'modules', '[]'::jsonb),
    'statuses',          coalesce(p_filters->'statuses', '[]'::jsonb),
    'resolvedOperationCount', coalesce(array_length(p_ops, 1), 0)
  )
$$;

revoke all on function app.validate_dashboard_filters(jsonb) from public, anon, authenticated;
revoke all on function app.filter_len(jsonb, text)           from public, anon, authenticated;
revoke all on function app.dashboard_operations(jsonb)       from public, anon, authenticated;
revoke all on function app.dashboard_filters_dto(jsonb, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. A proveniência das regras — viaja em TODA resposta
-- ---------------------------------------------------------------------------
create or replace function app.dashboard_rule_provenance() returns jsonb
  language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'assistedStatusRule',    app.assisted_rule_version(),
    'performanceScoreRule',  'proporcao-simples-desempenho/A-11-pendente',
    'performanceProvisional', true,
    'monthlyScoreRule',      'proporcao-simples/A-10-pendente',
    'monthlyProvisional',    true,
    'quadrantRule',          '1.3.4-quadrants-1',
    'trafficLightRule',      'app.score_traffic_light/0004',
    'openDecisions',         jsonb_build_array('A-04', 'A-10', 'A-11')
  )
$$;

revoke all on function app.dashboard_rule_provenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. `get_dashboard_aggregates`
-- ---------------------------------------------------------------------------
-- Toda ordenação é EXPLÍCITA. Sem `order by`, duas chamadas iguais podem
-- devolver ordens diferentes, e um teste de determinismo passaria por sorte.
create or replace function public.get_dashboard_aggregates(p_filters jsonb default '{}'::jsonb)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_uid  uuid;
  v_f    jsonb := coalesce(p_filters, '{}'::jsonb);
  v_ops  uuid[];
  v_from date;
  v_to   date;
  v_mods jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  perform app.validate_dashboard_filters(v_f);
  v_ops  := app.dashboard_operations(v_f);
  v_from := nullif(v_f->>'periodFrom','')::date;
  v_to   := nullif(v_f->>'periodTo','')::date;
  v_mods := coalesce(v_f->'modules', '[]'::jsonb);

  return jsonb_build_object(
    'contractVersion', '1.3.5-dashboard-1',
    'generatedAt',     now(),
    'today',           app.assisted_today()::text,
    'filters',         app.dashboard_filters_dto(v_f, v_ops),
    'ruleProvenance',  app.dashboard_rule_provenance(),

    'coverage', jsonb_build_object(
      'partners', coalesce(array_length(v_ops, 1), 0),
      'partnersWithAssisted', (
        select count(distinct c.operation_id) from public.assisted_cycles c
         where c.operation_id = any(v_ops)
           and (v_from is null or c.week_start_date >= v_from)
           and (v_to   is null or c.week_start_date <= v_to)),
      'partnersWithMonthlyAudit', (
        select count(distinct e.operation_id) from public.evaluations e
         where e.operation_id = any(v_ops)
           and e.evaluation_model = 'monthly_criteria'
           and (v_from is null or e.period_end   >= v_from)
           and (v_to   is null or e.period_start <= v_to))
    ),

    'assisted', jsonb_build_object(
      'cycles', jsonb_build_object(
        'total',  (select count(*) from public.assisted_cycles c
                    where c.operation_id = any(v_ops)
                      and (v_from is null or c.week_start_date >= v_from)
                      and (v_to   is null or c.week_start_date <= v_to)),
        'closed', (select count(*) from public.assisted_cycles c
                    where c.operation_id = any(v_ops) and c.status = 'closed'
                      and (v_from is null or c.week_start_date >= v_from)
                      and (v_to   is null or c.week_start_date <= v_to)),
        'draft',  (select count(*) from public.assisted_cycles c
                    where c.operation_id = any(v_ops) and c.status = 'draft'
                      and (v_from is null or c.week_start_date >= v_from)
                      and (v_to   is null or c.week_start_date <= v_to))
      ),
      'entryStatusCounts', (
        select jsonb_build_object(
                 'conforme',     count(*) filter (where e.status = 'conforme'),
                 'atencao',      count(*) filter (where e.status = 'atencao'),
                 'nao_conforme', count(*) filter (where e.status = 'nao_conforme'),
                 'sem_dado',     count(*) filter (where e.status = 'sem_dado'))
          from app.assisted_entries_in_scope(v_ops, v_from, v_to, v_f) e),
      'byIndicator', coalesce((
        select jsonb_agg(x order by x->>'indicatorCode')
          from (
            select jsonb_build_object(
                     'indicatorCode', e.indicator_code,
                     'indicatorName', min(e.indicator_name),
                     'themeCode',     min(e.theme_code),
                     'conforme',      count(*) filter (where e.status = 'conforme'),
                     'atencao',       count(*) filter (where e.status = 'atencao'),
                     'naoConforme',   count(*) filter (where e.status = 'nao_conforme'),
                     'semDado',       count(*) filter (where e.status = 'sem_dado')) as x
              from app.assisted_entries_in_scope(v_ops, v_from, v_to, v_f) e
             group by e.indicator_code) s), '[]'::jsonb),
      'evolution', coalesce((
        select jsonb_agg(x order by x->>'weekStartDate')
          from (
            select jsonb_build_object(
                     'weekStartDate', e.week_start_date::text,
                     'conforme',      count(*) filter (where e.status = 'conforme'),
                     'atencao',       count(*) filter (where e.status = 'atencao'),
                     'naoConforme',   count(*) filter (where e.status = 'nao_conforme'),
                     'semDado',       count(*) filter (where e.status = 'sem_dado')) as x
              from app.assisted_entries_in_scope(v_ops, v_from, v_to, v_f) e
             group by e.week_start_date) s), '[]'::jsonb)
    ),

    'monthlyAudit', jsonb_build_object(
      'audits', (
        select jsonb_build_object(
                 'total',     count(*),
                 'draft',     count(*) filter (where e.status = 'draft'),
                 'submitted', count(*) filter (where e.status = 'submitted'),
                 'returned',  count(*) filter (where e.status = 'returned'),
                 'approved',  count(*) filter (where e.status = 'approved'))
          from public.evaluations e
         where e.operation_id = any(v_ops) and e.evaluation_model = 'monthly_criteria'
           and (v_from is null or e.period_end   >= v_from)
           and (v_to   is null or e.period_start <= v_to)),
      'answerStatusCounts', (
        select jsonb_build_object(
                 'conforme',      count(*) filter (where a.status = 'conforme'),
                 'nao_conforme',  count(*) filter (where a.status = 'nao_conforme'),
                 'nao_aplicavel', count(*) filter (where a.status = 'nao_aplicavel'),
                 'nao_avaliado',  count(*) filter (where a.status = 'nao_avaliado'))
          from app.monthly_answers_in_scope(v_ops, v_from, v_to, v_f) a),
      'byCompetence', coalesce((
        select jsonb_agg(x order by x->>'competence')
          from (
            select jsonb_build_object(
                     'competence',   to_char(a.period_start, 'YYYY-MM'),
                     'audits',       count(distinct a.evaluation_id),
                     'conforme',     count(*) filter (where a.status = 'conforme'),
                     'naoConforme',  count(*) filter (where a.status = 'nao_conforme'),
                     'naoAplicavel', count(*) filter (where a.status = 'nao_aplicavel'),
                     'naoAvaliado',  count(*) filter (where a.status = 'nao_avaliado')) as x
              from app.monthly_answers_in_scope(v_ops, v_from, v_to, v_f) a
             group by to_char(a.period_start, 'YYYY-MM')) s), '[]'::jsonb)
    ),

    'actionPlans', (
      select jsonb_build_object(
        'byStatus', jsonb_build_object(
          'open',                 count(*) filter (where p.status = 'open'),
          'in_progress',          count(*) filter (where p.status = 'in_progress'),
          'waiting_partner',      count(*) filter (where p.status = 'waiting_partner'),
          'blocked',              count(*) filter (where p.status = 'blocked'),
          'done',                 count(*) filter (where p.status = 'done'),
          'validated',            count(*) filter (where p.status = 'validated'),
          'cancelled_justified',  count(*) filter (where p.status = 'cancelled_justified')),
        'bySource', jsonb_build_object(
          'legacy',        count(*) filter (where p.source = 'legacy'),
          'assisted',      count(*) filter (where p.source = 'assisted'),
          'monthly_audit', count(*) filter (where p.source = 'monthly_audit')),
        -- `overdue` DERIVADO da data, como desde 0025. Nunca lido de uma coluna
        -- gravada à mão.
        'overdue', count(*) filter (
          where p.status not in ('validated','done','cancelled_justified')
            and p.due_date < app.assisted_today()),
        'total', count(*))
        from public.action_plans p
       where p.operation_id = any(v_ops)
         and (v_from is null or p.due_date >= v_from)
         and (v_to   is null or p.due_date <= v_to)
         and (app.filter_len(v_f, 'modules') = 0
              or (v_mods ? 'assisted'      and p.source = 'assisted')
              or (v_mods ? 'monthly_audit' and p.source = 'monthly_audit')
              or (v_mods ? 'plans'))),

    'partners', coalesce((
      select jsonb_agg(x order by x->>'partnerName', x->>'operationId')
        from (
          select jsonb_build_object(
            'operationId', o.id,
            'partnerName', o.partner_name,
            'assisted', (
              select jsonb_build_object(
                       'conforme',    count(*) filter (where e.status = 'conforme'),
                       'atencao',     count(*) filter (where e.status = 'atencao'),
                       'naoConforme', count(*) filter (where e.status = 'nao_conforme'),
                       'semDado',     count(*) filter (where e.status = 'sem_dado'))
                from app.assisted_entries_in_scope(array[o.id]::uuid[], v_from, v_to, v_f) e),
            'monthlyAudit', (
              select jsonb_build_object(
                       'conforme',     count(*) filter (where a.status = 'conforme'),
                       'naoConforme',  count(*) filter (where a.status = 'nao_conforme'),
                       'naoAplicavel', count(*) filter (where a.status = 'nao_aplicavel'),
                       'naoAvaliado',  count(*) filter (where a.status = 'nao_avaliado'))
                from app.monthly_answers_in_scope(array[o.id]::uuid[], v_from, v_to, v_f) a),
            'openPlans', (
              select count(*) from public.action_plans p
               where p.operation_id = o.id
                 and p.status not in ('validated','done','cancelled_justified'))
          ) as x
            from public.operations o where o.id = any(v_ops)) s), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 8. As duas fontes filtradas, uma vez cada
-- ---------------------------------------------------------------------------
-- Extraídas para função própria porque as agregações as consultam sete vezes.
-- Repetir o `where` seria repetir a regra de escopo — e regra repetida diverge
-- no primeiro conserto (ADR-135-002, D-J).
create or replace function app.assisted_entries_in_scope(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns table (
  operation_id uuid, week_start_date date, status app.assisted_status,
  indicator_code text, indicator_name text, theme_code text
)
  language sql stable security definer set search_path = public, app as $$
  select c.operation_id, c.week_start_date, e.status,
         e.indicator_code, e.indicator_name, e.theme_code
    from public.assisted_cycle_entries e
    join public.assisted_cycles c on c.id = e.cycle_id
   where c.operation_id = any(p_ops)
     and (p_from is null or c.week_start_date >= p_from)
     and (p_to   is null or c.week_start_date <= p_to)
     and (app.filter_len(p_filters, 'themeIds') = 0
          or e.theme_id::text in (select jsonb_array_elements_text(p_filters->'themeIds')))
     and (app.filter_len(p_filters, 'indicatorIds') = 0
          or e.indicator_definition_id::text in
             (select jsonb_array_elements_text(p_filters->'indicatorIds')))
     and (app.filter_len(p_filters, 'statuses') = 0
          or e.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
     and (app.filter_len(p_filters, 'modules') = 0
          or coalesce(p_filters->'modules' ? 'assisted', false))
$$;

create or replace function app.monthly_answers_in_scope(
  p_ops uuid[], p_from date, p_to date, p_filters jsonb
) returns table (
  operation_id uuid, evaluation_id uuid, period_start date,
  status app.criterion_answer_status, indicator_code text, theme_code text
)
  language sql stable security definer set search_path = public, app as $$
  select e.operation_id, e.id, e.period_start, a.status, k.indicator_code, k.theme_code
    from public.evaluation_criterion_answers a
    join public.evaluation_criteria k on k.id = a.evaluation_criterion_id
    join public.evaluations e on e.id = a.evaluation_id
   where e.operation_id = any(p_ops)
     and e.evaluation_model = 'monthly_criteria'
     and (p_from is null or e.period_end   >= p_from)
     and (p_to   is null or e.period_start <= p_to)
     and (app.filter_len(p_filters, 'themeIds') = 0
          or k.theme_id::text in (select jsonb_array_elements_text(p_filters->'themeIds')))
     and (app.filter_len(p_filters, 'indicatorIds') = 0
          or k.indicator_definition_id::text in
             (select jsonb_array_elements_text(p_filters->'indicatorIds')))
     and (app.filter_len(p_filters, 'statuses') = 0
          or a.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
     and (app.filter_len(p_filters, 'modules') = 0
          or coalesce(p_filters->'modules' ? 'monthly_audit', false))
$$;

revoke all on function app.assisted_entries_in_scope(uuid[], date, date, jsonb)
  from public, anon, authenticated;
revoke all on function app.monthly_answers_in_scope(uuid[], date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. `get_matrix_dataset`
-- ---------------------------------------------------------------------------
-- A regra de gravidade e a de quadrante são as de `performanceMatrix.ts`,
-- transcritas para SQL sem alteração de limite. Ver §2 do cabeçalho.
create or replace function public.get_matrix_dataset(p_filters jsonb default '{}'::jsonb)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_uid  uuid;
  v_f    jsonb := coalesce(p_filters, '{}'::jsonb);
  v_ops  uuid[];
  v_from date;
  v_to   date;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  perform app.validate_dashboard_filters(v_f);
  v_ops  := app.dashboard_operations(v_f);
  v_from := nullif(v_f->>'periodFrom','')::date;
  v_to   := nullif(v_f->>'periodTo','')::date;

  return jsonb_build_object(
    'contractVersion', '1.3.5-matrix-1',
    'generatedAt',     now(),
    'filters',         app.dashboard_filters_dto(v_f, v_ops),
    'ruleProvenance',  app.dashboard_rule_provenance(),
    'quadrantLabels',  jsonb_build_object(
      'healthy',                'Saudavel',
      'ineffective_routine',    'Processo cumprido, resultado insuficiente',
      'result_without_process', 'Resultado sem processo',
      'critical',               'Critico',
      'no_data',                'Sem dado suficiente'),
    'entries', coalesce((
      select jsonb_agg(app.matrix_entry_dto(o.id, v_from, v_to, v_f)
                       order by o.partner_name, o.id)
        from public.operations o where o.id = any(v_ops)), '[]'::jsonb)
  );
end $$;

create or replace function app.matrix_entry_dto(
  p_op uuid, p_from date, p_to date, p_filters jsonb
) returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_region     uuid;
  v_name       text;
  v_conf       bigint; v_aten bigint; v_nc bigint; v_sd bigint;
  v_perf_axis  text;
  v_perf_score numeric;
  v_score      numeric;
  v_light      app.traffic_light;
  v_proc_axis  text;
  v_audits     bigint;
  v_quadrant   text;
  v_reasons    jsonb := '[]'::jsonb;
  v_w          jsonb;
  v_index      jsonb := null;
begin
  select o.partner_name, u.region_id into v_name, v_region
    from public.operations o join public.units u on u.id = o.unit_id where o.id = p_op;

  -- EIXO DE DESEMPENHO — Gestão Assistida. Gravidade máxima vence, como na 1.3.4.
  select count(*) filter (where e.status = 'conforme'),
         count(*) filter (where e.status = 'atencao'),
         count(*) filter (where e.status = 'nao_conforme'),
         count(*) filter (where e.status = 'sem_dado')
    into v_conf, v_aten, v_nc, v_sd
    from app.assisted_entries_in_scope(array[p_op]::uuid[], p_from, p_to, p_filters) e;

  v_perf_axis := case
    when v_nc > 0                      then 'critical'
    when v_aten > 0                    then 'attention'
    when v_conf > 0                    then 'on_target'
    else 'no_measurement' end;

  -- Nota do eixo: PROVISÓRIA, pendência A-11. `sem_dado` fora dos dois lados.
  v_perf_score := case when (v_conf + v_aten + v_nc) = 0 then null
                       else round(v_conf::numeric * 100 / (v_conf + v_aten + v_nc), 2) end;

  -- EIXO DE PROCESSO — Auditoria Mensal APROVADA mais recente no período.
  select e.score, count(*) over () into v_score, v_audits
    from public.evaluations e
   where e.operation_id = p_op
     and e.evaluation_model = 'monthly_criteria'
     and e.status = 'approved'
     and (p_from is null or e.period_end   >= p_from)
     and (p_to   is null or e.period_start <= p_to)
   order by e.period_start desc, e.id desc
   limit 1;

  v_light := app.score_traffic_light(v_score);
  v_proc_axis := case when v_score is null then 'no_audit' else v_light::text end;

  -- QUADRANTE — a tabela de quatro células da 1.3.4, sem limite novo.
  if v_score is null then v_reasons := v_reasons || '["missing_audit"]'::jsonb; end if;
  if v_perf_axis = 'no_measurement' then v_reasons := v_reasons || '["missing_measurement"]'::jsonb; end if;

  if jsonb_array_length(v_reasons) > 0 then
    v_quadrant := null;
  else
    v_quadrant := case
      when v_light = 'green' and v_perf_axis = 'on_target' then 'healthy'
      when v_light = 'green'                               then 'ineffective_routine'
      when v_perf_axis = 'on_target'                       then 'result_without_process'
      else 'critical' end;
  end if;

  -- ÍNDICE PONDERADO — só com ponderação publicada E os dois módulos presentes.
  -- Sem renormalização: se um módulo falta, não há índice. Ponto.
  v_w := app.region_weighting_dto(v_region);
  if (v_w->>'configured')::boolean and v_perf_score is not null and v_score is not null then
    v_index := jsonb_build_object(
      'value', round(
        v_perf_score * (v_w->>'assistedWeight')::numeric / 100
        + v_score     * (v_w->>'auditWeight')::numeric / 100, 2)::double precision,
      'assistedComponent', v_perf_score::double precision,
      'auditComponent',    v_score::double precision,
      'weightingVersionId', v_w->>'id',
      'provisional', true,
      'provisionalReason', 'A-10 e A-11 abertas: as duas notas sao proporcao simples');
  end if;

  return jsonb_build_object(
    'operationId', p_op,
    'partnerName', v_name,
    'regionId',    v_region,
    'performance', jsonb_build_object(
      'axis', v_perf_axis,
      'score', v_perf_score::double precision,
      'conforme', v_conf, 'atencao', v_aten, 'naoConforme', v_nc, 'semDado', v_sd),
    'process', jsonb_build_object(
      'axis', v_proc_axis,
      'score', v_score::double precision,
      'trafficLight', v_light::text,
      'auditsConsidered', coalesce(v_audits, 0)),
    'quadrant',      v_quadrant,
    'dataSufficiency', jsonb_build_object(
      'sufficient', jsonb_array_length(v_reasons) = 0,
      'reasons',    v_reasons),
    'weighting',     v_w,
    'weightedIndex', v_index
  );
end $$;

revoke all on function app.matrix_entry_dto(uuid, date, date, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Grants mínimos
-- ---------------------------------------------------------------------------
revoke all on function public.catalog_save_region_weighting_draft(uuid, jsonb) from public, anon;
revoke all on function public.catalog_publish_region_weighting(uuid)           from public, anon;
revoke all on function public.get_weighting_status(uuid)                       from public, anon;
revoke all on function public.get_dashboard_aggregates(jsonb)                  from public, anon;
revoke all on function public.get_matrix_dataset(jsonb)                        from public, anon;

grant execute on function public.catalog_save_region_weighting_draft(uuid, jsonb) to authenticated;
grant execute on function public.catalog_publish_region_weighting(uuid)           to authenticated;
grant execute on function public.get_weighting_status(uuid)                       to authenticated;
grant execute on function public.get_dashboard_aggregates(jsonb)                  to authenticated;
grant execute on function public.get_matrix_dataset(jsonb)                        to authenticated;
