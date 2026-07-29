-- ===========================================================================
-- 0026 — MICROCORREÇÃO: contador de ações abertas + projeção segura de nomes
--
-- DOIS ACHADOS, MESMA CAUSA (leitura sub-escopada no servidor):
--
-- 1) `ui_operations."openActions"` (migration 0005) não incluía o status
--    `waiting_partner` (adicionado ao enum na 0024). Um plano "Aguardando
--    parceiro" desaparecia do contador na aba Ações e no cartão do Parceiro,
--    embora continue sendo trabalho aberto.
--
-- 2) `public.users` só é legível pelo próprio usuário ou por Administrador
--    (`users_self_read`, migration 0002) — decisão de privacidade correta.
--    Consequência colateral: Coordenação, Regional e Administração não
--    conseguiam ler o nome de OUTRO usuário (avaliador, Gerente de Canal,
--    coordenador) mesmo quando esse usuário estava dentro do escopo de
--    operação que já podiam consultar — a tela mostrava "—" indistintamente
--    de "não existe" e "servidor não deixou ver".
--
-- CORREÇÃO 2: duas views NÃO-`security_invoker` (portanto executadas com o
-- privilégio do dono da view, que já ignora RLS — é assim que as demais views
-- ui_* precisam declarar `security_invoker = true` explicitamente para NÃO
-- vazar linhas; aqui é o comportamento padrão que queremos, ao contrário).
-- Como uma view sem security_invoker leria QUALQUER linha de public.users,
-- cada view REPETE a checagem de escopo (`app.has_operation_access`, a MESMA
-- função-guarda usada por toda a RLS de operação) na cláusula WHERE — isso é
-- o que impede o vazamento, não a ausência da opção. Somente display_name é
-- projetado; nunca e-mail nem UUID de outro usuário.
--
-- ROLLBACK: `create or replace view public.ui_operations` com a definição da
-- 0005 (openActions sem 'waiting_partner'); `drop view` das duas views novas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) ui_operations — openActions agora inclui waiting_partner
-- ---------------------------------------------------------------------------
create or replace view public.ui_operations
  with (security_invoker = true) as
select
  o.id                          as "id",
  o.partner_name                as "partnerName",
  o.office_name                 as "officeName",
  o.city                        as "city",
  o.state                       as "state",
  c.coordinator_user_id         as "coordinatorId",
  o.channel_manager_user_id     as "managerId",
  o.active                      as "active",
  coalesce((
    select s.score from public.official_snapshots s
    where s.operation_id = o.id order by s.created_at desc limit 1
  ), 0)::double precision       as "currentScore",
  coalesce((
    select s.score from public.official_snapshots s
    where s.operation_id = o.id order by s.created_at desc offset 1 limit 1
  ), 0)::double precision       as "previousScore",
  (
    select s.created_at::date::text from public.official_snapshots s
    where s.operation_id = o.id order by s.created_at desc limit 1
  )                             as "lastAudit",
  coalesce((
    select min(v.scheduled_at)::date from public.visits v
    where v.operation_id = o.id and v.status = 'planned' and v.scheduled_at >= now()
  ), current_date)::text        as "nextAudit",
  (case
     when exists (select 1 from public.official_snapshots s where s.operation_id = o.id)
     then app.score_traffic_light(coalesce((
       select s.score from public.official_snapshots s
       where s.operation_id = o.id order by s.created_at desc limit 1), 0))
     else 'not_evaluated'::app.traffic_light
   end)::text                   as "status",
  (
    select count(*)::int from public.action_plans a
    where a.operation_id = o.id
      and a.status in ('open','in_progress','waiting_partner','blocked','overdue')
  )                             as "openActions"
from public.operations o
left join public.coordinations c on c.id = o.coordination_id;

-- ---------------------------------------------------------------------------
-- 2) ui_operation_people — nomes funcionais de GC/coordenador/coordenadoria,
--    restritos à mesma operação que o chamador já pode ler (Ficha do Parceiro).
-- ---------------------------------------------------------------------------
create or replace view public.ui_operation_people as
select
  o.id                          as "operationId",
  gu.display_name               as "managerName",
  cu.display_name               as "coordinatorName",
  c.name                        as "coordinationName"
from public.operations o
join public.coordinations c  on c.id = o.coordination_id
left join public.users gu    on gu.id = o.channel_manager_user_id
left join public.users cu    on cu.id = c.coordinator_user_id
where app.has_operation_access(o.id);

-- ---------------------------------------------------------------------------
-- 3) ui_evaluation_people — nome do avaliador, restrito às avaliações da(s)
--    operação(ões) que o chamador já pode ler (Fila de validação).
-- ---------------------------------------------------------------------------
create or replace view public.ui_evaluation_people as
select
  e.id                          as "evaluationId",
  au.display_name               as "evaluatorName"
from public.evaluations e
left join public.users au on au.id = e.author_user_id
where app.has_operation_access(e.operation_id);

revoke all on public.ui_operation_people  from public, anon;
revoke all on public.ui_evaluation_people from public, anon;
grant select on public.ui_operation_people  to authenticated;
grant select on public.ui_evaluation_people to authenticated;
