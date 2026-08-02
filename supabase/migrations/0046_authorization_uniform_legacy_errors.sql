-- ===========================================================================
-- 0046 — RECUSA UNIFORME NO CAMINHO LEGADO (AAPEx 1.3.5, Gate 0 · achado O-18)
--
-- O DEFEITO, reproduzido por teste VERMELHO antes desta migration
-- (`src/db/legacy_error_uniformity.integration.test.ts`, 10 casos falhando).
-- Três RPCs do caminho legado respondiam com frases DIFERENTES conforme o
-- objeto existisse:
--
--                            UUID inexistente        UUID existente fora do alcance
--   submit_evaluation        avaliacao inexistente   sem permissao
--   remove_evidence          avaliacao inexistente   sem permissao
--   reserve_evidence_upload  avaliacao inexistente   sem permissao
--
-- Varrer UUIDs, portanto, separava o que existe do que não existe — para um
-- chamador que não alcança nem um nem outro. É o mesmo tipo de vazamento do
-- O-16, com metade da informação (o modelo não é revelado), e é ANTERIOR à
-- 1.3.5: vem de 0006, 0025, 0027 e 0028. A 0045 garantiu o que cabia à Fase 6 —
-- que o WRAPPER não acrescentasse informação —, e registrou o resto como aberto.
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO, e por que exatamente esta fronteira
-- ---------------------------------------------------------------------------
-- A recusa passa a ser `avaliacao inexistente ou fora do escopo`, com
-- `insufficient_privilege`. Não é frase nova: é literalmente a que 0031
-- (`validate_evaluation`) e 0035 (`get_official_audit_report_data`) já adotam, e
-- cujo motivo o cabeçalho da 0035 declara com todas as letras — *"resposta
-- uniforme para inexistente e fora do escopo, para que varrer UUIDs não
-- distinga o que existe do que não existe"*.
--
-- A fronteira uniformizada é o ESCOPO — `app.has_operation_access` —, e SÓ ele.
-- Não a autoria. A distinção é deliberada e é o que mantém a correção mínima:
--
--   * quem NÃO alcança a operação não pode saber se a avaliação existe. Esse era
--     o vazamento, e é o que esta migration fecha;
--   * quem ALCANÇA a operação já enxerga a linha por RLS (`evaluations_read`,
--     0002) — dizer-lhe *"você não é o autor"* não revela nada que um `select`
--     seu não revelasse. Uniformizar aí não fecharia buraco nenhum e apagaria
--     uma mensagem útil de quem tem direito a ela.
--
-- ---------------------------------------------------------------------------
-- WRAPPER, nunca cópia — e a armadilha que a Fase 6 documentou
-- ---------------------------------------------------------------------------
-- `remove_evidence` e `reserve_evidence_upload` são renomeadas para
-- `app.*_legacy` por `pg_get_functiondef`, exatamente como a 0044 fez com
-- `submit_evaluation`: o corpo vigente não é transcrito, é MOVIDO. Assim
-- "as guardas continuam lá" deixa de ser promessa e vira propriedade do comando.
-- Copiar já custou caro uma vez — a primeira versão da 0044 reescreveu
-- `submit_evaluation` a partir da 0025 e perdeu, em silêncio, a guarda de estado
-- que a 0027 acrescentara.
--
-- E a armadilha inversa (RF6-02, achado O-16): **o wrapper roda ANTES da
-- guarda**. Por isso a única coisa que os wrappers desta migration fazem antes
-- de delegar é verificar ATOR e ESCOPO — nunca falar do objeto. A fronteira de
-- MODELO de `submit_evaluation`, que a 0045 já havia posto atrás da autorização,
-- continua atrás dela, e agora de forma mais direta: a verificação de escopo é
-- um `raise` próprio, e não mais uma condição embutida no `if` do modelo.
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO MUDA
-- ---------------------------------------------------------------------------
--   * `app.submit_evaluation_legacy` NÃO é tocada — continua sendo o objeto que
--     a 0044 renomeou, com os quatro portões da 0025 e a guarda de estado da
--     0027. O determinismo do Relatório Oficial (RT-01) não tem por onde mudar:
--     `app.official_audit_report_legacy` também não é tocada;
--   * a trava `for update` de `remove_evidence` continua sendo tomada ANTES de
--     qualquer decisão — agora no próprio wrapper, que é o ponto de entrada, e
--     de novo dentro da função legada (mesma transação, mesma linha);
--   * `autenticacao obrigatoria` continua sendo a primeira recusa de
--     `remove_evidence`, como desde a 0031;
--   * quem alcança a operação continua recebendo `sem permissao` quando não é o
--     autor, e as mensagens de ESTADO e de ITEM seguem palavra por palavra;
--   * nenhuma mensagem de outro fluxo é alterada.
--
-- ADITIVA. Nenhum dado é lido, escrito, apagado ou reinterpretado. Nenhuma
-- tabela, coluna, tipo, gatilho, policy ou índice é criado ou removido.
-- Migrations 0001–0045 permanecem imutáveis.
--
-- ROLLBACK: `create or replace` de `public.remove_evidence` e
-- `public.reserve_evidence_upload` com o corpo de `app.*_legacy`, e do
-- `public.submit_evaluation` com o corpo da 0045, seção 1.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. submit_evaluation — ESCOPO como recusa própria, MODELO depois
-- ---------------------------------------------------------------------------
-- A forma da 0045 fazia a verificação de escopo dentro do `if` do modelo, e
-- delegava tudo o mais à função legada. Isso resolvia o O-16 mas deixava a
-- recusa de escopo nascer lá dentro, com as duas frases do O-18. Agora o escopo
-- é decidido aqui, uma vez, com a frase única.
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

  -- (1) ESCOPO. Inexistente e fora do alcance respondem A MESMA COISA (O-18).
  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'avaliacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  -- (2) MODELO. Só para quem também é o AUTOR — que é quem atravessaria a
  -- autorização da função legada. Preserva, sem afrouxar, a correção do O-16:
  -- quem alcança mas não é autor continua recebendo a recusa de sempre, vinda
  -- de dentro do legado, e portanto não aprende o modelo do objeto.
  if v_model = 'monthly_criteria' and coalesce(v_author = auth.uid(), false) then
    raise exception 'esta auditoria segue o modelo por criterios: use submit_monthly_audit'
      using errcode = 'integrity_constraint_violation';
  end if;

  return app.submit_evaluation_legacy(p_evaluation_id);
