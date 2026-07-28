-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0021: bootstrap do catálogo de indicadores
-- =============================================================================
-- POR QUE: os 12 indicadores IND-001..IND-012 existiam apenas em
-- `supabase/seed/0001_seed_catalog.sql`, que roda SÓ em dev/harness e nunca em
-- ambiente remoto — a mesma lacuna que a 0019 fechou para o catálogo de
-- auditoria. O único caminho remoto era `admin_create_indicator` (0006), que
-- NÃO serve para carga constitutiva: gera UUID aleatório (os ambientes
-- divergiriam), não é idempotente (a segunda execução viola o unique de `code`)
-- e não detecta conflito de conteúdo.
--
-- FONTE DO CONTEÚDO (nada aqui foi inventado): cópia exata do seed canônico —
-- mesmos códigos, nomes, UUIDs de definição, unidade, direção, meta, tolerância
-- amarela e peso. É o conteúdo aprovado pelo proprietário em 28/07/2026
-- ("P05 APROVADA COMO ESTÁ"), que converteu os 12 indicadores de proposta sob
-- ressalva em CONTEÚDO CONSTITUTIVO de produção.
--
-- SUPERA a nota da 0019 que classificava indicadores como "conteúdo
-- administrável pela própria UI de Admin — não é catálogo constitutivo". A
-- decisão do proprietário reclassificou-os. A UI de Admin continua válida para
-- indicadores NOVOS; estes 12 passam a nascer por migration, reproduzíveis e
-- idênticos entre staging e produção.
--
-- DESENHO (seed direto, espelhando a 0019): identidade única por `code`
-- (unique em 0001); versão 1 explícita; UUIDs fixos — os de definição são os
-- MESMOS do seed, para que ambientes que já rodaram o seed colidam de forma
-- inofensiva nas mesmas chaves únicas, sem linha órfã nem duplicação.
-- `effective_from` é literal apenas por determinismo: `save_indicator_result`
-- (0020) resolve a versão vigente por `version_number desc`, não por data.
--
-- IDEMPOTÊNCIA: reexecução integral é no-op (`on conflict do nothing` nas
-- chaves únicas de 0001). CONFLITO DE CONTEÚDO: se um código canônico já
-- existir com conteúdo divergente (outro nome, outra meta, outra direção…), o
-- bloco de verificação ABORTA a migration nomeando os códigos — divergência
-- silenciosa é o único resultado proibido. A verificação é ESCOPADA aos 12
-- códigos canônicos: indicadores criados legitimamente pela UI de Admin
-- convivem sem interferir.
--
-- O QUE ESTA MIGRATION NÃO FAZ: não cria `indicator_results` nem
-- `measurements` (resultado só nasce pelo produto, via `save_indicator_result`);
-- não cria organização, região, unidade, coordenação, usuário, parceiro,
-- escopo, onboarding, avaliação, plano ou evidência; não toca em Auth; não
-- envia e-mail; não grava `category` nem `diagnosticOptions` (campos que NÃO
-- existem no modelo corporativo e não são fabricados); não inventa frequência
-- (indicador não tem esse campo no schema).
--
-- Migrations 0001–0020 não são alteradas.
-- =============================================================================

do $$
declare
  v_divergentes text;
  v_defs        int;
  v_vers        int;
