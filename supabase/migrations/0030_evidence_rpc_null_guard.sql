-- =============================================================================
-- AAPEX 1.3.1 — Migration 0030: guarda contra ator nulo nas RPCs de evidência
-- =============================================================================
-- DEFEITO ENCONTRADO NO SMOKE AUTENTICADO (D-03, complementação visual).
-- Chamado sem sessão, apenas com a chave `anon` pública, `evidence_path`
-- respondeu HTTP 200 e DEVOLVEU o caminho interno do objeto:
--
--   POST /rest/v1/rpc/evidence_path  →  200
--   "T01/b85309dc-…-comprovacao-visual.png"
--
-- CAUSA. Lógica de três valores. A guarda era:
--
--   if not (v_author = auth.uid() or app.is_admin() or exists (…)) then raise …
--
-- Sem sessão, `auth.uid()` é NULL, então `v_author = auth.uid()` não é FALSE:
-- é NULL. `NULL or false or false` continua NULL, `not NULL` é NULL, e um
-- `if NULL then` simplesmente NÃO entra — o `raise` nunca acontecia e a função
-- seguia até o `return`. A guarda parecia correta na leitura e não valia nada
-- exatamente para quem não está autenticado.
--
-- `remove_evidence_file` tinha a MESMA forma, e é pior: ela apaga o vínculo e o
-- metadata, como `security definer` (portanto sem passar por RLS). O mesmo
-- descuido permitiria a um chamador anônimo remover a comprovação de uma
-- avaliação, sabendo apenas o UUID.
--
-- CORREÇÃO, em duas camadas independentes:
--   1. `auth.uid() is null` recusa logo de saída, e a decisão de escopo passa a
--      ser fechada com `coalesce(…, false)`, para que NULL nunca mais seja lido
--      como "pode".
--   2. EXECUTE volta a ser só de `authenticated`. As duas funções estavam com o
--      padrão do PostgreSQL (EXECUTE para PUBLIC, portanto para `anon`), que as
--      migrations anteriores nunca revogaram.
--
-- Nenhuma regra de escopo muda: quem já podia ler continua lendo exatamente o
-- mesmo. O que muda é que "sem sessão" passa a ser NÃO.
-- =============================================================================

create or replace function public.evidence_path(p_evidence_id uuid) returns text
  language plpgsql security definer set search_path = public, app as $$
declare v_path text; v_author uuid; v_src uuid; v_uid uuid;
begin
  v_uid := auth.uid();
  -- Sem sessão não há escopo possível: recusa antes de qualquer leitura.
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select path, author_user_id, source_object_id into v_path, v_author, v_src
    from public.evidence_files where id = p_evidence_id;
  if v_path is null then raise exception 'evidencia inexistente'; end if;

  -- `coalesce` fecha a lógica de três valores: ausência de resposta é NÃO.
  if not coalesce(
       v_author = v_uid
       or app.is_admin()
       or exists (select 1 from public.evaluations e
                   where e.id = v_src and app.has_operation_access(e.operation_id)),
       false) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;
  return v_path;
end $$;

create or replace function public.remove_evidence_file(p_evidence_id uuid) returns void
  language plpgsql security definer set search_path = public, app as $$
declare v_author uuid; v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'autenticacao obrigatoria' using errcode = 'insufficient_privilege';
  end if;

  select author_user_id into v_author from public.evidence_files where id = p_evidence_id;
  if v_author is null then raise exception 'evidencia inexistente'; end if;
  if not coalesce(v_author = v_uid or app.is_admin(), false) then
    raise exception 'sem permissao' using errcode = 'insufficient_privilege';
  end if;

  delete from public.evaluation_answer_evidence where evidence_id = p_evidence_id;
  delete from public.evidence_files where id = p_evidence_id;
end $$;

-- Segunda camada: sem EXECUTE, a chamada anônima nem chega ao corpo da função.
revoke all on function public.evidence_path(uuid) from public, anon;
revoke all on function public.remove_evidence_file(uuid) from public, anon;
grant execute on function public.evidence_path(uuid) to authenticated;
grant execute on function public.remove_evidence_file(uuid) to authenticated;
