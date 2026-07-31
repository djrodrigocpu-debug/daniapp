-- =============================================================================
-- AAPEX / AACE V2.0 — Camada de compatibilidade Supabase para banco executável
-- =============================================================================
-- Objetivo: permitir executar as MIGRATIONS REAIS (0001/0002/0003) e a SEED de
-- catálogo contra um PostgreSQL de verdade (PGlite / WASM, PG18) sem depender de
-- Docker ou de um projeto Supabase provisionado. Reproduz apenas o mínimo que o
-- Supabase provê por padrão e que o nosso schema/RLS assume:
--   * papéis `anon`, `authenticated`, `service_role`;
--   * schema `auth` com `auth.users` e `auth.uid()` (lê o claim JWT da sessão);
--   * GRANTs de esquema equivalentes ao ambiente Supabase.
--
-- IMPORTANTE: este arquivo é EXCLUSIVO de teste/homologação local. Não é uma
-- migration versionada e nunca roda em produção — no ambiente Supabase real esses
-- objetos já existem. Assim as migrations permanecem intactas e rastreáveis (§28).
-- =============================================================================

-- Papéis padrão do Supabase (no PGlite a sessão é superuser/postgres).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Schema e função de identidade. auth.uid() lê o "sub" do JWT injetado na sessão
-- (via set_config('request.jwt.claims'|'request.jwt.claim.sub')), exatamente como
-- o PostgREST faz por requisição autenticada.
create schema if not exists auth;

-- `email_confirmed_at` reproduz o sinal do GoTrue de que o convite foi aceito e
-- há credencial utilizável — é o que public.admin_activate_confirmed_users
-- consulta para promover 'invited' → 'active'.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

-- `encrypted_password` existe no `auth.users` real do Supabase; o shim o mantém
-- por fidelidade. NENHUMA migration o lê: a 0016 chegou a compará-lo como prova
-- de troca de senha, e a 0017 removeu isso — bcrypt usa salt aleatório, então a
-- mesma senha gera hash diferente e a comparação não provava nada.
alter table auth.users add column if not exists encrypted_password text;

create or replace function auth.uid() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function auth.role() returns text
  language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'authenticated'
  )
$$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schema `storage` — o mínimo do Supabase Storage que as migrations assumem
-- ---------------------------------------------------------------------------
-- Acrescentado na 1.3.1. Sem ele, a 0007 e a 0028 caíam no ramo "storage não
-- existe" e as policies do bucket NUNCA eram exercitadas em teste — foi assim
-- que D-03 (validador recebia "Object not found") passou despercebido: o teste
-- não tinha onde falhar. Com estas duas tabelas, as policies reais são criadas
-- e avaliadas no harness, e o "upload" do teste é o INSERT em storage.objects,
-- que é exatamente o que o cliente faz pela API do Storage.
--
-- Reproduz só as colunas de que as policies e as RPCs dependem. O Storage real
-- tem mais colunas; nenhuma delas participa da decisão de acesso.
create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets(id),
  name       text not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

-- No Supabase a RLS de storage.objects já vem ligada; aqui é explícito.
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
-- `anon` recebe SELECT de propósito, como no Supabase real: assim quem nega o
-- acesso anônimo ao objeto é a POLICY (que é `to authenticated`), e não um grant
-- ausente. Um teste que passasse por falta de grant não provaria a policy.
grant select on storage.objects to anon;
grant select, insert, delete on storage.objects to authenticated, service_role;

-- Acesso de esquema equivalente ao Supabase (as policies fazem o resto).
grant usage on schema public to anon, authenticated, service_role;
