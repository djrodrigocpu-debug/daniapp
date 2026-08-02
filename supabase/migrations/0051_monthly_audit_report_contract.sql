-- ===========================================================================
-- AAPEx 1.3.5 — 0051: contrato server-side do Relatório Oficial da Auditoria Mensal
-- ===========================================================================
-- Decisão A-05, confirmada pelo proprietário em 02/08/2026 e registrada em
-- `ADR-135-004` §6 ANTES desta migration.
--
-- ---------------------------------------------------------------------------
-- 1. Duas constantes de formato, e NUNCA uma
-- ---------------------------------------------------------------------------
--   REPORT_FORMAT_VERSION         = 1.3.3   -> histórico legado. PRESERVADA.
--   MONTHLY_REPORT_FORMAT_VERSION = 1.3.5   -> nova. Só o formato mensal.
--
-- A constante histórica NÃO é substituída, e a razão é aritmética: ela participa
-- da canonicalização dos QUARENTA documentos já emitidos. Trocar o número
-- mudaria os quarenta códigos — e a remedição deles contra o staging ainda é
-- dívida aberta. Reutilizar a constante seria invalidar uma prova para poupar
-- uma linha.
--
-- ---------------------------------------------------------------------------
-- 2. O relatório mensal NÃO nasce do caminho legado
-- ---------------------------------------------------------------------------
-- `app.official_audit_report_legacy` NÃO É TOCADA. RT-01 continua o risco mais
-- alto do programa, e esta migration não aumenta a exposição a ele em nada.
--
-- O que muda é apenas a MENSAGEM da fronteira que a 0044 criou e a 0045
-- corrigiu: ela citava A-05 como pendência e mandava usar
-- `get_monthly_audit_snapshot`. Agora aponta o caminho definitivo. A ORDEM DE
-- VERIFICAÇÃO É PRESERVADA LETRA POR LETRA — escopo antes de falar do modelo,
-- que é a correção do achado O-16.
--
-- ---------------------------------------------------------------------------
-- 3. De onde o relatório nasce, e de onde NÃO nasce
-- ---------------------------------------------------------------------------
--   NASCE  de: avaliação `monthly_criteria` · APROVADA · com snapshot oficial ·
--              lendo SOMENTE `official_snapshots.payload`, que é imutável por
--              gatilho desde 0033/0034.
--   NÃO NASCE de: catálogo vivo · estado atual dos planos · data atual.
--
-- `generatedAt` existe, e fica FORA do conteúdo assinado. É o único campo que
-- muda entre duas gerações do mesmo documento, e é por isso que ele não pode
-- participar do código de integridade.
--
-- POR QUE OS PLANOS ENTRAM AQUI E FICAM FORA NO LEGADO. O relatório 1.3.3
-- imprime "planos atuais" datados e fora do hash, porque o plano legado aponta
-- para a auditoria inteira e evolui depois dela. O plano mensal aponta para a
-- RESPOSTA DO CRITÉRIO (ADR-135-003, D-Q) e foi materializado no snapshot: ele
-- é parte do que a auditoria afirmou, não do que aconteceu depois. Os dois
-- comportamentos estão certos para os seus contratos — e é exatamente por isso
-- que os contratos são separados.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 4. A versão do formato mensal, como função — para haver UMA fonte
-- ---------------------------------------------------------------------------
create or replace function app.monthly_report_format_version() returns text
  language sql immutable as $$ select '1.3.5'::text $$;

