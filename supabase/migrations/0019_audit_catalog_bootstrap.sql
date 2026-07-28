-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0019: bootstrap do catálogo de auditoria
-- =============================================================================
-- POR QUE: `start_evaluation` (0006) exige uma versão de template de auditoria
-- e recusa qualquer avaliação num banco sem catálogo — foi exatamente o que o
-- runtime contra o staging provou ("nenhuma versao de template de auditoria
-- disponivel", sem gravar nada). O catálogo nunca teve caminho de criação em
-- migration: só existia no seed de desenvolvimento (supabase/seed/
-- 0001_seed_catalog.sql), que não roda em ambiente remoto.
--
-- FONTE DO CONTEÚDO (nada aqui foi inventado): os 24 itens abaixo são a cópia
-- exata do seed canônico, que por sua vez espelha o catálogo constitutivo do
-- produto em `src/data/catalog.ts` (mesmos códigos T01–T24, títulos, pilares,
-- pesos e frequências) — o mesmo contrato que `ui_evaluations` projeta
-- (`themeId` = audit_items.code) e que a tela de avaliação consome. Masterplan
-- §3.3, §7.4/§7.5, §9.4. A ressalva de negócio P05 do seed permanece: revisar
-- o conteúdo antes de aplicar em produção é decisão do canal — esta migration
-- torna o catálogo REPRODUZÍVEL, não o repactua.
--
-- DESENHO (seed direto, não RPC): o catálogo é parte constitutiva e estável do
-- produto — sem ele nenhuma auditoria abre. Não é conteúdo operacional variável
-- que peça simulação/confirmação; a identidade é única (code 'AACE-CHECKLIST')
-- e a versão é explícita (1). Mesmos UUIDs fixos do seed, para que ambientes
-- que já rodaram o seed (harness de testes, dev) colidam de forma inofensiva
-- nos MESMOS índices únicos, sem linhas órfãs nem duplicação.
--
-- IDEMPOTÊNCIA: reexecução integral é no-op (on conflict do nothing nas
-- mesmas chaves únicas de 0001). CONFLITO DE CONTEÚDO: se a mesma identidade
-- já existir com conteúdo divergente (item T01 com outro título, outro peso,
-- outra frequência…), o bloco de verificação ao final ABORTA a migration
-- nomeando os códigos divergentes — divergência silenciosa é o único resultado
-- proibido.
--
-- O QUE ESTA MIGRATION NÃO FAZ: não cria organização, região, unidade,
-- coordenação, usuário, parceiro, escopo, onboarding nem avaliação; não envia
-- e-mail; não toca em indicadores (conteúdo administrável pela própria UI de
-- Admin via admin_create_indicator — não é catálogo constitutivo).
--
-- Migrations 0001–0018 não são alteradas.
-- =============================================================================

do $$
declare
  v_template uuid;
  v_version  uuid;
  v_faltando text;
begin
  -- 1) Template — identidade lógica única pelo code (unique em 0001).
  insert into public.audit_templates (id, code, title)
  values ('00000000-0000-0000-0000-0000000000d1', 'AACE-CHECKLIST', 'Checklist AACE de Excelência')
  on conflict (code) do nothing;

  select id into v_template from public.audit_templates where code = 'AACE-CHECKLIST';

  -- Mesma identidade com título divergente é conflito, não atualização.
  if not exists (
    select 1 from public.audit_templates
     where id = v_template and title = 'Checklist AACE de Excelência'
  ) then
    raise exception 'catálogo divergente: template AACE-CHECKLIST já existe com outro título'
      using errcode = 'check_violation';
  end if;

  -- 2) Versão 1 — explícita e determinística. `effective_from` fixo: é a data
  --    que `start_evaluation` usa para escolher a versão vigente; um literal
  --    torna a reprodução em produção idêntica à do staging.
  insert into public.audit_template_versions (id, template_id, version_number, effective_from, locked)
  values ('00000000-0000-0000-0000-0000000000d2', v_template, 1, timestamptz '2026-07-28 00:00:00+00', false)
  on conflict (template_id, version_number) do nothing;

  select id into v_version from public.audit_template_versions
   where template_id = v_template and version_number = 1;

  -- 3) Os 24 itens do checklist — cópia exata do seed canônico (T01–T24).
  --    Ordem estável por code: é assim que ui_evaluations ordena as respostas.
  insert into public.audit_items (template_version_id, code, title, pillar, weight, frequency, required, evidence_required) values
    (v_version,'T01','Domínio de portfólio','Resultado e portfólio',5,'monthly',true,true),
    (v_version,'T02','Venda de Soluções Digitais','Resultado e portfólio',5,'weekly',true,true),
    (v_version,'T03','Venda de soluções avançadas','Resultado e portfólio',5,'weekly',true,true),
    (v_version,'T04','Capilaridade de novos parceiros','Expansão e capilaridade',4,'weekly',true,true),
    (v_version,'T05','BCC','Execução comercial',4,'weekly',true,true),
    (v_version,'T06','Convergência','Resultado e portfólio',5,'weekly',true,true),
    (v_version,'T07','Churn','Qualidade e retenção',5,'weekly',true,true),
    (v_version,'T08','Percentual de quebra','Qualidade e retenção',5,'weekly',true,true),
    (v_version,'T09','Vendedores','Pessoas e liderança',4,'monthly',true,true),
    (v_version,'T10','Delta Ticket','Rentabilidade',4,'monthly',true,true),
    (v_version,'T11','Renovação','Qualidade e retenção',5,'weekly',true,true),
    (v_version,'T12','Aparelhos','Resultado e portfólio',3,'monthly',true,true),
    (v_version,'T13','Líderes do AACE','Pessoas e liderança',4,'monthly',true,true),
    (v_version,'T14','Projeto Rentabilização','Rentabilidade',4,'weekly',true,true),
    (v_version,'T15','Projeto Samurai','Projetos estratégicos',5,'monthly',true,true),
    (v_version,'T16','One-on-One','Pessoas e liderança',3,'monthly',true,true),
    (v_version,'T17','Gestão de prospecção','Execução comercial',5,'weekly',true,true),
    (v_version,'T18','Venda de avançadas — rotina','Execução comercial',4,'weekly',true,true),
    (v_version,'T19','Venda de SD — rotina','Execução comercial',4,'weekly',true,true),
    (v_version,'T20','Carteira Prospect','Execução comercial',4,'weekly',true,true),
    (v_version,'T21','TV','Resultado e portfólio',3,'weekly',true,true),
    (v_version,'T22','Gestão de funil','Execução comercial',5,'weekly',true,true),
    (v_version,'T23','Domínio de portfólio — coaching','Pessoas e liderança',3,'monthly',true,true),
    (v_version,'T24','Visão das agendas Teams','Governança',3,'weekly',true,true)
  on conflict (template_version_id, code) do nothing;

  -- 4) VERIFICAÇÃO DE CONTEÚDO. O on-conflict acima ignora linhas já
  --    existentes; se elas divergirem do canônico, nada foi corrigido — e é
  --    exatamente isso que precisa ABORTAR aqui, nomeando os códigos.
  select string_agg(c.code, ', ' order by c.code) into v_faltando
  from (values
    ('T01','Domínio de portfólio','Resultado e portfólio',5::numeric,'monthly'),
    ('T02','Venda de Soluções Digitais','Resultado e portfólio',5,'weekly'),
    ('T03','Venda de soluções avançadas','Resultado e portfólio',5,'weekly'),
    ('T04','Capilaridade de novos parceiros','Expansão e capilaridade',4,'weekly'),
    ('T05','BCC','Execução comercial',4,'weekly'),
    ('T06','Convergência','Resultado e portfólio',5,'weekly'),
    ('T07','Churn','Qualidade e retenção',5,'weekly'),
    ('T08','Percentual de quebra','Qualidade e retenção',5,'weekly'),
    ('T09','Vendedores','Pessoas e liderança',4,'monthly'),
    ('T10','Delta Ticket','Rentabilidade',4,'monthly'),
    ('T11','Renovação','Qualidade e retenção',5,'weekly'),
    ('T12','Aparelhos','Resultado e portfólio',3,'monthly'),
    ('T13','Líderes do AACE','Pessoas e liderança',4,'monthly'),
    ('T14','Projeto Rentabilização','Rentabilidade',4,'weekly'),
    ('T15','Projeto Samurai','Projetos estratégicos',5,'monthly'),
    ('T16','One-on-One','Pessoas e liderança',3,'monthly'),
    ('T17','Gestão de prospecção','Execução comercial',5,'weekly'),
    ('T18','Venda de avançadas — rotina','Execução comercial',4,'weekly'),
    ('T19','Venda de SD — rotina','Execução comercial',4,'weekly'),
    ('T20','Carteira Prospect','Execução comercial',4,'weekly'),
    ('T21','TV','Resultado e portfólio',3,'weekly'),
    ('T22','Gestão de funil','Execução comercial',5,'weekly'),
    ('T23','Domínio de portfólio — coaching','Pessoas e liderança',3,'monthly'),
    ('T24','Visão das agendas Teams','Governança',3,'weekly')
  ) as c(code, title, pillar, weight, freq)
  where not exists (
    select 1 from public.audit_items ai
     where ai.template_version_id = v_version
       and ai.code = c.code
       and ai.title = c.title
       and ai.pillar = c.pillar
       and ai.weight = c.weight
       and ai.frequency = c.freq::app.visit_type
       and ai.required = true
       and ai.evidence_required = true
  );

  if v_faltando is not null then
    raise exception 'catálogo divergente na versão 1 do AACE-CHECKLIST — itens fora do canônico: %', v_faltando
      using errcode = 'check_violation';
  end if;

  if (select count(*) from public.audit_items where template_version_id = v_version) <> 24 then
    raise exception 'catálogo divergente: a versão 1 do AACE-CHECKLIST deveria ter exatamente 24 itens'
      using errcode = 'check_violation';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ui_evidences — projeção das evidências para o cliente (src/types Evidence)
