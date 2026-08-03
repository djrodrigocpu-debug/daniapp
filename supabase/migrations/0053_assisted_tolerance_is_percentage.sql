-- ---------------------------------------------------------------------------
-- AAPEX 1.3.5 — Migration 0053: a tolerância amarela é PORCENTAGEM DA META
-- ---------------------------------------------------------------------------
-- CORREÇÃO DE DEFEITO. A 0039 escreveu `app.assisted_status_of` tratando
-- `tolerance` como diferença ABSOLUTA:
--
--     higher_better:  atencao  quando  actual >= target - tol
--     lower_better:   atencao  quando  actual <= target + tol
--
-- Está errado, e o produto nunca disse outra coisa:
--
--   * `src/domain/indicators/indicatorStatus.ts`, ANTERIOR à 1.3.5, já usava
--     `target * (1 ± tolerance/100)`;
--   * `yellowLimitPreview` mostra a faixa por porcentagem no cadastro;
--   * o formulário do Administrador afirma, em texto visível: "A tolerância
--     amarela é uma porcentagem aplicada sobre a meta, não uma diferença
--     absoluta."
--
-- Ou seja: a Gestão Assistida da 1.3.5 divergiu de uma regra já estabelecida.
-- Esta migration alinha o servidor ao que o produto sempre definiu.
--
-- O TAMANHO DO DESVIO, com o catálogo real de produção:
--
--   IND-001 BL na Renovação  meta 30, tol 10  ->  amarelo a partir de 27
--                                                 (o defeito aceitava até 20)
--   IND-006 Churn            meta  1, tol 20  ->  amarelo até 1,2
--                                                 (o defeito aceitava até 21)
--
-- No Churn o defeito classificaria 15% como "atenção" em vez de "não conforme".
--
-- ---------------------------------------------------------------------------
-- NENHUM HISTÓRICO PRECISA SER RECALCULADO
-- ---------------------------------------------------------------------------
-- Medido em produção antes desta migration: `assisted_cycles` = 0 e
-- `assisted_cycle_entries` = 0. Nenhum ciclo foi aberto, logo nenhuma entrada
-- teve status materializado pela regra defeituosa, e nenhum fechamento gravou
-- `assisted-status/1.3.5-a`.
--
-- Se algum dia existir ciclo FECHADO com a versão antiga, ele NÃO deve ser
-- recalculado: o fechamento materializa a regra de propósito (D2). O que muda
-- é a regra dali para a frente, e a versão abaixo é o que permite distinguir
-- os dois períodos.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. A regra, corrigida
-- ---------------------------------------------------------------------------
create or replace function app.assisted_status_of(
  p_direction app.indicator_direction,
  p_target    numeric,
  p_tolerance numeric,
  p_actual    numeric
) returns app.assisted_status
  language plpgsql immutable as $$
declare
  v_tol    numeric := abs(coalesce(p_tolerance, 0));
  v_limite numeric;
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

  -- A tolerância é PORCENTAGEM DA META. Com meta zero o limite coincide com a
  -- meta, e a faixa amarela desaparece — que é o comportamento correto: não há
  -- percentual de zero.
  if p_direction = 'higher_better' then
    if p_actual >= p_target then return 'conforme'; end if;
    v_limite := p_target * (1 - v_tol / 100);
    return case when p_actual >= v_limite then 'atencao' else 'nao_conforme' end;
  end if;

  -- lower_better
  if p_actual <= p_target then return 'conforme'; end if;
  v_limite := p_target * (1 + v_tol / 100);
  return case when p_actual <= v_limite then 'atencao' else 'nao_conforme' end;
end $$;

comment on function app.assisted_status_of(app.indicator_direction, numeric, numeric, numeric) is
  'Status da Gestao Assistida. Tolerancia e PORCENTAGEM DA META (0053), alinhada a indicatorStatus.ts e a yellowLimitPreview.';

-- ---------------------------------------------------------------------------
-- 2. A versão da regra muda — é para isso que ela existe
-- ---------------------------------------------------------------------------
-- A 0039 já dizia: "Muda quando a regra de cálculo mudar". Mudou.
create or replace function app.assisted_rule_version() returns text
  language sql immutable as $$
  select 'assisted-status/1.3.5-b'::text
$$;

comment on function app.assisted_rule_version() is
  'Identificador da regra materializada no fechamento. 1.3.5-b: tolerancia como porcentagem da meta (0053). 1.3.5-a tratava-a como valor absoluto, e era defeito.';

revoke all on function app.assisted_status_of(app.indicator_direction, numeric, numeric, numeric)
  from public, anon;
revoke all on function app.assisted_rule_version() from public, anon;
grant execute on function app.assisted_status_of(app.indicator_direction, numeric, numeric, numeric)
  to authenticated;
grant execute on function app.assisted_rule_version() to authenticated;
