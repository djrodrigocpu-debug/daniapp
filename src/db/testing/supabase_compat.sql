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

create table if not exists auth.users (
  id           uuid primary key default gen_random_uuid(),
  email        text unique,
  created_at   timestamptz not null default now()
);

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

-- Acesso de esquema equivalente ao Supabase (as policies fazem o resto).
grant usage on schema public to anon, authenticated, service_role;