-- ---------------------------------------------------------------------------
-- Última lacuna de contrato do modo corporativo: `ui_evaluations` entrega só
-- os `evidenceIds` de cada resposta; os METADADOS (nome, tipo, status) não
-- tinham projeção alguma — o cliente os buscava no store local de
-- demonstração, e evidência real aparecia como inexistente. Mesmo padrão das
-- demais ui_* (0005): security_invoker, então a RLS de `evidence_files`
-- (leitura por escopo, 0002) decide o que volta.
--
-- `name` e `themeId` vivem no path gravado por add_evidence (0006):
-- '<themeId>/<uuid>-<nome original>'. O themeId autoritativo vem do item da
-- resposta vinculada; o nome é extraído do path.
create or replace view public.ui_evidences
  with (security_invoker = true) as
select
  ef.id                                        as "id",
  ai.code                                      as "themeId",
  regexp_replace(ef.path, '^[^/]*/[0-9a-f-]{36}-', '') as "name",
  ef.path                                      as "uri",
  ef.mime_type                                 as "mimeType",
  (case when ef.mime_type like 'image/%' then 'photo' else 'document' end) as "type",
  (case ef.status::text
     when 'local_pending' then 'local'
     when 'expired'       then 'failed'
     else ef.status::text
   end)                                        as "status",
  ef.size_bytes                                as "sizeBytes",
  ea.evaluation_id                             as "evaluationId",
  ef.created_at                                as "createdAt"
from public.evidence_files ef
join public.evaluation_answer_evidence link on link.evidence_id = ef.id
join public.evaluation_answers ea on ea.id = link.answer_id
join public.audit_items ai on ai.id = ea.item_id;

grant select on public.ui_evidences to authenticated;
