-- =============================================================================
-- AAPEX 1.3.3 — Migration 0035: dados do Relatório Oficial de Auditoria
-- =============================================================================
-- O QUE ESTA MIGRATION ENTREGA. Duas RPCs e nada mais:
--
--   1. `get_official_audit_report_data(uuid)` — devolve, já autorizado e
--      normalizado, o conteúdo necessário para montar o Relatório Oficial de
--      Auditoria de UMA avaliação oficialmente validada;
--   2. `log_official_audit_report_export(...)` — registra na trilha a
--      exportação que REALMENTE aconteceu.
--
-- Nenhuma tabela nova. O relatório é gerado sob demanda e não é armazenado:
-- guardar o PDF criaria uma segunda verdade, que envelheceria em silêncio ao
-- lado do snapshot — e o snapshot já é a verdade oficial imutável (§11.4).
--
-- A FONTE DA PARTE OFICIAL É `official_snapshots.payload`, NUNCA A RESPOSTA
-- VIVA. Isso não é preciosismo: `evaluation_answers` continua sendo uma tabela
-- comum, e a avaliação aprovada pode ser supersedida por um adendo (§11.4).
-- Ler a resposta viva faria o "relatório oficial" mudar depois de emitido. O
-- payload é o `app.evaluation_dto` congelado no instante da aprovação — mesmo
-- contrato camelCase de `ui_evaluations`, com `themeId`, `status`,
-- `measuredValue`, `observation`, `notApplicableReason` e `evidenceIds`.
--
-- O QUE O PAYLOAD NÃO TEM, E DE ONDE VEM. O snapshot guarda o `themeId` (o
-- `code` do item), não o título nem o pilar nem o peso. Esses vêm de
-- `audit_items` pela `template_version_id` GRAVADA NO PRÓPRIO SNAPSHOT — não
-- pela versão vigente hoje. Uma versão de template usada fica travada
-- (`locked`, §11.4), então essa junção é estável: o relatório reemitido daqui a
-- um ano descreve os itens como eles eram, e não como passaram a ser.
--
-- ORDEM DE AUTORIZAÇÃO (a mesma que a 0031 fixou para `validate_evaluation`):
--   (1) ator      — `auth.uid()` nulo é recusado antes de qualquer leitura;
--   (2) registro  — localiza a avaliação e DERIVA o `operation_id` dela;
--   (3) escopo    — `app.has_operation_access`; "inexistente" e "fora do
--                   escopo" respondem A MESMA COISA, para que varrer UUIDs não
--                   distinga o que existe do que não existe;
--   (4) estado    — só depois de o chamador provar que PODE ver esta avaliação
--                   é que a mensagem empresarial ("ainda não validada", "sem
--                   snapshot") passa a ser informação a que ele tem direito.
--
-- O `operation_id` NUNCA vem do cliente. Ele é derivado da avaliação dentro da
-- função; um parâmetro seria um pedido de autorização assinado pelo próprio
-- requerente.
--
-- O QUE NÃO SAI DAQUI. e-mail, telefone, CPF, senha, JWT, token, `bucket`,
-- `path` interno do Storage, URL assinada, URL pública, hash do objeto,
-- conteúdo binário. As pessoas aparecem por NOME FUNCIONAL e papel
-- (`app.user_display_name`), como já acontece em `ui_action_plans` desde a
-- 0025. As evidências aparecem por nome SEGURO — o mesmo saneamento que a 0028
-- aplica ao gravar (`app.evidence_safe_name`) —, tipo, tamanho e existência
-- confirmada. Nada que permita alcançar o objeto.
--
-- Migrations 0001–0034 não são alteradas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Papel funcional vigente de uma pessoa
-- ---------------------------------------------------------------------------
-- Mesma regra que `ui_users` já usa para a coluna "role": o escopo ativo mais
-- recente. Existe como função porque o relatório precisa do papel do avaliador
-- e do validador, e `ui_users` é `security_invoker` — sob a RLS de
-- `public.users` (`id = auth.uid() or app.is_admin()`), um Gerente de Canal
-- lendo a view não enxergaria o próprio validador. Aqui a decisão de
-- autorização já foi tomada pelo RPC chamador, e o que se revela é apenas o
-- papel, nunca o e-mail.
create or replace function app.user_role_code(p_user uuid) returns text
  language sql stable security definer set search_path = public, app as $$
  select s.role::text
    from public.user_scopes s
   where s.user_id = p_user
     and s.active
     and (s.valid_to is null or s.valid_to > now())
   order by s.valid_from desc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- Guarda compartilhada: esta avaliação tem relatório oficial para este ator?
-- ---------------------------------------------------------------------------
-- Uma função só, usada pelas DUAS RPCs, para que a leitura dos dados e o
-- registro da exportação não possam divergir de critério. Devolve o
-- `official_snapshots.id` quando tudo passa; levanta a exceção certa quando
-- não. Os quatro passos estão na ordem descrita no cabeçalho.
create or replace function app.official_report_snapshot_id(p_evaluation_id uuid)
  returns uuid
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_uid uuid; v_op uuid; v_status app.evaluation_status; v_snapshot uuid;
begin
  -- (1) ATOR.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) REGISTRO — o operation_id é DERIVADO, nunca recebido.
  select e.operation_id, e.status into v_op, v_status
    from public.evaluations e where e.id = p_evaluation_id;

  -- (3) ESCOPO — resposta uniforme para inexistente e fora do escopo.
  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'avaliacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  -- (4) ESTADO — daqui para baixo o chamador já provou que pode ver.
  -- 'superseded' é uma avaliação que FOI aprovada e depois recebeu adendo: o
  -- snapshot dela continua sendo verdade oficial daquele ciclo, e o relatório
  -- segue emissível. O que não tem relatório oficial é o que nunca foi
  -- aprovado.
  if v_status not in ('approved', 'superseded') then
    raise exception 'avaliacao ainda nao foi validada oficialmente'
      using errcode = 'integrity_constraint_violation';
  end if;

  select s.id into v_snapshot
    from public.official_snapshots s
   where s.evaluation_id = p_evaluation_id
   order by s.created_at asc
   limit 1;

  if v_snapshot is null then
    raise exception 'snapshot oficial nao encontrado para esta avaliacao'
      using errcode = 'integrity_constraint_violation';
  end if;

  return v_snapshot;
