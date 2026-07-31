-- =============================================================================
-- AAPEX 1.3.1 — Migration 0028: evidência física e leitura por escopo (D-02, D-03)
-- =============================================================================
-- D-02 — A EVIDÊNCIA NUNCA CHEGAVA AO STORAGE.
-- O fluxo oficial da tela chamava `add_evidence`, que gravava metadata com
-- status 'stored' e criava o vínculo com a resposta — sem que nenhum byte
-- subisse. Havia um repositório de upload no cliente, mas ele não estava no
-- caminho da tela. Resultado observado na simulação: 142 metadados, 142 vínculos
-- e ZERO objetos no bucket. Pior que perder o arquivo, o sistema AFIRMAVA tê-lo
-- guardado, e o portão de "evidência obrigatória" era satisfeito por um registro
-- que não apontava para nada.
--
-- Storage e PostgreSQL não compartilham transação, então a integridade vem da
-- ORDEM e de compensação explícita, em três passos:
--
--   1. `reserve_evidence_upload`  → valida tudo e devolve um caminho reservado.
--                                   NÃO cria metadata: cria uma RESERVA.
--   2. o cliente sobe o binário    → exatamente naquele caminho, com o próprio JWT.
--   3. `confirm_evidence_upload`  → confere que o objeto EXISTE e só então cria
--                                   metadata + vínculo, na mesma transação.
--
-- Assim `evidence_files` nunca passa a existir sem arquivo, e o vínculo nasce
-- junto com o metadata. Se o upload falha, o cliente chama
-- `discard_evidence_reservation`; se a confirmação falha, o cliente apaga o
-- objeto que acabou de subir. A reserva é o único estado intermediário, e ela
-- não conta para nada: não aparece em `ui_evidences` nem satisfaz o portão de
-- envio, porque ambos dependem do vínculo.
--
-- D-03 — O VALIDADOR NÃO CONSEGUIA ABRIR A EVIDÊNCIA.
-- A policy de leitura do bucket era `owner = auth.uid() or app.is_admin()`. O
-- metadata e a RPC `evidence_path` já reconheciam o acesso por escopo, mas o
-- Storage recusava o objeto: um Coordenador autorizado, dentro do próprio
-- escopo, recebia "Object not found". A policy passa a decidir pelo METADATA
-- REAL — casa `storage.objects.name` com `evidence_files.path` e daí chega à
-- avaliação e à operação, reaproveitando `app.has_operation_access`. Não é
-- prefixo de caminho: caminho adivinhado ou manipulado não casa com metadata
-- nenhum e é recusado.
--
-- O bucket continua PRIVADO, sem URL pública e sem SELECT genérico para
-- `authenticated`. `service_role` não é usado pelo cliente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Reserva de upload — estado intermediário, fora de `evidence_files`
-- ---------------------------------------------------------------------------
-- Existe para que o caminho do objeto seja decidido pelo SERVIDOR antes de o
-- binário subir, sem que isso já crie um metadata que talvez nunca ganhe
-- arquivo. É também o que a policy de INSERT do bucket consulta: sem reserva
-- própria, o usuário não escreve em caminho nenhum.
create table if not exists public.evidence_upload_reservations (
  id             uuid primary key default gen_random_uuid(),
  evaluation_id  uuid not null references public.evaluations(id) on delete cascade,
  answer_id      uuid not null references public.evaluation_answers(id) on delete cascade,
  bucket         text not null,
  path           text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0),
  original_name  text not null,
  author_user_id uuid not null references public.users(id),
  created_at     timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists evidence_reservation_author_idx
  on public.evidence_upload_reservations(author_user_id, created_at);

-- RLS ligada e FORÇADA, e SEM policy alguma: nenhum acesso direto do cliente.
-- Toda escrita passa pelas RPCs `security definer` abaixo, e a policy do bucket
-- lê a tabela por uma função `security definer` — nunca com o privilégio do
-- usuário. `force` mantém o padrão das demais tabelas do schema (0002).
alter table public.evidence_upload_reservations enable row level security;
alter table public.evidence_upload_reservations force row level security;

