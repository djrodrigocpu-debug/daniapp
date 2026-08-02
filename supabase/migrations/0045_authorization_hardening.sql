-- ===========================================================================
-- 0045 — HARDENING DE AUTORIZAÇÃO (AAPEx 1.3.5, Fase 6)
--
-- DOIS DEFEITOS REAIS, encontrados pela auditoria integral da superfície criada
-- em 0036–0044 e reproduzidos por teste VERMELHO antes desta migration
-- (`src/db/authorization_surface.integration.test.ts`). Nenhuma correção
-- preventiva entra aqui: o que não foi provado defeituoso não é tocado.
--
-- ---------------------------------------------------------------------------
-- ACHADO O-16 · a fronteira de MODELO precede a de ESCOPO nos dois wrappers
-- ---------------------------------------------------------------------------
-- A 0044 transformou `submit_evaluation` e `get_official_audit_report_data` em
-- wrappers que primeiro leem `evaluations.evaluation_model` e, se for
-- `monthly_criteria`, recusam com mensagem própria — SEM antes verificar se o
-- chamador alcança a avaliação.
--
-- Consequência medida: varrendo UUIDs, um autenticado qualquer distinguia
--
--   UUID inexistente          -> "avaliacao inexistente ou fora do escopo"
--   auditoria mensal ALHEIA   -> "a Auditoria Mensal por criterios ainda nao
--                                 tem formato de relatorio oficial ..."
--
-- e portanto aprendia (a) que o objeto existe e (b) qual é o modelo dele, sobre
-- um objeto inteiramente fora do seu alcance. É exatamente o que o cabeçalho da
-- 0035 declara proibido: *"resposta uniforme para inexistente e fora do escopo,
-- para que varrer UUIDs não distinga o que existe do que não existe"*.
--
-- CORREÇÃO, e por que esta forma. O wrapper passa a só FALAR do modelo quando o
-- chamador teria passado pela autorização da própria função legada; caso
-- contrário ele delega, e a resposta é literalmente a que a função legada sempre
-- deu. Assim:
--
--   * nenhuma mensagem é duplicada — a regra de escopo continua morando em
--     `app.has_operation_access`, fonte única, e o wrapper apenas a consulta;
--   * o caminho legado permanece BYTE A BYTE o mesmo: `app.*_legacy` não é
--     tocada, e continua sendo o mesmo objeto renomeado por `pg_get_functiondef`
--     (Migração §2). O determinismo dos 40 códigos não tem por onde mudar;
--   * quem ALCANÇA a auditoria mensal continua recebendo a fronteira nominal,
--     com A-05 citada — que é o comportamento que a ADR-135-003 D-S pede.
--
-- ---------------------------------------------------------------------------
-- ACHADO O-17 · `authenticated` retém REFERENCES e TRIGGER no catálogo novo
-- ---------------------------------------------------------------------------
-- As migrations 0036, 0037 e 0038 fizeram
--
--     revoke insert, update, delete, truncate ... from authenticated;
--
-- em vez do `revoke all ... from anon, public, authenticated` seguido de
-- `grant select`, que é o padrão adotado a partir da 0039. No ambiente real toda
-- tabela de `public` nasce com privilégio amplo (achado O-10), então o que a
-- lista não revoga PERMANECE: `REFERENCES` e `TRIGGER` ficaram com
-- `authenticated` nas seis tabelas de catálogo.
--
-- `TRIGGER` não é decorativo. Medido no harness: um Gerente de Canal consegue
--
--     create trigger ... before insert on public.themes
--       for each row execute function app.<qualquer gatilho existente>();
--
-- porque as funções de gatilho de `app` mantêm o EXECUTE padrão de PUBLIC. O
-- efeito alcançável é de integridade e disponibilidade — alterar ou impedir a
-- escrita de catálogo do ADMIN a partir de um papel que não administra catálogo
-- nenhum. Não é escalonamento de leitura, e nenhum dado vaza; é escrita de
-- comportamento por quem não deveria escrever comportamento.
--
-- CORREÇÃO: alinhar as seis tabelas ao padrão de 0039–0044 — `authenticated`
-- com exatamente `SELECT`. `anon` e `PUBLIC` já estavam zerados desde a própria
-- migration de origem, e continuam.
--
-- FORA DESTA CORREÇÃO, DELIBERADAMENTE: as 37 tabelas do modelo legado têm o
-- mesmo privilégio amplo, e isso é o achado O-10, preservado por decisão
-- (Impacto Técnico §8, RT-02: a mitigação vale *na superfície nova*). Além
-- disso, `action_plans` DEPENDE de escrita direta por RLS — ADR-135-002 §2 diz
-- isso com todas as letras —, de modo que um `revoke` amplo no legado não é
-- ajuste de higiene, é mudança de contrato. Fica registrado, não executado.
--
-- ---------------------------------------------------------------------------
-- ADITIVA. Nenhum dado é lido, escrito, apagado ou reinterpretado. Nenhuma
-- tabela, coluna, tipo, gatilho, policy ou índice é criado ou removido.
-- Migrations 0001–0044 permanecem imutáveis.
--
-- ROLLBACK: recriar os dois wrappers com o corpo de 0044 (seção 9) e
-- `grant references, trigger on <as seis> to authenticated`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. O-16 · ordem correta nos dois wrappers
-- ---------------------------------------------------------------------------
-- `submit_evaluation`. A função legada (`app.submit_evaluation_legacy`, que é a
-- de 0025 + a guarda de estado de 0027) recusa quem não é autor ou não alcança a
-- operação. O wrapper agora só interrompe antes dela quando o chamador
-- ATRAVESSARIA essas duas condições — nos demais casos delega, e a recusa é a
-- que sempre foi.
create or replace function public.submit_evaluation(p_evaluation_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare
  v_model  app.evaluation_model;
  v_op     uuid;
  v_author uuid;
begin
  select evaluation_model, operation_id, author_user_id
    into v_model, v_op, v_author
    from public.evaluations where id = p_evaluation_id;

  -- ATOR -> ESCOPO -> MODELO. A fronteira de modelo só fala com quem já provou
  -- alcançar a avaliação; para os demais, quem responde é a função legada, com a
  -- mesma frase que daria se este wrapper não existisse.
  if v_model = 'monthly_criteria'
     and v_op is not null
     and coalesce(v_author = auth.uid(), false)
     and coalesce(app.has_operation_access(v_op), false)
  then
    raise exception 'esta auditoria segue o modelo por criterios: use submit_monthly_audit'
      using errcode = 'integrity_constraint_violation';
  end if;

  return app.submit_evaluation_legacy(p_evaluation_id);
end $$;

-- `get_official_audit_report_data`. Mesma forma. A autorização de leitura do
-- relatório mora em `app.official_report_snapshot_id` (0035), chamada dentro de
-- `app.official_audit_report_legacy`; o wrapper não a repete — apenas verifica,
-- com a MESMA função de escopo, se vale a pena falar do modelo.
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
    raise exception 'a Auditoria Mensal por criterios ainda nao tem formato de relatorio oficial '
                    '(pendencia A-05): use get_monthly_audit_snapshot'
      using errcode = 'feature_not_supported';
  end if;

  return app.official_audit_report_legacy(p_evaluation_id);
end $$;

-- Os grants dos dois são reafirmados: `create or replace function` preserva o
-- ACL, mas dizer aqui torna o arquivo legível sozinho.
revoke all on function public.submit_evaluation(uuid)              from public, anon;
revoke all on function public.get_official_audit_report_data(uuid) from public, anon;
grant execute on function public.submit_evaluation(uuid)              to authenticated;
grant execute on function public.get_official_audit_report_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. O-17 · `authenticated` com exatamente SELECT no catálogo da 1.3.5
-- ---------------------------------------------------------------------------
-- `revoke all` e regrant, e não `revoke references, trigger`: é o padrão de
-- 0039–0044, e é o único que não depende de a lista de privilégios do PostgreSQL
-- continuar sendo a de hoje.
revoke all on table public.themes                             from anon, public, authenticated;
revoke all on table public.theme_versions                     from anon, public, authenticated;
revoke all on table public.indicator_regional_configs         from anon, public, authenticated;
revoke all on table public.indicator_regional_config_versions from anon, public, authenticated;
revoke all on table public.audit_criteria                     from anon, public, authenticated;
revoke all on table public.audit_criteria_versions            from anon, public, authenticated;

grant select on table public.themes                             to authenticated;
grant select on table public.theme_versions                     to authenticated;
grant select on table public.indicator_regional_configs         to authenticated;
grant select on table public.indicator_regional_config_versions to authenticated;
grant select on table public.audit_criteria                     to authenticated;
grant select on table public.audit_criteria_versions            to authenticated;

comment on table public.themes is
  'Catalogo de temas (0036). RPC-only: authenticated tem SELECT e nada mais (0045, achado O-17).';
