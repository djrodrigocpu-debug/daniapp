-- ===========================================================================
-- 0047 — CUTOVER PARAMETRIZÁVEL, CRIADO E **NÃO ATIVADO** (AAPEx 1.3.5, Fase 7)
--
-- D5 é literal: *"criar estrutura parametrizável, mas não ativar o cutover"*. E
-- a data é a pendência **A-02**, que continua aberta. Esta migration entrega a
-- estrutura inteira — tabela, leitura, escrita administrativa e a guarda em
-- `start_evaluation` — com o valor **NULO**, e é o valor nulo que a torna
-- inofensiva: enquanto ele for nulo, o comportamento é o de hoje.
--
-- ---------------------------------------------------------------------------
-- POR QUE `value jsonb` E NÃO UMA COLUNA `date`
-- ---------------------------------------------------------------------------
-- Contratos §7 desenha `system_settings(key, value jsonb not null, updated_at,
-- updated_by)`, e a razão de o valor ser `jsonb` é que a tabela é de parâmetros
-- do sistema, não do cutover: a próxima chave não será uma data.
--
-- Com `value not null`, "sem data" é o **JSON null** (`'null'::jsonb`), não o
-- SQL NULL. A distinção importa e está travada por CHECK: para a chave do
-- cutover, o valor só pode ser JSON null ou uma string `YYYY-MM-DD`. Uma data
-- malformada não chega a existir na tabela — e portanto não chega à guarda.
--
-- ---------------------------------------------------------------------------
-- POR QUE `client_readable`
-- ---------------------------------------------------------------------------
-- "`authenticated` apenas com leitura mínima necessária" precisa de um lugar
-- onde "mínima" seja verificável. Sem a coluna, a política de leitura seria
-- `using (true)` e a minimalidade viraria disciplina — a mesma disciplina que o
-- achado O-17 mostrou não bastar. Com ela, o banco decide: a policy é
-- `using (client_readable)`, e uma chave futura que não deva ser vista pelo
-- cliente nasce invisível **por default**, porque o default é `false`.
--
-- A chave do cutover nasce `true` por uma razão operacional, não de conveniência:
-- a interface precisa saber se o fluxo semanal ainda está aberto para não
-- oferecer um botão que o servidor recusaria. Não é segredo; é parâmetro.
--
-- ---------------------------------------------------------------------------
-- A GUARDA, E O QUE ELA DELIBERADAMENTE **NÃO** BLOQUEIA
-- ---------------------------------------------------------------------------
-- `start_evaluation` é função LEGADA (0006, endurecida pela 0031). Vira WRAPPER
-- pela técnica obrigatória — `pg_get_functiondef` MOVE o corpo vigente para
-- `app.start_evaluation_legacy`, e o wrapper só acrescenta a fronteira. Contra o
-- achado O-16, a fronteira nova vem **depois** de ator e escopo.
--
-- A guarda recusa `frequency = 'weekly'` **somente** quando as três condições
-- valem juntas:
--
--   1. a data existe (não é JSON null);
--   2. a data já venceu — `cutover <= app.assisted_today()`, o mesmo "hoje" em
--      `America/Sao_Paulo` que a Gestão Assistida usa desde a 0039. Reusar em
--      vez de recalcular evita a segunda verdade que a ADR-135-002 D-J adverte;
--   3. **não há** ciclo semanal reaproveitável naquela operação.
--
-- A terceira condição não é detalhe: `start_evaluation` é IDEMPOTENTE — rascunho
-- ou devolvida do mesmo tipo é reaproveitado. Sem ela, ativar o cutover deixaria
-- os rascunhos semanais existentes **órfãos**, inalcançáveis pelo caminho
-- oficial. D5 exige o contrário: os quatro drafts de produção recebem decisão
-- nominal, e uma das três saídas é *"concluir como legado"*, que só existe se o
-- rascunho continuar abrindo. A guarda barra a CRIAÇÃO de auditoria semanal
-- nova; não converte, não fecha e não esconde o que já existe.
--
-- `monthly` **nunca** é tocado pela guarda, em nenhuma configuração.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRATION NÃO FAZ
-- ---------------------------------------------------------------------------
--   * não define a data (A-02) — semeia JSON null e **não a altera**;
--   * não converte, não fecha e não recalcula auditoria semanal alguma;
--   * não executa o backfill do catálogo legado, que continua bloqueando a
--     ativação real (Plano de Implementação §7);
--   * não decide os quatro drafts de produção (A-03).
--
-- ADITIVA. Cria uma tabela, três funções e um gatilho. Não altera coluna, tipo,
-- policy ou dado de nenhuma estrutura existente. Migrations 0001–0046 intactas.
--
-- ROLLBACK: `drop table public.system_settings cascade`, `drop function` das
-- três novas, e `create or replace` de `public.start_evaluation` com o corpo de
-- `app.start_evaluation_legacy`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. A tabela de parâmetros
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  key             text primary key,
  -- JSON null = "não configurado". Nunca SQL NULL: `not null` é o que impede
  -- uma chave existir sem valor declarado.
  value           jsonb not null,
  -- Ver cabeçalho: é aqui que "leitura mínima" deixa de ser disciplina.
  client_readable boolean not null default false,
  description     text not null default '',
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.users(id),

  -- Integridade de FORMA por chave. A guarda de `start_evaluation` lê esta
  -- coluna e converte para `date`; sem o CHECK, um valor malformado viraria erro
  -- de conversão dentro de uma RPC que não tem nada a ver com o assunto.
  constraint system_settings_cutover_shape check (
    key <> 'weekly_audit_cutover_date'
    or jsonb_typeof(value) = 'null'
    or (jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$')
  )
);