end $$;

-- ---------------------------------------------------------------------------
-- Os dados do relatório
-- ---------------------------------------------------------------------------
-- Não gera PDF, não formata, não decide layout: entrega fatos autorizados. A
-- separação entre o que é OFICIAL (do snapshot) e o que é ATUAL (planos, lidos
-- agora) é explícita no formato de saída, porque é ela que o documento precisa
-- imprimir sem ambiguidade.
create or replace function public.get_official_audit_report_data(p_evaluation_id uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = public, app as $$
declare
  v_snapshot uuid;
  v_payload  jsonb;
  v_op       uuid;
  v_tpl      uuid;
  v_period   text;
  v_score    numeric;
  v_created  timestamptz;
  v_out      jsonb;
begin
  v_snapshot := app.official_report_snapshot_id(p_evaluation_id);

  select s.payload, s.operation_id, s.template_version_id, s.period, s.score, s.created_at
    into v_payload, v_op, v_tpl, v_period, v_score, v_created
    from public.official_snapshots s where s.id = v_snapshot;

  select jsonb_build_object(
    -- ---------------------------------------------------------------------
    -- Identificação
    -- ---------------------------------------------------------------------
    'evaluationId', p_evaluation_id,
    'snapshotId',   v_snapshot,
    'operationId',  v_op,

    -- ---------------------------------------------------------------------
    -- CONTEÚDO OFICIAL IMUTÁVEL — tudo abaixo sai do snapshot
    -- ---------------------------------------------------------------------
    'official', jsonb_build_object(
      'partnerName',   o.partner_name,
      'officeName',    o.office_name,
      'city',          o.city,
      'state',         o.state,
      'regionName',    r.name,
      'unitName',      u.name,
      'coordinationName', c.name,
      'period',        v_period,
      'periodStart',   v_payload->>'periodStart',
      'periodEnd',     v_payload->>'periodEnd',
      'cycleLabel',    coalesce(v_payload->>'cycleLabel', ''),
      'frequency',     v_payload->>'frequency',
      'score',         v_score::double precision,
      'status',        coalesce(v_payload->>'status', 'approved'),
      'evaluatorName', app.user_display_name((v_payload->>'evaluatorId')::uuid),
      'evaluatorRole', app.user_role_code((v_payload->>'evaluatorId')::uuid),
      'validatorName', app.user_display_name((v_payload->>'validatorId')::uuid),
      'validatorRole', app.user_role_code((v_payload->>'validatorId')::uuid),
      -- `validatorNote` é o diagnóstico consolidado que o validador registrou
      -- no ato da aprovação — o único texto de fechamento que o snapshot tem.
      'validatorNote', coalesce(v_payload->>'validatorNote', ''),
      'startedAt',     v_payload->>'createdAt',
      'submittedAt',   v_payload->>'submittedAt',
      'validatedAt',   coalesce(v_payload->>'validatedAt', v_created::text),

      -- Respostas oficiais, enriquecidas com o catálogo DA VERSÃO DO SNAPSHOT.
      -- `left join`: um item que saísse do catálogo não pode fazer a resposta
      -- oficial desaparecer do relatório.
      'answers', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'code',                a.themeId,
            'pillar',              coalesce(ai.pillar, ''),
            'title',               coalesce(ai.title, ''),
            'weight',              coalesce(ai.weight, 0)::double precision,
            'status',              a.status,
            'measuredValue',       coalesce(a.measuredValue, ''),
            'observation',         coalesce(a.observation, ''),
            'notApplicableReason', coalesce(a.notApplicableReason, ''),
            'evidenceCount',       a.evidenceCount
          ) order by a.themeId
        )
        from (
          select
            ans->>'themeId'             as themeId,
            ans->>'status'              as status,
            ans->>'measuredValue'       as measuredValue,
            ans->>'observation'         as observation,
            ans->>'notApplicableReason' as notApplicableReason,
            jsonb_array_length(coalesce(ans->'evidenceIds', '[]'::jsonb)) as evidenceCount
          from jsonb_array_elements(coalesce(v_payload->'answers', '[]'::jsonb)) ans
        ) a
        left join public.audit_items ai
          on ai.template_version_id = v_tpl and ai.code = a.themeId
      ), '[]'::jsonb),

      -- Índice das evidências: NOME SEGURO, tipo, tamanho e existência
      -- confirmada. Sem bucket, sem path, sem URL — a comprovação continua
      -- acessível pelo caminho autenticado do app, nunca por este documento.
      'evidenceIndex', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'code',      ev.themeId,
            'name',      app.evidence_safe_name(
                           regexp_replace(ef.path, '^[^/]*/[0-9a-f-]{36}-', '')),
            'mimeType',  ef.mime_type,
            'sizeBytes', ef.size_bytes,
            'confirmed', (ef.status = 'stored')
          ) order by ev.themeId, ef.created_at
        )
        from (
          select ans->>'themeId' as themeId, (eid #>> '{}')::uuid as evidence_id
            from jsonb_array_elements(coalesce(v_payload->'answers', '[]'::jsonb)) ans
            cross join lateral jsonb_array_elements(coalesce(ans->'evidenceIds', '[]'::jsonb)) eid
        ) ev
        join public.evidence_files ef on ef.id = ev.evidence_id
      ), '[]'::jsonb)
    ),

    -- ---------------------------------------------------------------------
    -- CONTEÚDO OPERACIONAL ATUAL — lido AGORA, e datado como tal
    -- ---------------------------------------------------------------------
    'current', jsonb_build_object(
      'readAt', now(),
      'actionPlans', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'code',          coalesce(ap.theme_code, ''),
            'action',        coalesce(nullif(ap.action_text, ''), ap.description),
            'owner',         coalesce(nullif(ap.owner_name, ''), ''),
            'dueDate',       ap.due_date::text,
            'priority',      ap.priority,
            'status',        app.action_status_to_ui(ap.status),
            -- Atraso é fato derivado da data de HOJE, não estado gravado.
            'overdue',       (ap.due_date < current_date
                              and ap.status not in ('done', 'validated', 'cancelled_justified')),
            'validatorName', app.user_display_name(ap.validated_by),
            'validatedAt',   ap.validated_at,
            'updatedAt',     ap.updated_at
          ) order by ap.due_date, ap.created_at
        )
        from public.action_plans ap
        where ap.evaluation_id = p_evaluation_id
      ), '[]'::jsonb)
    )
  )
  into v_out
  from public.operations o
  left join public.units u        on u.id = o.unit_id
  left join public.regions r      on r.id = u.region_id
  left join public.coordinations c on c.id = o.coordination_id
  where o.id = v_op;

  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- A trilha da exportação