revoke all on function app.monthly_report_format_version() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. O conteúdo do relatório, em ordem DETERMINÍSTICA
-- ---------------------------------------------------------------------------
-- Sem `order by` explícito, duas chamadas iguais podem devolver ordens
-- diferentes, e um teste de determinismo passaria por sorte.
--
-- A ordenação é (tema, indicador, ordem do critério, código do critério). Os
-- quatro juntos são totais: `criterionCode` é único dentro da configuração
-- regional, e por isso não há empate possível.
create or replace function app.monthly_report_content(p_payload jsonb) returns jsonb
  language sql immutable as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'themeCode',      c->>'themeCode',
      'themeName',      c->>'themeName',
      'indicatorCode',  c->>'indicatorCode',
      'indicatorName',  c->>'indicatorName',
      'criterionCode',  c->>'criterionCode',
      'question',       coalesce(c->>'question', ''),
      'description',    coalesce(c->>'description', ''),
      'guidance',       coalesce(c->>'guidance', ''),
      'required',       coalesce((c->>'required')::boolean, false),
      'evidenceRequired', coalesce((c->>'evidenceRequired')::boolean, false),
      'allowsNa',       coalesce((c->>'allowsNa')::boolean, false),
      -- A RESPOSTA, como foi materializada. `answer` nunca é ausente numa
      -- auditoria aprovada, mas o coalesce impede que um payload defeituoso
      -- vire `null` silencioso em vez de erro visível.
      'answer',         coalesce(c->'answer'->>'status', 'nao_avaliado'),
      'justification',  coalesce(c->'answer'->>'justification', ''),
      'observation',    coalesce(c->'answer'->>'observation', ''),
      'diagnosis',      coalesce(c->'answer'->>'diagnosis', ''),
      -- Evidências MATERIALIZADAS. Nome, tipo e tamanho — nunca caminho de
      -- objeto, nunca URL assinada, nunca token.
      'evidences', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',      e->>'name',
                 'mimeType',  e->>'mimeType',
                 'sizeBytes', coalesce((e->>'sizeBytes')::bigint, 0))
               order by e->>'name', e->>'mimeType')
          from jsonb_array_elements(coalesce(c->'answer'->'evidences', '[]'::jsonb)) e
      ), '[]'::jsonb),
      -- Planos MATERIALIZADOS, com responsável, prazo e estado NO MOMENTO da
      -- aprovação. Não é o estado de hoje, e o documento diz isso.
      'plans', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'action',   p->>'action',
                 'owner',    coalesce(p->>'owner', ''),
                 'dueDate',  p->>'dueDate',
                 'priority', p->>'priority',
                 'status',   p->>'status')
               order by p->>'dueDate', p->>'action')
          from jsonb_array_elements(coalesce(c->'plans', c->'answer'->'plans', '[]'::jsonb)) p
      ), '[]'::jsonb)
    )
    order by c->>'themeCode', c->>'indicatorCode',
             coalesce((c->>'sortOrder')::int, 0), c->>'criterionCode'
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_payload->'criteria', '[]'::jsonb)) c
$$;