end $$;

-- ---------------------------------------------------------------------------
-- 2. remove_evidence — a vigente vira `app.remove_evidence_legacy`
-- ---------------------------------------------------------------------------
-- A função vigente é a da 0044 (que é a da 0034 mais o ramo do vínculo de
-- critério). Ela é MOVIDA, não copiada: as cinco verificações — ator, trava
-- `for update`, avaliação da evidência derivada do registro, autorização fechada
-- por `coalesce` e janela de estado — continuam sendo o mesmo texto, porque são
-- literalmente o mesmo objeto.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'remove_evidence';

  execute replace(
    v_src,
    'FUNCTION public.remove_evidence(p_evaluation_id uuid, p_evidence_id uuid)',
    'FUNCTION app.remove_evidence_legacy(p_evaluation_id uuid, p_evidence_id uuid)'
  );
end $$;

create or replace function public.remove_evidence(p_evaluation_id uuid, p_evidence_id uuid)
  returns void
  language plpgsql security definer set search_path = public, app as $$
declare
  v_uid uuid;
  v_op  uuid;
begin
  -- (1) ATOR. Primeiro, como desde a 0031: sem sessão não há escopo possível, e
  -- a recusa acontece antes de qualquer leitura.
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  -- (2) TRAVA ANTES DE DECIDIR. Mesma razão da 0034: serializa esta chamada
  -- contra o `submit_evaluation` concorrente, que trava a MESMA linha. A trava
  -- migra para o ponto de ENTRADA, e a função legada volta a tomá-la — mesma
  -- transação, mesma linha, custo nulo.
  select e.operation_id into v_op
    from public.evaluations e where e.id = p_evaluation_id
     for update;

  -- (3) ESCOPO. Inexistente e fora do alcance respondem A MESMA COISA (O-18).
  -- A AUTORIA continua sendo decidida pela função legada: quem alcança a
  -- operação já vê a linha por RLS, e dizer-lhe que não é o autor não revela
  -- nada que um `select` seu não revelasse.
  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'avaliacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  perform app.remove_evidence_legacy(p_evaluation_id, p_evidence_id);
end $$;

revoke all on function app.remove_evidence_legacy(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. reserve_evidence_upload — mesma técnica, mesma fronteira
-- ---------------------------------------------------------------------------
-- A vigente é a da 0044 (0028 mais o ramo `monthly_criteria`). O wrapper recusa
-- por escopo ANTES de o legado tocar em modelo, item, critério, tipo de arquivo
-- ou tamanho — para que nenhuma dessas mensagens confirme, por omissão, que a
-- avaliação existe.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_evidence_upload';

  execute replace(
    v_src,
    'FUNCTION public.reserve_evidence_upload(p_evaluation_id uuid, p_theme_id text, p_input jsonb)',
    'FUNCTION app.reserve_evidence_upload_legacy(p_evaluation_id uuid, p_theme_id text, p_input jsonb)'
  );
end $$;

create or replace function public.reserve_evidence_upload(
  p_evaluation_id uuid, p_theme_id text, p_input jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, app as $$
declare v_op uuid;
begin
  select operation_id into v_op
    from public.evaluations where id = p_evaluation_id;

  if v_op is null or not coalesce(app.has_operation_access(v_op), false) then
    raise exception 'avaliacao inexistente ou fora do escopo'
      using errcode = 'insufficient_privilege';
  end if;

  return app.reserve_evidence_upload_legacy(p_evaluation_id, p_theme_id, p_input);
end $$;

revoke all on function app.reserve_evidence_upload_legacy(uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Grants — reafirmados para que o arquivo se leia sozinho
-- ---------------------------------------------------------------------------
-- `create or replace function` preserva o ACL; dizer aqui é defensivo e
-- idempotente, e é o padrão que 0027, 0030, 0034 e 0045 já seguem.
revoke all on function public.submit_evaluation(uuid)                    from public, anon;
revoke all on function public.remove_evidence(uuid, uuid)                from public, anon;
revoke all on function public.reserve_evidence_upload(uuid, text, jsonb) from public, anon;

grant execute on function public.submit_evaluation(uuid)                    to authenticated;
grant execute on function public.remove_evidence(uuid, uuid)                to authenticated;
grant execute on function public.reserve_evidence_upload(uuid, text, jsonb) to authenticated;

comment on function public.submit_evaluation(uuid) is
  'Wrapper legado. Escopo antes de modelo; recusa uniforme para inexistente e fora do escopo (0046, O-18).';
comment on function public.remove_evidence(uuid, uuid) is
  'Wrapper legado. Ator, trava e escopo antes de delegar a app.remove_evidence_legacy (0046, O-18).';
comment on function public.reserve_evidence_upload(uuid, text, jsonb) is
  'Wrapper legado. Escopo antes de delegar a app.reserve_evidence_upload_legacy (0046, O-18).';
