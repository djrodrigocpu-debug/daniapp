-- =============================================================================
-- AAPEX 1.3.5 — Migration 0039: núcleo da GESTÃO ASSISTIDA semanal
-- =============================================================================
-- O QUE ESTA MIGRATION CRIA. O domínio próprio que a decisão D1 exige, com
-- palavras dela: "não sobrecarregar silenciosamente `evaluations` com um segundo
-- significado incompatível". A Gestão Assistida é semanal, o dado vem de fonte
-- externa e o produto é diagnóstico + plano — nada disso é o que `evaluations`
-- significa, e por isso não mora lá.
--
-- DE ONDE VEM A META. Não de `indicator_versions`. Vem da versão PUBLICADA e
-- VIGENTE de `indicator_regional_config_versions` da região da operação
-- (ADR-135-001, decisões D-B e D-D). `indicator_versions.target`,
-- `yellow_tolerance` e `weight` continuam existindo por compatibilidade e NÃO
-- são lidos por este módulo.
--
-- O QUE É MATERIALIZADO E POR QUÊ. Meta, tolerância, peso, unidade, direção,
-- tema e os nomes são COPIADOS para a entrada no ato do registro. É o que
-- impede o recálculo histórico exigido por D2: mudar a meta amanhã não pode
-- reescrever o status de ontem. Copiar não é desnormalizar por preguiça — é o
-- requisito.
--
-- IDEMPOTÊNCIA NO BANCO. `unique (operation_id, week_start_date)` é constraint,
-- não verificação de aplicação. É o que fecha a lacuna do achado O-06, em que a
-- idempotência dependia de `(operação, frequência)` e só valia para rascunho.
--
-- ADITIVA. Nenhuma tabela existente é tocada por esta migration. Nada é aplicado
-- em staging ou produção por esta sessão.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
-- Blocos defensivos pelo mesmo motivo da 0036: o rollback 0001 derruba
-- `schema app cascade` e o harness reaplica todas as migrations sobre o mesmo
-- banco. Sem o guarda, um `reset()` que preservasse o tipo quebraria a
-- reaplicação.
do $$ begin
  create type app.assisted_cycle_status as enum ('draft', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.assisted_status as enum ('conforme', 'atencao', 'nao_conforme', 'sem_dado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. A semana empresarial
-- ---------------------------------------------------------------------------
-- Semana de SEGUNDA a DOMINGO, identificada pela segunda-feira. Duas funções
-- porque são duas perguntas diferentes:
--
--   `app.assisted_week_start(date)` — de que semana é ESTE dia? Opera sobre
--   `date`, que já é um dia de calendário: não há fuso a aplicar e a função é
--   IMMUTABLE, podendo ser usada em CHECK e em índice.
--
--   `app.assisted_today()` — que dia é hoje NA EMPRESA? Aqui o fuso importa, e
--   `America/Sao_Paulo` é o mesmo default que `units.timezone` já usa desde
--   0001. STABLE, porque depende de `now()`.
--
-- A separação existe para que o cálculo da semana seja testável sem viajar no
-- tempo, e para que o relógio do cliente nunca entre na conta (risco RT-04).
create or replace function app.assisted_week_start(p_day date) returns date
  language sql immutable as $$
  select p_day - (extract(isodow from p_day)::int - 1)
$$;

create or replace function app.assisted_today() returns date
  language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- ---------------------------------------------------------------------------
-- 3. Regra de status — AUTORITATIVA, server-side
-- ---------------------------------------------------------------------------
-- Tabela de D2, literal:
--
--   higher_better | realizado >= meta | abaixo da meta, DENTRO da tolerância | além
--   lower_better  | realizado <= meta | acima da meta, DENTRO da tolerância  | além
--
-- `target_band` NÃO TEM REGRA. A pendência A-01 continua aberta e a função
-- FALHA EXPLICITAMENTE. Não converte para higher_better, não converte para
-- lower_better, não inventa faixa e não devolve `sem_dado` para disfarçar. A
-- recusa vem ANTES do teste de nulo de propósito: um indicador sem regra de
-- status não tem status nem quando o valor falta — dizer `sem_dado` sugeriria
-- que bastaria informar o número.
--
-- `sem_dado` é ausência de dado, e NÃO é não conformidade (Modelo Operacional
-- §2.4). Alimenta o quadrante "Sem dado suficiente" da Matriz.
--
-- IMMUTABLE: depende só dos argumentos. É o que permite provar que o status
-- gravado é reproduzível a partir da regra materializada.
create or replace function app.assisted_status_of(
  p_direction app.indicator_direction,
  p_target    numeric,
  p_tolerance numeric,
  p_actual    numeric
) returns app.assisted_status
  language plpgsql immutable as $$
declare v_tol numeric := coalesce(p_tolerance, 0);
begin
  if p_direction = 'target_band' then
    raise exception 'direcao target_band sem regra de status definida (pendencia A-01): '
                    'a Gestao Assistida nao calcula status para este indicador'
      using errcode = 'feature_not_supported';
  end if;

  if p_actual is null then
    return 'sem_dado';
  end if;

  if p_target is null then
    raise exception 'meta ausente: status da Gestao Assistida exige meta materializada'
      using errcode = 'integrity_constraint_violation';
  end if;

  if p_direction = 'higher_better' then
    if p_actual >= p_target then          return 'conforme';
    elsif p_actual >= p_target - v_tol then return 'atencao';
    else                                   return 'nao_conforme';
    end if;
  end if;

  -- lower_better
  if p_actual <= p_target then            return 'conforme';
  elsif p_actual <= p_target + v_tol then return 'atencao';
  else                                    return 'nao_conforme';
  end if;
end $$;

-- Identificador da regra materializada no fechamento. Muda quando a regra de
-- cálculo mudar — inclusive quando A-01 for decidida e `target_band` passar a
-- ter comportamento. Ciclo fechado guarda a versão que o fechou, e é por isso
-- que uma regra nova não reescreve status antigo.
create or replace function app.assisted_rule_version() returns text
  language sql immutable as $$
  select 'assisted-status/1.3.5-a'::text
$$;

-- ---------------------------------------------------------------------------
-- 4. Autoridade de execução
-- ---------------------------------------------------------------------------
-- A Matriz de Permissões §3 é explícita: abrir, registrar, diagnosticar, criar
-- plano e fechar são do GERENTE DE CANAL responsável pelo parceiro. ADMIN,
-- REGIONAL e COORDENADOR CONSULTAM — e a nota de rodapé ¹ diz por quê: se a
-- operação exigir que outro papel registre em nome do GC, isso é regra de
-- negócio ainda não declarada, e não se presume.
--
-- Consequência deliberada: `app.is_admin()` NÃO é atalho aqui. Ter permissão
-- administrativa não é o mesmo que ser o responsável operacional pelo parceiro.
--
-- O vínculo é lido das DUAS formas que o schema usa para dizer "este GC atende
-- este parceiro": a atribuição ativa (`operation_assignments`, que é o que
-- `app.has_operation_access` consulta) e o titular nomeado na própria operação.
-- As duas amarram o usuário a ESTA operação; nenhuma delas amplia escopo.
create or replace function app.is_assisted_operator(p_operation_id uuid) returns boolean
  language sql stable security definer set search_path = public, app as $$
  select auth.uid() is not null
     and p_operation_id is not null
     and app.has_role('channel_manager')
     and (
       exists (
         select 1 from public.operation_assignments a
          where a.operation_id = p_operation_id
            and a.user_id = auth.uid()
            and a.active
            and (a.valid_to is null or a.valid_to > now())
       )
       or exists (
         select 1 from public.operations o
          where o.id = p_operation_id and o.channel_manager_user_id = auth.uid()
       )
     )
$$;

revoke all on function app.assisted_week_start(date)  from public, anon;
revoke all on function app.assisted_today()           from public, anon;
revoke all on function app.assisted_rule_version()    from public, anon;
revoke all on function app.is_assisted_operator(uuid) from public, anon;
revoke all on function app.assisted_status_of(app.indicator_direction, numeric, numeric, numeric)
  from public, anon;
grant execute on function app.assisted_week_start(date)  to authenticated;
grant execute on function app.assisted_today()           to authenticated;
grant execute on function app.assisted_rule_version()    to authenticated;
grant execute on function app.is_assisted_operator(uuid) to authenticated;
grant execute on function app.assisted_status_of(app.indicator_direction, numeric, numeric, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. O ciclo semanal
-- ---------------------------------------------------------------------------
create table if not exists public.assisted_cycles (
  id               uuid primary key default gen_random_uuid(),
  operation_id     uuid not null references public.operations(id),
  -- SEMPRE a segunda-feira da semana. O CHECK é a garantia de que nenhum
  -- caminho — RPC, migration ou escrita direta — grava outro dia da semana.
  week_start_date  date not null,
  status           app.assisted_cycle_status not null default 'draft',
  author_user_id   uuid not null references public.users(id),
  closed_at        timestamptz,
  closed_by        uuid references public.users(id),
  -- Regra materializada NO FECHAMENTO. Nula enquanto rascunho: um ciclo aberto
  -- ainda será calculado pela regra vigente no dia em que fechar.
  rule_version     text,
  row_version      int  not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- UM ÚNICO CICLO OFICIAL POR PARCEIRO POR SEMANA (D1). Constraint de banco,
  -- não verificação de aplicação: é o que torna `open_assisted_cycle`
  -- idempotente mesmo sob concorrência, e o que fecha o O-06.
  constraint assisted_cycles_week_uk unique (operation_id, week_start_date),
  constraint assisted_cycles_monday_ck check (extract(isodow from week_start_date) = 1),
  constraint assisted_cycles_closure_ck check (
    (status = 'draft'  and closed_at is null and closed_by is null and rule_version is null)
    or (status = 'closed' and closed_at is not null and closed_by is not null and rule_version is not null)
  )
);
create index if not exists assisted_cycles_operation_idx
  on public.assisted_cycles(operation_id, week_start_date desc);

-- ---------------------------------------------------------------------------
-- 6. As entradas do ciclo
-- ---------------------------------------------------------------------------
-- Os campos de D1 estão todos aqui, e estão divididos em quatro blocos que não
-- devem ser confundidos:
--
--   (a) DE ONDE VEIO   — as sete FKs de proveniência. Permitem auditar a
--                        origem exata da regra sem que ela seja lida por
--                        referência na exibição;
--   (b) A REGRA        — cópias congeladas. É o que a exibição e o cálculo usam;
--   (c) O QUE O GC INFORMA — valor, período da fonte, data da consulta,
--                        referência, observação, diagnóstico;
--   (d) O QUE O SERVIDOR CALCULA — status e a versão da regra que o calculou.
--
-- A separação (a)/(b) é o coração da imutabilidade: alterar a configuração
-- regional amanhã muda o que (a) aponta, e não muda nada em (b).
create table if not exists public.assisted_cycle_entries (
  id        uuid primary key default gen_random_uuid(),
  cycle_id  uuid not null references public.assisted_cycles(id) on delete cascade,

  -- (a) proveniência
  indicator_definition_id     uuid not null references public.indicator_definitions(id),
  indicator_version_id        uuid not null references public.indicator_versions(id),
  regional_config_id          uuid not null references public.indicator_regional_configs(id),
  regional_config_version_id  uuid not null references public.indicator_regional_config_versions(id),
  theme_id                    uuid not null references public.themes(id),
  theme_version_id            uuid not null references public.theme_versions(id),

  -- (b) regra materializada
  indicator_code  text not null,
  indicator_name  text not null,
  theme_code      text not null,
  theme_name      text not null,
  unit            text not null,
  direction       app.indicator_direction not null,
  orientation     text not null default '',
  target          numeric(14,4) not null,
  tolerance       numeric(14,4) not null default 0,
  weight          numeric(6,2)  not null default 1,
  sort_order      int  not null default 0,

  -- (c) informado pelo Gerente de Canal
  -- `actual` NULO É SEM DADO, e é o estado inicial legítimo de toda entrada.
  -- Os campos de fonte nascem vazios e são exigidos junto com o valor, não
  -- antes: cobrar período de consulta de quem ainda não consultou nada seria
  -- ruído.
  actual               numeric(14,4),
  source_period        text not null default '',
  source_consulted_at  date,
  source_reference     text not null default '',
  observation          text not null default '',
  diagnosis            text not null default '',

  -- (d) calculado pelo servidor
  status        app.assisted_status not null default 'sem_dado',
  rule_version  text not null default app.assisted_rule_version(),

  recorded_by  uuid references public.users(id),
  recorded_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Um indicador entra UMA VEZ em cada ciclo. A unicidade é pela DEFINIÇÃO, e
  -- não pela versão: duas versões do mesmo indicador no mesmo ciclo seriam duas
  -- linhas para a mesma pergunta.
  constraint assisted_entries_indicator_uk unique (cycle_id, indicator_definition_id),
  -- Coerência mínima que uma CHECK alcança sozinha. O resto (região, publicação,
  -- vigência) depende de junção e está no gatilho da seção 7.
  constraint assisted_entries_tolerance_ck check (tolerance >= 0),
  constraint assisted_entries_source_ck check (
    (actual is null) or (btrim(source_period) <> '' and source_consulted_at is not null)
  )
);
create index if not exists assisted_entries_cycle_idx
  on public.assisted_cycle_entries(cycle_id, sort_order, indicator_code);

-- ---------------------------------------------------------------------------
-- 7. Guardas de integridade
-- ---------------------------------------------------------------------------
-- POR QUE EM GATILHO E NÃO SÓ NA RPC. As policies da seção 8 não abrem escrita
-- direta, mas o padrão desta base (0025, cabeçalho) é não depender disso: um
-- invariante que só existe dentro de uma `security definer` deixa de valer no
-- dia em que alguém acrescentar uma policy de escrita. Aqui o banco é a
-- autoridade.

-- 7.1 · Status é do SERVIDOR, sempre.
-- Nenhum caminho — RPC, escrita direta ou manutenção — grava um status que não
-- seja o resultado de `app.assisted_status_of` sobre a regra materializada da
-- própria linha. É isso que torna impossível forjar `conforme`.
create or replace function app.assisted_entry_compute_status() returns trigger
  language plpgsql as $$
begin
  new.status       := app.assisted_status_of(new.direction, new.target, new.tolerance, new.actual);
  new.rule_version := app.assisted_rule_version();
  new.updated_at   := now();
  return new;
end $$;

drop trigger if exists trg_assisted_entry_status on public.assisted_cycle_entries;
create trigger trg_assisted_entry_status
  before insert or update on public.assisted_cycle_entries
  for each row execute function app.assisted_entry_compute_status();

-- 7.2 · Coerência de catálogo: a entrada tem de descrever a configuração
-- regional que ela diz materializar, e essa configuração tem de ser da região
-- da operação do ciclo.
--
-- Sem esta guarda, um ciclo do Paraná poderia carregar a meta de outra região —
-- que é precisamente o que a decisão A-08 existe para impedir.
create or replace function app.guard_assisted_entry_catalog() returns trigger
  language plpgsql security definer set search_path = public, app as $$
declare
  v_cycle_region  uuid;
  v_cycle_status  app.assisted_cycle_status;
  v_config_region uuid;
  v_config_def    uuid;
  v_cv_config     uuid;
  v_cv_iv         uuid;
  v_cv_tv         uuid;
  v_tv_theme      uuid;
  v_iv_def        uuid;
begin
  select u.region_id, c.status into v_cycle_region, v_cycle_status
    from public.assisted_cycles c
    join public.operations o on o.id = c.operation_id
    join public.units u      on u.id = o.unit_id
   where c.id = new.cycle_id;

  if v_cycle_region is null then
    raise exception 'ciclo inexistente' using errcode = 'integrity_constraint_violation';
  end if;

  select rc.region_id, rc.indicator_definition_id into v_config_region, v_config_def
    from public.indicator_regional_configs rc where rc.id = new.regional_config_id;

  if v_config_region is distinct from v_cycle_region then
    raise exception 'configuracao regional de outra regiao nao pode compor este ciclo'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_config_def is distinct from new.indicator_definition_id then
    raise exception 'configuracao regional nao pertence ao indicador informado'
      using errcode = 'integrity_constraint_violation';
  end if;

  select cv.config_id, cv.indicator_version_id, cv.theme_version_id
    into v_cv_config, v_cv_iv, v_cv_tv
    from public.indicator_regional_config_versions cv where cv.id = new.regional_config_version_id;

  if v_cv_config is distinct from new.regional_config_id then
    raise exception 'versao de configuracao nao pertence a configuracao informada'
      using errcode = 'integrity_constraint_violation';
  end if;

  if v_cv_iv is distinct from new.indicator_version_id
     or v_cv_tv is distinct from new.theme_version_id then
    raise exception 'versao de indicador ou de tema divergente da configuracao materializada'
      using errcode = 'integrity_constraint_violation';
  end if;

  select iv.definition_id into v_iv_def
    from public.indicator_versions iv where iv.id = new.indicator_version_id;
  if v_iv_def is distinct from new.indicator_definition_id then
    raise exception 'versao de indicador nao pertence ao indicador informado'
      using errcode = 'integrity_constraint_violation';
  end if;

  select tv.theme_id into v_tv_theme
    from public.theme_versions tv where tv.id = new.theme_version_id;
  if v_tv_theme is distinct from new.theme_id then
    raise exception 'versao de tema nao pertence ao tema informado'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_assisted_entry_catalog on public.assisted_cycle_entries;
create trigger trg_assisted_entry_catalog
  before insert or update on public.assisted_cycle_entries
  for each row execute function app.guard_assisted_entry_catalog();

-- 7.3 · IMUTABILIDADE do ciclo fechado.
-- Depois de `closed`, o núcleo histórico não muda mais: nem operação, nem
-- semana, nem catálogo materializado, nem regra, nem valor, nem status, nem
-- diagnóstico. Reabrir também é proibido — a evolução acontece no plano, que é
-- outro objeto, com ciclo de vida próprio (ADR-135-002, §5).
--
-- Sessões sem JWT (migrations, manutenção, `postgres`) seguem o padrão de
-- `app.guard_action_plan_write` (0025) e NÃO são restringidas: quem administra
-- o banco não é o adversário deste modelo.
create or replace function app.guard_assisted_cycle_immutability() returns trigger
  language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and old.status = 'closed' then
      raise exception 'ciclo fechado nao pode ser excluido'
        using errcode = 'integrity_constraint_violation';
    end if;
    return old;
  end if;

  new.updated_at := now();

  if auth.uid() is null or old.status <> 'closed' then
    return new;
  end if;

  raise exception 'ciclo fechado e imutavel: a evolucao continua no plano de acao'
    using errcode = 'integrity_constraint_violation';
end $$;

drop trigger if exists trg_assisted_cycle_immutability on public.assisted_cycles;
create trigger trg_assisted_cycle_immutability
  before update or delete on public.assisted_cycles
  for each row execute function app.guard_assisted_cycle_immutability();

create or replace function app.guard_assisted_entry_immutability() returns trigger
  language plpgsql as $$
declare v_status app.assisted_cycle_status;
begin
  if auth.uid() is null then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  select status into v_status from public.assisted_cycles
   where id = case tg_op when 'DELETE' then old.cycle_id else new.cycle_id end;

  if v_status = 'closed' then
    raise exception 'ciclo fechado e imutavel: item nao pode ser alterado'
      using errcode = 'integrity_constraint_violation';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end $$;

-- Roda DEPOIS das guardas de conteúdo (ordem alfabética do nome do gatilho:
-- `trg_assisted_entry_catalog` < `trg_assisted_entry_status` < `trg_assisted_entry_zz_frozen`).
-- O sufixo `zz_` é deliberado — a recusa por ciclo fechado deve ser a última
-- palavra, e não competir com a validação de conteúdo pela mensagem de erro.
drop trigger if exists trg_assisted_entry_zz_frozen on public.assisted_cycle_entries;
create trigger trg_assisted_entry_zz_frozen
  before insert or update or delete on public.assisted_cycle_entries
  for each row execute function app.guard_assisted_entry_immutability();

-- ---------------------------------------------------------------------------
-- 8. RLS: leitura por escopo, escrita SOMENTE por RPC
-- ---------------------------------------------------------------------------
-- Leitura segue o alcance que a base já define para a operação
-- (`app.has_operation_access`): ADMIN global, REGIONAL na região, COORDENADOR
-- na coordenadoria, GC nos seus parceiros — exatamente a linha "Consultar
-- ciclos" da Matriz §3.
--
-- NÃO existe policy de INSERT/UPDATE/DELETE. Toda escrita passa pelas RPCs da
-- 0040, que verificam ator, papel e escopo na ordem da Matriz §7.2. Fechar a
-- escrita direta é o que impede um COORDENADOR — que enxerga o ciclo — de
-- registrar valor em nome do GC por PostgREST.
alter table public.assisted_cycles        enable row level security;
alter table public.assisted_cycles        force  row level security;
alter table public.assisted_cycle_entries enable row level security;
alter table public.assisted_cycle_entries force  row level security;

drop policy if exists assisted_cycles_scoped_read on public.assisted_cycles;
create policy assisted_cycles_scoped_read on public.assisted_cycles for select to authenticated
  using (app.has_operation_access(operation_id));

drop policy if exists assisted_entries_scoped_read on public.assisted_cycle_entries;
create policy assisted_entries_scoped_read on public.assisted_cycle_entries for select to authenticated
  using (exists (
    select 1 from public.assisted_cycles c
     where c.id = cycle_id and app.has_operation_access(c.operation_id)
  ));

-- Mitigação do achado O-10 na superfície nova: `anon` e `PUBLIC` sem grant
-- nenhum; `authenticated` com SELECT e NADA MAIS.
--
-- `revoke all` antes do grant, e não um revoke enumerado: os DEFAULT PRIVILEGES
-- do Supabase concedem `arwdDxtm` a `authenticated` em toda tabela de `public`,
-- e enumerar apenas as quatro de escrita deixaria `REFERENCES` e `TRIGGER` para
-- trás. Nenhum dos dois é acesso a dado, mas também nenhum é necessário — e a
-- superfície nova é o único lugar onde ainda dá para não herdá-los.
revoke all on table public.assisted_cycles        from anon, public, authenticated;
revoke all on table public.assisted_cycle_entries from anon, public, authenticated;
grant select on table public.assisted_cycles        to authenticated;
grant select on table public.assisted_cycle_entries to authenticated;