-- Autoria e horário são DERIVADOS, nunca aceitos. Vale para a RPC e para
-- qualquer caminho futuro — inclusive um `update` de manutenção.
create or replace function app.guard_system_setting_write() returns trigger
  language plpgsql security definer set search_path = public, app as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_system_settings_write on public.system_settings;
create trigger trg_system_settings_write
  before insert or update on public.system_settings
  for each row execute function app.guard_system_setting_write();

-- RLS habilitada E FORÇADA, no padrão de 0039–0044.
alter table public.system_settings enable row level security;
alter table public.system_settings force row level security;

-- SOMENTE leitura, e somente do que for marcado como visível ao cliente.
-- Nenhuma policy de INSERT/UPDATE/DELETE: a escrita é exclusivamente por RPC
-- `security definer`.
drop policy if exists system_settings_read on public.system_settings;
create policy system_settings_read on public.system_settings
  for select to authenticated using (client_readable);

-- `revoke all` e não revogação por lista: é o padrão de 0039–0044, e é o único
-- que não depende de a lista de privilégios do PostgreSQL continuar sendo a de
-- hoje. Foi exatamente por revogar por lista que o achado O-17 existiu.
revoke all on table public.system_settings from anon, public, authenticated;
grant select on table public.system_settings to authenticated;

comment on table public.system_settings is
  'Parametros do sistema (0047). RPC-only para escrita; leitura restrita a client_readable.';