-- ---------------------------------------------------------------------------
-- Só é chamada DEPOIS de o PDF existir e a entrega ter começado — falha antes
-- disso não gera evento de sucesso, porque o cliente simplesmente não chega
-- aqui. O ator vem de `auth.uid()` dentro de `app.write_audit` (0029); não há
-- parâmetro de ator, e por isso não há como atribuir a exportação a outra
-- pessoa.
--
-- Convenção de nome conferida na 0029: os eventos são `objeto.verbo` —
-- `evaluation.submitted`, `evaluation.approved`, `snapshot.created`. Daí
-- `evaluation.report_exported`, e não `evaluation_report_exported`.
--
-- DEDUPLICAÇÃO. O toque duplo é barrado no cliente por uma trava síncrona, mas
-- a trava do cliente não é garantia de nada para quem lê a trilha depois. Uma
-- janela curta fecha o resto: a MESMA pessoa, exportando o MESMO conteúdo
-- oficial (mesmo código de integridade), dentro de 15 segundos, registra uma
-- linha só. Uma reemissão legítima minutos depois é fato novo e é registrada.
create or replace function public.log_official_audit_report_export(
  p_evaluation_id uuid,
  p_snapshot_id uuid,
  p_report_version text,
  p_integrity_code text
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_snapshot uuid;
  v_uid uuid;
  v_op uuid;
  v_code text;
  v_recent boolean;
begin
  -- Mesma guarda da leitura: quem não pode ler o relatório não pode dizer que
  -- o exportou.
  v_snapshot := app.official_report_snapshot_id(p_evaluation_id);
  v_uid := auth.uid();

  -- O snapshot é o que o servidor apurou, não o que o cliente afirmou. Um
  -- `p_snapshot_id` divergente é recusado em vez de gravado.
  if p_snapshot_id is not null and p_snapshot_id <> v_snapshot then
    raise exception 'snapshot divergente da avaliacao'
      using errcode = 'integrity_constraint_violation';
  end if;

  select s.operation_id into v_op
    from public.official_snapshots s where s.id = v_snapshot;

  -- O código de integridade é identificador, não texto livre: 64 hexadecimais
  -- (SHA-256) ou o prefixo legível impresso no documento. Qualquer outra coisa
  -- não entra na trilha.
  v_code := lower(btrim(coalesce(p_integrity_code, '')));
  if v_code !~ '^[0-9a-f]{16,64}$' then
    raise exception 'codigo de integridade invalido'
      using errcode = 'integrity_constraint_violation';
  end if;

  select exists (
    select 1 from public.audit_logs l
     where l.event = 'evaluation.report_exported'
       and l.object_id = p_evaluation_id::text
       and l.actor_user_id is not distinct from v_uid
       and l.metadata->>'integrityCode' = v_code
       and l.created_at > now() - interval '15 seconds'
  ) into v_recent;

  if v_recent then
    return jsonb_build_object('logged', false, 'reason', 'duplicate');
  end if;

  perform app.write_audit(
    'evaluation.report_exported', 'evaluation', p_evaluation_id::text,
    jsonb_build_object(
      'operationId',    v_op,
      'snapshotId',     v_snapshot,
      'reportVersion',  left(coalesce(p_report_version, ''), 20),
      'integrityCode',  v_code
    ));

  return jsonb_build_object('logged', true);
end $$;

-- ---------------------------------------------------------------------------
-- Grants — menor privilégio (convenção 0023/0025/0031)
-- ---------------------------------------------------------------------------
-- `PUBLIC` e `anon` sem EXECUTE. A autorização real está nos corpos; o revoke
-- existe para que uma requisição anônima morra na porta do PostgREST, sem
-- sequer entrar na função.
revoke all on function public.get_official_audit_report_data(uuid) from public, anon;
revoke all on function public.log_official_audit_report_export(uuid, uuid, text, text) from public, anon;
grant execute on function
  public.get_official_audit_report_data(uuid),
  public.log_official_audit_report_export(uuid, uuid, text, text)
to authenticated;

-- Helpers do schema `app`: usados SOMENTE dentro das RPCs `security definer`
-- acima, nunca chamados pelo cliente. Sem grant para `authenticated`.
revoke all on function app.official_report_snapshot_id(uuid) from public, anon;
revoke all on function app.user_role_code(uuid) from public, anon;