-- ---------------------------------------------------------------------------
-- Nome de arquivo seguro
-- ---------------------------------------------------------------------------
-- O nome vem do dispositivo do usuário e vira parte do caminho do objeto. Três
-- passos, cada um fechando uma coisa:
--   1. só sobrevivem letras, dígitos, ponto, hífen e sublinhado — em especial
--      NÃO sobrevive a barra, que criaria um segmento de caminho extra e
--      quebraria tanto a correspondência com o metadata quanto a extração do
--      nome em `ui_evidences`;
--   2. sequências de pontos viram um ponto só, para que '..' nunca chegue ao
--      nome do objeto;
--   3. pontos, hífens e sublinhados iniciais caem, para não gerar nome oculto
--      nem nome começando com separador.
create or replace function app.evidence_safe_name(p_name text) returns text
  language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    nullif(
      left(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9._-]+', '_', 'g'),
            '\.{2,}', '.', 'g'),
          '^[._-]+', ''),
        120),
      ''),
    'arquivo'
  )
$$;

-- ---------------------------------------------------------------------------
-- O objeto existe mesmo no bucket?
-- ---------------------------------------------------------------------------
-- Usada só dentro de `confirm_evidence_upload`: é a pergunta que separa "o
-- usuário mandou" de "o arquivo está lá". Sem grant para `authenticated`.
create or replace function app.evidence_object_exists(p_bucket text, p_name text) returns boolean
  language plpgsql stable security definer set search_path = public, app as $$
declare v_existe boolean;
begin
  select exists (
    select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_name
  ) into v_existe;
  return coalesce(v_existe, false);
end $$;

-- ---------------------------------------------------------------------------
-- Autorização de ESCRITA no bucket: só em caminho reservado pelo próprio autor
-- ---------------------------------------------------------------------------
create or replace function app.evidence_object_reserved(p_name text) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.evidence_upload_reservations r
     where r.bucket = 'evidencias' and r.path = p_name and r.author_user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Autorização de LEITURA no bucket: pelo metadata real, não pelo caminho (D-03)
-- ---------------------------------------------------------------------------
-- Autor, administrador ou quem tem acesso à OPERAÇÃO da avaliação de origem —
-- o que cobre Coordenador da coordenadoria, Gerência Regional da região e GC do
-- parceiro. Objeto sem metadata correspondente não é autorizado a ninguém.
create or replace function app.can_read_evidence_object(p_name text) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1
      from public.evidence_files ef
      join public.evaluations e on e.id = ef.source_object_id
     where ef.bucket = 'evidencias'
       and ef.path = p_name
       and (
         ef.author_user_id = auth.uid()
         or app.is_admin()
         or app.has_operation_access(e.operation_id)
       )
  )
$$;

