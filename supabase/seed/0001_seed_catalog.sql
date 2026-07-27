-- =============================================================================
-- AAPEX / AACE V2.0 — SEED de catálogo (revisável)
-- Masterplan §3.3 (pressuposto 2), §7.4/§7.5, §9.4.
-- =============================================================================
-- ATENÇÃO: conteúdo SEED, não dado real de produção. Os 24 temas e 12
-- indicadores aguardam validação de negócio (decisão P05). Este arquivo é
-- idempotente (on conflict do nothing) e roda apenas em dev/homologação.
-- Produção não usa este seed sem revisão aprovada.
-- =============================================================================

-- Estrutura organizacional mínima (piloto)
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Claro Empresas')
  on conflict (id) do nothing;

insert into public.regions (id, organization_id, name) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'PR/SC')
  on conflict (id) do nothing;

insert into public.units (id, region_id, name, timezone) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Unidade Piloto', 'America/Sao_Paulo')
  on conflict (id) do nothing;

insert into public.visit_rules (unit_id, weekly_visit_weekday, monthly_audit_week_ordinal, monthly_audit_weekday, tolerance_days)
  values ('00000000-0000-0000-0000-0000000000c1', 2, 1, 1, 2)
  on conflict (unit_id) do nothing;

-- Template de auditoria e versão 1
insert into public.audit_templates (id, code, title) values
  ('00000000-0000-0000-0000-0000000000d1', 'AACE-CHECKLIST', 'Checklist AACE de Excelência')
  on conflict (code) do nothing;

insert into public.audit_template_versions (id, template_id, version_number, effective_from, locked) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 1, now(), false)
  on conflict (template_id, version_number) do nothing;

-- 24 temas (seed) como itens da versão 1
insert into public.audit_items (template_version_id, code, title, pillar, weight, frequency, required, evidence_required) values
  ('00000000-0000-0000-0000-0000000000d2','T01','Domínio de portfólio','Resultado e portfólio',5,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T02','Venda de Soluções Digitais','Resultado e portfólio',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T03','Venda de soluções avançadas','Resultado e portfólio',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T04','Capilaridade de novos parceiros','Expansão e capilaridade',4,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T05','BCC','Execução comercial',4,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T06','Convergência','Resultado e portfólio',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T07','Churn','Qualidade e retenção',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T08','Percentual de quebra','Qualidade e retenção',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T09','Vendedores','Pessoas e liderança',4,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T10','Delta Ticket','Rentabilidade',4,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T11','Renovação','Qualidade e retenção',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T12','Aparelhos','Resultado e portfólio',3,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T13','Líderes do AACE','Pessoas e liderança',4,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T14','Projeto Rentabilização','Rentabilidade',4,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T15','Projeto Samurai','Projetos estratégicos',5,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T16','One-on-One','Pessoas e liderança',3,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T17','Gestão de prospecção','Execução comercial',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T18','Venda de avançadas — rotina','Execução comercial',4,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T19','Venda de SD — rotina','Execução comercial',4,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T20','Carteira Prospect','Execução comercial',4,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T21','TV','Resultado e portfólio',3,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T22','Gestão de funil','Execução comercial',5,'weekly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T23','Domínio de portfólio — coaching','Pessoas e liderança',3,'monthly',true,true),
  ('00000000-0000-0000-0000-0000000000d2','T24','Visão das agendas Teams','Governança',3,'weekly',true,true)
  on conflict (template_version_id, code) do nothing;

-- 12 indicadores (seed) — definição + versão 1 ativa
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

insert into public.indicator_versions (definition_id, version_number, unit, direction, target, yellow_tolerance, weight) values
  ('00000000-0000-0000-0000-0000000000e1',1,'%','higher_better',30,10,5),
  ('00000000-0000-0000-0000-0000000000e2',1,'%','higher_better',85,10,4),
  ('00000000-0000-0000-0000-0000000000e3',1,'%','higher_better',25,15,5),
  ('00000000-0000-0000-0000-0000000000e4',1,'%','higher_better',100,15,5),
  ('00000000-0000-0000-0000-0000000000e5',1,'%','higher_better',35,10,5),
  ('00000000-0000-0000-0000-0000000000e6',1,'%','lower_better',1,20,5),
  ('00000000-0000-0000-0000-0000000000e7',1,'%','lower_better',10,15,5),
  ('00000000-0000-0000-0000-0000000000e8',1,'R$','higher_better',0,10,4),
  ('00000000-0000-0000-0000-0000000000e9',1,'%','higher_better',82,8,5),
  ('00000000-0000-0000-0000-0000000000ea',1,'%','higher_better',100,15,3),
  ('00000000-0000-0000-0000-0000000000eb',1,'%','higher_better',90,10,5),
  ('00000000-0000-0000-0000-0000000000ec',1,'x','higher_better',3,15,5)
  on conflict (definition_id, version_number) do nothing;