begin
  -- 1) Definições — identidade lógica única pelo `code` (unique em 0001).
  --    `created_by` fica NULL: carga constitutiva não tem autor humano.
  insert into public.indicator_definitions (id, code, name, lifecycle) values
    ('00000000-0000-0000-0000-0000000000e1','IND-001','BL na Renovação','active'),
    ('00000000-0000-0000-0000-0000000000e2','IND-002','Domínio de Portfólio','active'),
    ('00000000-0000-0000-0000-0000000000e3','IND-003','Venda de SD','active'),
    ('00000000-0000-0000-0000-0000000000e4','IND-004','Venda de Avançadas','active'),
    ('00000000-0000-0000-0000-0000000000e5','IND-005','Convergência','active'),
    ('00000000-0000-0000-0000-0000000000e6','IND-006','Churn','active'),
    ('00000000-0000-0000-0000-0000000000e7','IND-007','% Quebra','active'),
    ('00000000-0000-0000-0000-0000000000e8','IND-008','Delta Ticket','active'),
    ('00000000-0000-0000-0000-0000000000e9','IND-009','Renovação','active'),
    ('00000000-0000-0000-0000-0000000000ea','IND-010','Aparelhos','active'),
    ('00000000-0000-0000-0000-0000000000eb','IND-011','Gestão de Prospecção','active'),
    ('00000000-0000-0000-0000-0000000000ec','IND-012','Gestão de Funil','active')
  on conflict (code) do nothing;

  -- 2) Versão 1 de cada definição — unique (definition_id, version_number) em
  --    0001. Unidade, direção, meta, tolerância e peso são o contrato P05.
  --
  --    A definição é resolvida por CÓDIGO, não pelo UUID canônico: se o código
  --    já existir sob OUTRO UUID (cadastrado antes pela UI de Admin), o passo 1
  --    não inseriu nada, e amarrar a versão ao UUID canônico quebraria com um
  --    erro de chave estrangeira opaco — inclusive quando o conteúdo
  --    preexistente é idêntico ao aprovado. Resolvendo por código, o caso
  --    idêntico passa e o divergente é reprovado pela verificação do passo 3,
  --    que é quem tem a mensagem correta. O UUID fixo da versão só é usado
  --    quando a definição também é a canônica — preservando o determinismo
  --    entre staging e produção no caminho normal.
  insert into public.indicator_versions
    (id, definition_id, version_number, unit, direction, target, yellow_tolerance, weight, effective_from)
  select
    case when d.id = c.def_id then c.ver_id else gen_random_uuid() end,
    d.id, 1, c.unit, c.direction::app.indicator_direction,
    c.target, c.tol, c.weight, timestamptz '2026-07-28 00:00:00+00'
  from (values
    ('IND-001','00000000-0000-0000-0000-0000000000e1'::uuid,'00000000-0000-0000-0000-0000000000f1'::uuid,'%' ,'higher_better', 30::numeric,10::numeric,5::numeric),
    ('IND-002','00000000-0000-0000-0000-0000000000e2'      ,'00000000-0000-0000-0000-0000000000f2'      ,'%' ,'higher_better', 85,10,4),
    ('IND-003','00000000-0000-0000-0000-0000000000e3'      ,'00000000-0000-0000-0000-0000000000f3'      ,'%' ,'higher_better', 25,15,5),
    ('IND-004','00000000-0000-0000-0000-0000000000e4'      ,'00000000-0000-0000-0000-0000000000f4'      ,'%' ,'higher_better',100,15,5),
    ('IND-005','00000000-0000-0000-0000-0000000000e5'      ,'00000000-0000-0000-0000-0000000000f5'      ,'%' ,'higher_better', 35,10,5),
    ('IND-006','00000000-0000-0000-0000-0000000000e6'      ,'00000000-0000-0000-0000-0000000000f6'      ,'%' ,'lower_better' ,  1,20,5),
    ('IND-007','00000000-0000-0000-0000-0000000000e7'      ,'00000000-0000-0000-0000-0000000000f7'      ,'%' ,'lower_better' , 10,15,5),
    ('IND-008','00000000-0000-0000-0000-0000000000e8'      ,'00000000-0000-0000-0000-0000000000f8'      ,'R$','higher_better',  0,10,4),
    ('IND-009','00000000-0000-0000-0000-0000000000e9'      ,'00000000-0000-0000-0000-0000000000f9'      ,'%' ,'higher_better', 82, 8,5),
    ('IND-010','00000000-0000-0000-0000-0000000000ea'      ,'00000000-0000-0000-0000-0000000000fa'      ,'%' ,'higher_better',100,15,3),
    ('IND-011','00000000-0000-0000-0000-0000000000eb'      ,'00000000-0000-0000-0000-0000000000fb'      ,'%' ,'higher_better', 90,10,5),
    ('IND-012','00000000-0000-0000-0000-0000000000ec'      ,'00000000-0000-0000-0000-0000000000fc'      ,'x' ,'higher_better',  3,15,5)
  ) as c(code, def_id, ver_id, unit, direction, target, tol, weight)
  join public.indicator_definitions d on d.code = c.code
  on conflict (definition_id, version_number) do nothing;

  -- 3) VERIFICAÇÃO DE CONTEÚDO. Os `on conflict` acima ignoram linhas já
  --    existentes; se elas divergirem do canônico, nada foi corrigido — e é
  --    exatamente isso que precisa ABORTAR aqui, nomeando os códigos.
  --    `effective_from` NÃO entra na comparação: um ambiente que já rodou o
  --    seed tem a data do seed, e isso não é divergência de conteúdo.
  select string_agg(c.code, ', ' order by c.code) into v_divergentes
  from (values
    ('IND-001','BL na Renovação'      ,'%' ,'higher_better', 30::numeric,10::numeric,5::numeric),
    ('IND-002','Domínio de Portfólio' ,'%' ,'higher_better', 85,10,4),
    ('IND-003','Venda de SD'          ,'%' ,'higher_better', 25,15,5),
    ('IND-004','Venda de Avançadas'   ,'%' ,'higher_better',100,15,5),
    ('IND-005','Convergência'         ,'%' ,'higher_better', 35,10,5),
    ('IND-006','Churn'                ,'%' ,'lower_better' ,  1,20,5),
    ('IND-007','% Quebra'             ,'%' ,'lower_better' , 10,15,5),
    ('IND-008','Delta Ticket'         ,'R$','higher_better',  0,10,4),
    ('IND-009','Renovação'            ,'%' ,'higher_better', 82, 8,5),
    ('IND-010','Aparelhos'            ,'%' ,'higher_better',100,15,3),
    ('IND-011','Gestão de Prospecção' ,'%' ,'higher_better', 90,10,5),
    ('IND-012','Gestão de Funil'      ,'x' ,'higher_better',  3,15,5)
  ) as c(code, name, unit, direction, target, tol, weight)
  where not exists (
    select 1
      from public.indicator_definitions d
      join public.indicator_versions v on v.definition_id = d.id and v.version_number = 1
     where d.code             = c.code
       and d.name             = c.name
       and d.lifecycle        = 'active'
       and v.unit             = c.unit
       and v.direction        = c.direction::app.indicator_direction
       and v.target           = c.target
       and v.yellow_tolerance = c.tol
       and v.weight           = c.weight
  );

  if v_divergentes is not null then
    raise exception 'catálogo de indicadores divergente do canônico P05 — códigos fora do contrato: %', v_divergentes
      using errcode = 'check_violation';
  end if;

  -- 4) Contagem escopada aos 12 códigos canônicos. Indicadores criados pela UI
  --    de Admin (outros códigos) são legítimos e não entram nesta conta.
  select count(*) into v_defs
    from public.indicator_definitions
   where code in ('IND-001','IND-002','IND-003','IND-004','IND-005','IND-006',
                  'IND-007','IND-008','IND-009','IND-010','IND-011','IND-012');
  if v_defs <> 12 then
    raise exception 'catálogo de indicadores divergente: esperadas 12 definições canônicas, encontradas %', v_defs
      using errcode = 'check_violation';
  end if;

  select count(*) into v_vers
    from public.indicator_versions v
    join public.indicator_definitions d on d.id = v.definition_id
   where d.code in ('IND-001','IND-002','IND-003','IND-004','IND-005','IND-006',
                    'IND-007','IND-008','IND-009','IND-010','IND-011','IND-012')
     and v.version_number = 1;
  if v_vers <> 12 then
    raise exception 'catálogo de indicadores divergente: esperadas 12 versões canônicas, encontradas %', v_vers
      using errcode = 'check_violation';
  end if;
end $$;