revoke all on function app.monthly_report_content(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. O resumo do relatório — os mesmos números da A-10, sobre o snapshot
-- ---------------------------------------------------------------------------
create or replace function app.monthly_report_summary(p_payload jsonb) returns jsonb
  language plpgsql immutable as $$
declare
  v_conf int := 0; v_nc int := 0; v_na int := 0; v_ne int := 0;
  v_score numeric := null; v_reasons jsonb := '[]'::jsonb;
  v_plans jsonb;
begin
  select count(*) filter (where c->'answer'->>'status' = 'conforme'),
         count(*) filter (where c->'answer'->>'status' = 'nao_conforme'),
         count(*) filter (where c->'answer'->>'status' = 'nao_aplicavel'),
         count(*) filter (where c->'answer'->>'status' = 'nao_avaliado')
    into v_conf, v_nc, v_na, v_ne
    from jsonb_array_elements(coalesce(p_payload->'criteria', '[]'::jsonb)) c;

  -- A-10, sobre o conteúdo congelado. `nao_aplicavel` fora dos DOIS lados, e
  -- denominador zero é AUSÊNCIA — nunca zero.
  if (v_conf + v_nc) > 0 then
    v_score := round(v_conf::numeric / (v_conf + v_nc) * 100, 2);
  else
    v_reasons := '["no_applicable_criteria"]'::jsonb;
  end if;

  -- Planos por estado, contados sobre o que o snapshot materializou.
  select coalesce(jsonb_object_agg(st, n), '{}'::jsonb) into v_plans
    from (
      select p->>'status' st, count(*) n
        from jsonb_array_elements(coalesce(p_payload->'criteria', '[]'::jsonb)) c,
             jsonb_array_elements(coalesce(c->'plans', c->'answer'->'plans', '[]'::jsonb)) p
       group by 1) t;

  return jsonb_build_object(
    'processScore',        v_score::double precision,
    'sufficient',          jsonb_array_length(v_reasons) = 0,
    'insufficiencyReasons', v_reasons,
    'totalCriteria',       v_conf + v_nc + v_na + v_ne,
    'applicableCriteria',  v_conf + v_nc,
    'conformCount',        v_conf,
    'nonConformCount',     v_nc,
    'notApplicableCount',  v_na,
    'notEvaluatedCount',   v_ne,
    'plansByStatus',       v_plans,
    'ruleVersions', jsonb_build_object(
      'processScoreRule',  app.process_score_rule(),
      'reportFormatVersion', app.monthly_report_format_version())
  );
end $$;

revoke all on function app.monthly_report_summary(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. A porta: `get_monthly_audit_report_data`
-- ---------------------------------------------------------------------------
-- ORDEM DE VERIFICAÇÃO, como em 0031 e como o O-16 exige:
--   1. ator · 2. ESCOPO (antes de revelar existência) · 3. modelo ·
--   4. estado · 5. snapshot · 6. conteúdo.
--
-- O passo 2 usa a MESMA frase para o inexistente e para o alheio. Varrer UUIDs
-- não pode distinguir "não existe" de "existe e não é seu".
create or replace function public.get_monthly_audit_report_data(p_evaluation_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_op      uuid;
  v_model   app.evaluation_model;
  v_status  app.evaluation_status;
  v_snap    record;
  v_payload jsonb;
  v_content jsonb;
begin
  -- 1 · ATOR
  if auth.uid() is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- 2 · ESCOPO, antes de dizer qualquer coisa sobre o objeto
  select e.operation_id, e.evaluation_model, e.status
    into v_op, v_model, v_status
    from public.evaluations e where e.id = p_evaluation_id;

  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'auditoria inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  -- 3 · MODELO. O legado tem caminho próprio, e ele não é este.
  if v_model <> 'monthly_criteria' then
    raise exception 'esta auditoria segue o modelo legado: use get_official_audit_report_data'
      using errcode = 'feature_not_supported';
  end if;

  -- 4 · ESTADO. Relatório oficial de auditoria não aprovada seria um documento
  -- oficial sobre algo que ninguém aprovou.
  if v_status <> 'approved' then
    raise exception 'a auditoria nao esta aprovada: nao ha relatorio oficial'
      using errcode = 'integrity_constraint_violation';
  end if;

  -- 5 · SNAPSHOT. É a ÚNICA fonte do conteúdo.
  select s.id, s.period, s.score, s.payload, s.approved_by_user_id, s.created_at
    into v_snap
    from public.official_snapshots s
   where s.evaluation_id = p_evaluation_id
     and s.evaluation_model = 'monthly_criteria'
   order by s.created_at desc, s.id desc
   limit 1;

  if v_snap.id is null then
    raise exception 'auditoria aprovada sem snapshot oficial: relatorio indisponivel'
      using errcode = 'integrity_constraint_violation';
  end if;

  v_payload := v_snap.payload;
  v_content := app.monthly_report_content(v_payload);

  return jsonb_build_object(
    -- IDENTIDADE
    'identity', jsonb_build_object(
      'reportFormatVersion', app.monthly_report_format_version(),
      'evaluationId',        p_evaluation_id,
      'operationId',         v_op,
      'partnerName',         v_payload->>'partnerName',
      'competence',          coalesce(v_payload->>'competence', v_snap.period),
      'periodStart',         v_payload->>'periodStart',
      'periodEnd',           v_payload->>'periodEnd',
      'status',              v_status::text,
      'approvedBy',          app.user_display_name(v_snap.approved_by_user_id),
      'approvedAt',          v_snap.created_at,
      'snapshotId',          v_snap.id),

    -- RESUMO
    'summary', app.monthly_report_summary(v_payload),

    -- CONTEÚDO
    'content', v_content,

    -- INTEGRIDADE. O código em si é calculado no domínio, sobre a
    -- canonicalização declarada aqui — mesma arquitetura do relatório 1.3.3.
    'integrity', jsonb_build_object(
      'formatVersion',    app.monthly_report_format_version(),
      'ruleVersion',      app.process_score_rule(),
      'canonicalization', 'linha-por-fato/1.3.5',
      'ordering',         'tema,indicador,ordem,criterio'),

    -- FORA DO CONTEÚDO ASSINADO. Único campo que muda entre duas gerações do
    -- MESMO documento — e é por isso que não entra no código de integridade.
    'generatedAt', now()
  );
end $$;

revoke all on function public.get_monthly_audit_report_data(uuid) from public, anon;
-- Matriz §4, linha "Consultar aprovada + PDF": os QUATRO papéis, cada um no
-- próprio escopo. Quem recorta é `app.has_operation_access`, no passo 2.
grant execute on function public.get_monthly_audit_report_data(uuid) to authenticated;

comment on function public.get_monthly_audit_report_data(uuid) is
  'Relatorio Oficial da Auditoria Mensal 1.3.5 (0051). So monthly_criteria aprovada, so do snapshot.';

-- ---------------------------------------------------------------------------
-- 8. A fronteira legada passa a apontar o caminho certo
-- ---------------------------------------------------------------------------
-- `app.official_audit_report_legacy` NÃO É TOCADA — nem aqui, nem em lugar
-- nenhum desta fase.
--
-- O wrapper de 0045 é reescrito apenas na MENSAGEM: A-05 deixou de ser
-- pendência, e mandar o chamador para `get_monthly_audit_snapshot` deixou de ser
-- o melhor conselho. A estrutura é a mesma, e a ordem também: o modelo só é
-- revelado a quem atravessaria a autorização da própria função legada, que é a
-- correção do O-16.
create or replace function public.get_official_audit_report_data(p_evaluation_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_model app.evaluation_model;
  v_op    uuid;
begin
  select evaluation_model, operation_id into v_model, v_op
    from public.evaluations where id = p_evaluation_id;

  if v_model = 'monthly_criteria'
     and v_op is not null
     and auth.uid() is not null
     and coalesce(app.has_operation_access(v_op), false)
  then
    raise exception 'a Auditoria Mensal por criterios tem formato proprio: '
                    'use get_monthly_audit_report_data'
      using errcode = 'feature_not_supported';
  end if;

  return app.official_audit_report_legacy(p_evaluation_id);
end $$;

revoke all on function public.get_official_audit_report_data(uuid) from public, anon;
grant execute on function public.get_official_audit_report_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. `get_monthly_audit_snapshot` deixa de anunciar pendência fechada
-- ---------------------------------------------------------------------------
-- A RPC de 0044 devolve `scoreRule = 'proporcao-simples/A-10-pendente'`. A-10
-- foi congelada, e o §11 da decisão manda **remover do contrato interno** os
-- identificadores que digam "pendente" — o histórico fica na documentação, não
-- no payload.
--
-- WRAPPER de novo, e não reescrita. Copiar o corpo para trocar UMA string é
-- exatamente o risco que a 0044 materializou com `submit_evaluation`: o corpo
-- carrega a guarda de escopo, a fronteira de modelo e a guarda de "ainda não
-- aprovada", e cada uma delas é uma chance de perder algo em silêncio.
--
-- Sétima camada (RT-15). Como a sexta, ela **DELEGA PRIMEIRO**: a autorização
-- inteira acontece dentro da função movida, e o wrapper só toca no payload
-- depois que ela devolveu.
do $$
declare v_def text;
begin
  if to_regprocedure('app.monthly_audit_snapshot_legacy(uuid)') is null then
    select pg_get_functiondef('public.get_monthly_audit_snapshot(uuid)'::regprocedure) into v_def;
    if position('public.get_monthly_audit_snapshot(' in v_def) = 0 then
      raise exception 'nao foi possivel localizar o corpo vigente de get_monthly_audit_snapshot';
    end if;
    v_def := replace(v_def, 'public.get_monthly_audit_snapshot(',
                            'app.monthly_audit_snapshot_legacy(');
    execute v_def;
  end if;
end $$;

revoke all on function app.monthly_audit_snapshot_legacy(uuid) from public, anon, authenticated;

create or replace function public.get_monthly_audit_snapshot(p_evaluation_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare v_out jsonb;
begin
  -- DELEGA PRIMEIRO: ator, escopo, modelo e estado são resolvidos lá dentro.
  v_out := app.monthly_audit_snapshot_legacy(p_evaluation_id);
  return jsonb_set(v_out, '{scoreRule}', to_jsonb(app.process_score_rule()))
       || jsonb_build_object('reportFormatVersion', app.monthly_report_format_version());
end $$;

revoke all on function public.get_monthly_audit_snapshot(uuid) from public, anon;
grant execute on function public.get_monthly_audit_snapshot(uuid) to authenticated;