-- ---------------------------------------------------------------------------
-- 2. A semente — e ela nasce, e permanece, NULA
-- ---------------------------------------------------------------------------
-- `on conflict do nothing`: reaplicar a migration nunca reescreve um valor já
-- configurado. Se um dia a data for definida (A-02), rodar a migration de novo
-- não a apaga.
insert into public.system_settings (key, value, client_readable, description)
values (
  'weekly_audit_cutover_date',
  'null'::jsonb,
  true,
  'Data a partir da qual nao se cria Auditoria Semanal nova. JSON null = cutover DESATIVADO (pendencia A-02).'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Leitura da configuração
-- ---------------------------------------------------------------------------
-- Interna. A ausência da linha é lida como "não configurado" — o mesmo que JSON
-- null. Absent e null significam a mesma coisa de propósito: o comportamento
-- conservador não pode depender de a semente ter rodado.
create or replace function app.weekly_audit_cutover_date() returns date
  language sql stable security definer set search_path = public, app as $$
  select case
           when jsonb_typeof(s.value) = 'null' then null
           else (s.value #>> '{}')::date
         end
    from public.system_settings s
   where s.key = 'weekly_audit_cutover_date'
$$;

revoke all on function app.weekly_audit_cutover_date() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC de leitura — uma só, e devolve o bruto E o derivado
-- ---------------------------------------------------------------------------
-- Uma RPC, não duas: o cliente precisa dos parâmetros visíveis **e** da única
-- pergunta derivada que a interface faz — *"o fluxo semanal ainda está aberto?"*.
-- Devolver as duas coisas separadas em duas funções seria redundância sem ganho.
--
-- `weeklyAuditClosed` é calculado AQUI, no servidor, e não pelo cliente a partir
-- da data: comparar datas no relógio do navegador é como o fuso volta a decidir
-- regra de negócio.
create or replace function public.get_system_settings() returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_uid   uuid;
  v_cut   date;
  v_today date;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  v_cut   := app.weekly_audit_cutover_date();
  v_today := app.assisted_today();

  return jsonb_build_object(
    'settings', coalesce(
      (select jsonb_object_agg(s.key, s.value)
         from public.system_settings s where s.client_readable), '{}'::jsonb),
    'weeklyAuditCutoverDate', case when v_cut is null then null else to_char(v_cut, 'YYYY-MM-DD') end,
    'weeklyAuditClosed',      (v_cut is not null and v_cut <= v_today),
    'today',                  to_char(v_today, 'YYYY-MM-DD')
  );
end $$;

revoke all on function public.get_system_settings() from public, anon;
grant execute on function public.get_system_settings() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC administrativa de configuração
-- ---------------------------------------------------------------------------
-- Tipada em `date`, e não genérica `(key, value jsonb)`: uma função genérica
-- deixaria um ADMIN gravar qualquer chave com qualquer forma, e a validação
-- viraria um `case` sobre nome de chave. A cada parâmetro novo, sua RPC.
--
-- `p_confirm_retroactive` existe porque gravar uma data já vencida ATIVA o
-- cutover no mesmo instante — deixa de ser configuração e vira ato operacional.
-- Exigir o segundo argumento é o "ato explícito" que a Fase 7 pede.
--
-- Nenhum ator vem do cliente: `auth.uid()` decide quem é, e o gatilho da seção 1
-- grava `updated_by` mesmo que alguém tente outro caminho.
create or replace function public.admin_set_weekly_audit_cutover(
  p_date date, p_confirm_retroactive boolean default false
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid    uuid;
  v_today  date;
  v_before jsonb;
  v_after  jsonb;
begin
  -- (1) ATOR.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) PAPEL. Só administração; o Regional administra catálogo da própria
  -- região (D7), não parâmetro nacional — e o cutover é nacional por natureza.
  if not coalesce(app.is_admin(), false) then
    raise exception 'apenas administrador configura o cutover da auditoria semanal'
      using errcode = 'insufficient_privilege';
  end if;

  -- (3) VALIDAÇÃO. Nulo desativa, e desativar nunca precisa de confirmação.
  v_today := app.assisted_today();
  if p_date is not null and p_date <= v_today and not coalesce(p_confirm_retroactive, false) then
    raise exception 'data de cutover em % ja estaria vencida: ativar exige confirmacao explicita',
      to_char(p_date, 'DD/MM/YYYY')
      using errcode = 'integrity_constraint_violation';
  end if;

  -- (4) EFEITO.
  v_after := case when p_date is null then 'null'::jsonb
                  else to_jsonb(to_char(p_date, 'YYYY-MM-DD')) end;

  select s.value into v_before from public.system_settings s
   where s.key = 'weekly_audit_cutover_date' for update;
  if v_before is null then
    raise exception 'parametro weekly_audit_cutover_date ausente'
      using errcode = 'integrity_constraint_violation';
  end if;

  update public.system_settings
     set value = v_after
   where key = 'weekly_audit_cutover_date';

  -- (5) TRILHA. Mesmo escritor de sempre; o ator vem de `auth.uid()` lá dentro.
  perform app.write_audit(
    'weekly_audit_cutover_set', 'system_setting', 'weekly_audit_cutover_date',
    jsonb_build_object('from', v_before, 'to', v_after,
                       'retroactive', coalesce(p_confirm_retroactive, false))
  );

  return public.get_system_settings();
end $$;

revoke all on function public.admin_set_weekly_audit_cutover(date, boolean) from public, anon;
grant execute on function public.admin_set_weekly_audit_cutover(date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. `start_evaluation` vira WRAPPER — o corpo vigente é MOVIDO, não copiado
-- ---------------------------------------------------------------------------
-- A vigente é a da 0031: guarda de ator nulo, escopo, idempotência por
-- `(operação, frequência)` em rascunho/devolvida, e a derivação de
-- `cycle_label`/`period_start`/`period_end` a partir de `now()`.
--
-- Essa derivação por relógio é o achado O-06, e ele continua **aberto para o
-- caminho legado**: quem o fechou foi `start_monthly_audit` (0044), com a
-- competência por parâmetro. Esta migration não o toca — mover corpo não é
-- consertá-lo, e consertá-lo aqui seria mudar o legado sem pedir.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'start_evaluation';

  execute replace(
    v_src,
    'FUNCTION public.start_evaluation(p_operation_id uuid, p_frequency text, p_evaluator_id uuid)',
    'FUNCTION app.start_evaluation_legacy(p_operation_id uuid, p_frequency text, p_evaluator_id uuid)'
  );
end $$;

create or replace function public.start_evaluation(
  p_operation_id uuid, p_frequency text, p_evaluator_id uuid
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  -- O cast fica no DECLARE, como na 0031: frequência inválida falha ANTES de
  -- tudo, exatamente como falha hoje. Mover essa falha para depois do ator
  -- mudaria comportamento observável com o cutover nulo — e a exigência é ser
  -- bit a bit idêntico.
  v_freq app.visit_type := p_frequency::app.visit_type;
  v_uid  uuid;
  v_cut  date;
begin
  -- (1) ATOR. Mesma recusa, mesma ordem da 0031.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) ESCOPO. Idem. A fronteira nova nunca fala antes destas duas (O-16).
  if not coalesce(app.has_operation_access(p_operation_id), false) then
    raise exception 'operacao fora do escopo' using errcode = 'insufficient_privilege';
  end if;

  -- (3) CUTOVER. Inerte enquanto a data for nula — e ela É nula (A-02).
  if v_freq = 'weekly' then
    v_cut := app.weekly_audit_cutover_date();

    if v_cut is not null and v_cut <= app.assisted_today()
       -- Ciclo semanal reaproveitável passa: a idempotência do legado continua
       -- valendo e nenhum rascunho existente fica órfão. Ver cabeçalho.
       and not exists (
         select 1 from public.evaluations e
          where e.operation_id = p_operation_id
            and e.frequency = 'weekly'
            and e.status in ('draft', 'returned')
       )
    then
      raise exception 'auditoria semanal encerrada em %: registre a semana pela Gestao Assistida',
        to_char(v_cut, 'DD/MM/YYYY')
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  -- (4) DELEGAÇÃO INTEGRAL. Com data nula, o caminho é literalmente o de sempre.
  return app.start_evaluation_legacy(p_operation_id, p_frequency, p_evaluator_id);
end $$;

revoke all on function app.start_evaluation_legacy(uuid, text, uuid)
  from public, anon, authenticated;

revoke all on function public.start_evaluation(uuid, text, uuid) from public, anon;
grant execute on function public.start_evaluation(uuid, text, uuid) to authenticated;

comment on function public.start_evaluation(uuid, text, uuid) is
  'Wrapper legado. Ator, escopo e cutover antes de delegar a app.start_evaluation_legacy (0047).';
