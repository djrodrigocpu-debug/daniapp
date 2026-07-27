/**
 * Cenário corporativo controlado para testes de RLS/integridade (Anexo B/D).
 *
 * Estrutura (dados FICTÍCIOS, sem PII real — §23):
 *   Org O1 › Região R1 › Unidade U1
 *     ├─ Coordenadoria C1 (coordenador uCoord1)  › Operação opA (GC uGcA)
 *     └─ Coordenadoria C2 (coordenador uCoord2)  › Operação opB (GC uGcB)
 *   Papéis: uAdmin (admin), uReg (regional R1), uCoord1/uCoord2 (coordenadores),
 *           uGcA/uGcB (gerentes de canal, escopos distintos).
 *
 * Inserido como superuser (ignora RLS) para MONTAR o mundo; os testes então
 * atuam sob RLS como cada perfil e verificam isolamento positivo/negativo.
 */
import type { TestDb } from './harness';

export const ID = {
  org: '00000000-0000-0000-0000-00000000a001',
  region: '00000000-0000-0000-0000-00000000b001',
  unit: '00000000-0000-0000-0000-00000000c001',
  coord1: '00000000-0000-0000-0000-00000000d001',
  coord2: '00000000-0000-0000-0000-00000000d002',
  opA: '00000000-0000-0000-0000-00000000e001',
  opB: '00000000-0000-0000-0000-00000000e002',
  uAdmin: '00000000-0000-0000-0000-000000001001',
  uReg: '00000000-0000-0000-0000-000000001002',
  uCoord1: '00000000-0000-0000-0000-000000001003',
  uCoord2: '00000000-0000-0000-0000-000000001004',
  uGcA: '00000000-0000-0000-0000-000000001005',
  uGcB: '00000000-0000-0000-0000-000000001006',
  /** Usuário autenticado SEM user_scopes — prova que sem escopo nada é visível. */
  uNoScope: '00000000-0000-0000-0000-000000001007',
  template: '00000000-0000-0000-0000-00000000f001',
  templateV1: '00000000-0000-0000-0000-00000000f002',
  itemRed: '00000000-0000-0000-0000-00000000f003',
  indDef: '00000000-0000-0000-0000-000000009001',
  indVer: '00000000-0000-0000-0000-000000009002',
  evalA: '00000000-0000-0000-0000-00000000a0e1',
} as const;

export interface Scenario {
  id: typeof ID;
}

/** Monta o cenário completo. Idempotente por design (banco recém-criado). */
export async function seedScenario(db: TestDb): Promise<Scenario> {
  const q = ID;
  // auth.users primeiro (FK de public.users).
  await db.exec(`
    insert into auth.users (id, email) values
      ('${q.uAdmin}','admin@fic.example'),
      ('${q.uReg}','regional@fic.example'),
      ('${q.uCoord1}','coord1@fic.example'),
      ('${q.uCoord2}','coord2@fic.example'),
      ('${q.uGcA}','gca@fic.example'),
      ('${q.uGcB}','gcb@fic.example'),
      ('${q.uNoScope}','noscope@fic.example');
  `);

  await db.exec(`
    insert into public.organizations (id, name) values ('${q.org}','Org Fictícia');
    insert into public.regions (id, organization_id, name) values ('${q.region}','${q.org}','Região Fictícia');
    insert into public.units (id, region_id, name) values ('${q.unit}','${q.region}','Unidade Fictícia');

    insert into public.users (id, display_name, corporate_email, status) values
      ('${q.uAdmin}','Admin Fic','admin@fic.example','active'),
      ('${q.uReg}','Regional Fic','regional@fic.example','active'),
      ('${q.uCoord1}','Coord1 Fic','coord1@fic.example','active'),
      ('${q.uCoord2}','Coord2 Fic','coord2@fic.example','active'),
      ('${q.uGcA}','GC A Fic','gca@fic.example','active'),
      ('${q.uGcB}','GC B Fic','gcb@fic.example','active'),
      ('${q.uNoScope}','Sem Escopo Fic','noscope@fic.example','active');

    insert into public.coordinations (id, region_id, name, coordinator_user_id) values
      ('${q.coord1}','${q.region}','Coord 1','${q.uCoord1}'),
      ('${q.coord2}','${q.region}','Coord 2','${q.uCoord2}');

    insert into public.operations (id, unit_id, coordination_id, partner_name, office_name, city, state, channel_manager_user_id) values
      ('${q.opA}','${q.unit}','${q.coord1}','Parceiro A','Loja A','Curitiba','PR','${q.uGcA}'),
      ('${q.opB}','${q.unit}','${q.coord2}','Parceiro B','Loja B','Joinville','SC','${q.uGcB}');

    insert into public.operation_assignments (operation_id, user_id) values
      ('${q.opA}','${q.uGcA}'),
      ('${q.opB}','${q.uGcB}');

    insert into public.user_scopes (user_id, role, region_id, coordination_id) values
      ('${q.uAdmin}','admin', null, null),
      ('${q.uReg}','regional','${q.region}', null),
      ('${q.uCoord1}','coordinator', null,'${q.coord1}'),
      ('${q.uCoord2}','coordinator', null,'${q.coord2}'),
      ('${q.uGcA}','channel_manager', null, null),
      ('${q.uGcB}','channel_manager', null, null);
  `);

  // Template + item + indicador usado (para triggers T05/T06/T07).
  await db.exec(`
    insert into public.audit_templates (id, code, title) values ('${q.template}','TPL-FIC','Template Fic');
    insert into public.audit_template_versions (id, template_id, version_number, locked) values
      ('${q.templateV1}','${q.template}',1,false);
    insert into public.audit_items (id, template_version_id, code, title, pillar, weight, frequency, evidence_required) values
      ('${q.itemRed}','${q.templateV1}','I01','Item vermelho','Pilar',5,'weekly',true);

    insert into public.indicator_definitions (id, code, name, lifecycle) values
      ('${q.indDef}','IND-FIC','Indicador Fic','active');
    insert into public.indicator_versions (id, definition_id, version_number, unit, direction, target) values
      ('${q.indVer}','${q.indDef}',1,'%','higher_better',80);
    insert into public.measurements (operation_id, indicator_version_id, period, target_value, actual_value, created_by) values
      ('${q.opA}','${q.indVer}','2099-01',80,90,'${q.uGcA}');
  `);

  // Avaliação de opA, autorada pelo GC A, submetida (pronta p/ validação do Coord1).
  await db.exec(`
    insert into public.evaluations (id, operation_id, template_version_id, author_user_id, status, score, submitted_at) values
      ('${q.evalA}','${q.opA}','${q.templateV1}','${q.uGcA}','submitted',75, now());
  `);

  return { id: q };
}