-- ---------------------------------------------------------------------------
-- Passo 1 — reservar o caminho
-- ---------------------------------------------------------------------------
create or replace function public.reserve_evidence_upload(
  p_evaluation_id uuid, p_theme_id text, p_input jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_op uuid; v_author uuid; v_status app.evaluation_status; v_answer uuid;
  v_mime text; v_size bigint; v_name text; v_path text; v_res uuid;
begin
  select operation_id, author_user_id, status into v_op, v_author, v_status
    from public.evaluations where id = p_evaluation_id;
  if v_op is null then raise exception 'avaliacao inexistente'; end if;
  if v_author <> auth.uid() or not app.has_operation_access(v_op) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('draft','returned') then
    raise exception 'evidencia so em rascunho/devolvida' using errcode = 'integrity_constraint_violation';
  end if;

  select ea.id into v_answer from public.evaluation_answers ea
    join public.audit_items ai on ai.id = ea.item_id
   where ea.evaluation_id = p_evaluation_id and ai.code = p_theme_id;
  if v_answer is null then raise exception 'item % nao pertence a avaliacao', p_theme_id; end if;

  -- As mesmas regras que o cliente aplica, aplicadas de novo aqui: o cliente
  -- valida para dar mensagem boa, o servidor valida porque é quem decide.
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

  -- Higiene: reservas do próprio autor abandonadas há mais de uma hora (o app
  -- fechou no meio do upload, por exemplo) deixam de autorizar escrita.
  delete from public.evidence_upload_reservations
   where author_user_id = auth.uid() and created_at < now() - interval '1 hour';

  -- Caminho decidido pelo SERVIDOR. Formato preservado da 0006
  -- ('<themeId>/<uuid>-<nome>') porque `ui_evidences` extrai o nome dele.
  v_name := app.evidence_safe_name(p_input->>'name');
  v_path := p_theme_id || '/' || gen_random_uuid()::text || '-' || v_name;

  insert into public.evidence_upload_reservations (
    evaluation_id, answer_id, bucket, path, mime_type, size_bytes, original_name, author_user_id
  ) values (
    p_evaluation_id, v_answer, 'evidencias', v_path, v_mime, v_size,
    coalesce(p_input->>'name', v_name), auth.uid()
  ) returning id into v_res;

  return jsonb_build_object(
    'reservationId', v_res, 'bucket', 'evidencias', 'path', v_path, 'name', v_name
  );
end $$;

-- ---------------------------------------------------------------------------
-- Passo 3 — confirmar: metadata e vínculo só depois do arquivo existir
-- ---------------------------------------------------------------------------
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

  -- A trava que fecha D-02: sem objeto no bucket, não nasce metadata.
  if not app.evidence_object_exists(r.bucket, r.path) then
    raise exception 'arquivo nao chegou ao armazenamento'
      using errcode = 'integrity_constraint_violation';
  end if;

  insert into public.evidence_files (
    bucket, path, mime_type, size_bytes, author_user_id, source_object_id, status
  ) values (
    r.bucket, r.path, r.mime_type, r.size_bytes, auth.uid(), r.evaluation_id, 'stored'
  ) returning id into v_evid;

  insert into public.evaluation_answer_evidence (answer_id, evidence_id)
  values (r.answer_id, v_evid);

  delete from public.evidence_upload_reservations where id = r.id;

  select ai.code into v_theme from public.evaluation_answers ea
    join public.audit_items ai on ai.id = ea.item_id where ea.id = r.answer_id;

  return jsonb_build_object(
    'id', v_evid, 'themeId', v_theme, 'name', r.original_name, 'uri', r.path,
    'mimeType', r.mime_type,
    'type', (case when r.mime_type like 'image/%' then 'photo' else 'document' end),
    'status', 'stored', 'sizeBytes', r.size_bytes, 'createdAt', now()
  );
end $$;

-- ---------------------------------------------------------------------------
-- Compensação — descartar a reserva quando o upload não completou
-- ---------------------------------------------------------------------------
create or replace function public.discard_evidence_reservation(p_reservation_id uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_author uuid;
begin
  select author_user_id into v_author from public.evidence_upload_reservations
   where id = p_reservation_id;
  -- Reserva já inexistente é sucesso: descartar duas vezes não é erro.
  if v_author is null then return; end if;
  if v_author <> auth.uid() then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  delete from public.evidence_upload_reservations where id = p_reservation_id;
end $$;

-- ---------------------------------------------------------------------------
-- Remoção: `remove_evidence` permanece como está
-- ---------------------------------------------------------------------------
-- Ela apaga vínculo e metadata, e não tem como apagar o binário (Storage não é
-- PostgreSQL). O caminho do objeto o cliente obtém ANTES, pela `evidence_path`
-- que já existe e já é verificada por escopo; então remove o metadata e só
-- depois o objeto. Nessa ordem, uma falha na segunda etapa deixa no máximo um
-- objeto órfão — nunca um metadata apontando para arquivo inexistente — e o
-- cliente reporta a falha em vez de anunciar sucesso.

-- ---------------------------------------------------------------------------
-- `add_evidence` sai de cena
-- ---------------------------------------------------------------------------
-- Era a função que criava metadata 'stored' sem arquivo nenhum. Mantê-la
-- executável deixaria o caminho defeituoso aberto ao lado do corrigido.
drop function if exists public.add_evidence(uuid, text, jsonb);

-- ---------------------------------------------------------------------------
-- Metadata e vínculo deixam de aceitar escrita direta do cliente
-- ---------------------------------------------------------------------------
-- `evidence_author_write` permitia ao cliente INSERIR em `evidence_files` com
-- qualquer caminho e status 'stored', e `answer_evidence_write` permitia criar
-- o vínculo — ou seja, dava para satisfazer o portão de evidência obrigatória
-- sem arquivo algum, por baixo das RPCs. Nenhum código do app escreve nessas
-- tabelas direto (tudo passa por RPC `security definer`, que roda como dono e
-- não é afetada por policy), então retirar a escrita não tira função nenhuma —
-- só fecha a porta. A LEITURA por escopo continua exatamente como estava.
drop policy if exists evidence_author_write on public.evidence_files;
drop policy if exists answer_evidence_write on public.evaluation_answer_evidence;

-- ---------------------------------------------------------------------------
-- Policies do bucket privado (guardadas por existência do schema `storage`)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'objects') then

    insert into storage.buckets (id, name, public)
    values ('evidencias', 'evidencias', false)
    on conflict (id) do nothing;

    -- LEITURA por escopo real (D-03).
    execute $p$drop policy if exists evidencias_read on storage.objects$p$;
    execute $p$
      create policy evidencias_read on storage.objects for select to authenticated
      using (bucket_id = 'evidencias' and app.can_read_evidence_object(name))
    $p$;

    -- ESCRITA apenas em caminho reservado pelo próprio autor (D-02).
    execute $p$drop policy if exists evidencias_insert on storage.objects$p$;
    execute $p$
      create policy evidencias_insert on storage.objects for insert to authenticated
      with check (
        bucket_id = 'evidencias'
        and owner = auth.uid()
        and app.evidence_object_reserved(name)
      )
    $p$;

    -- REMOÇÃO pelo dono ou administrador: é o que permite a compensação
    -- (apagar o objeto quando o metadata não pôde ser criado).
    execute $p$drop policy if exists evidencias_delete on storage.objects$p$;
    execute $p$
      create policy evidencias_delete on storage.objects for delete to authenticated
      using (bucket_id = 'evidencias' and (owner = auth.uid() or app.is_admin()))
    $p$;

  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants mínimos
-- ---------------------------------------------------------------------------
-- As duas funções abaixo são avaliadas DENTRO das policies, no papel do usuário
-- — por isso precisam de execute para `authenticated`.
revoke all on function app.can_read_evidence_object(text) from public, anon;
revoke all on function app.evidence_object_reserved(text) from public, anon;
grant execute on function app.can_read_evidence_object(text) to authenticated;
grant execute on function app.evidence_object_reserved(text) to authenticated;

-- Estas só rodam dentro de `security definer`: nenhum grant para o cliente.
revoke all on function app.evidence_object_exists(text, text) from public, anon, authenticated;
revoke all on function app.evidence_safe_name(text) from public, anon, authenticated;

revoke all on function public.reserve_evidence_upload(uuid, text, jsonb) from public, anon;
revoke all on function public.confirm_evidence_upload(uuid) from public, anon;
revoke all on function public.discard_evidence_reservation(uuid) from public, anon;
grant execute on function
  public.reserve_evidence_upload(uuid, text, jsonb),
  public.confirm_evidence_upload(uuid),
  public.discard_evidence_reservation(uuid)
to authenticated;
