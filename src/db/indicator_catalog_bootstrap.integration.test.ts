/**
 * Migration 0021 — bootstrap do catálogo de indicadores, contra Postgres REAL
 * (PGlite) com as migrations 0001..0021 aplicadas.
 *
 * Os 12 indicadores NÃO são fixture inventada: são o conteúdo canônico do
 * produto (seed 0001_seed_catalog.sql), aprovado pelo proprietário em
 * 28/07/2026 ("P05 APROVADA COMO ESTÁ") e por isso reclassificado de conteúdo
 * administrável para conteúdo CONSTITUTIVO — o que exige caminho por migration,
 * reproduzível e idêntico entre staging e produção.
 *
 * Provamos: conteúdo exato, UUIDs canônicos, idempotência, detecção de conflito
 * material, coexistência com indicadores criados pela UI de Admin, ausência de
 * qualquer efeito colateral (resultado, medição, usuário, parceiro, estrutura,
 * avaliação, plano, evidência) e que um indicador canônico já serve de ponta a
 * ponta ao `save_indicator_result` (0020).
 *
 * Identidades de operação/usuário vêm da fixture SINTÉTICA do harness (§23).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';

const MIGRATION_0021_PATH = join(
  __dirname, '..', '..', 'supabase', 'migrations', '0021_indicator_catalog_bootstrap.sql',
);
const MIGRATION_0021 = readFileSync(MIGRATION_0021_PATH, 'utf8');

/** Contrato P05 aprovado — a MESMA tabela publicada no Dossiê §14. */
const CANONICO = [
  { code: 'IND-001', name: 'BL na Renovação',      unit: '%',  direction: 'higher_better', target: 30,  tol: 10, weight: 5, id: 'e1' },
  { code: 'IND-002', name: 'Domínio de Portfólio', unit: '%',  direction: 'higher_better', target: 85,  tol: 10, weight: 4, id: 'e2' },
  { code: 'IND-003', name: 'Venda de SD',          unit: '%',  direction: 'higher_better', target: 25,  tol: 15, weight: 5, id: 'e3' },
  { code: 'IND-004', name: 'Venda de Avançadas',   unit: '%',  direction: 'higher_better', target: 100, tol: 15, weight: 5, id: 'e4' },
  { code: 'IND-005', name: 'Convergência',         unit: '%',  direction: 'higher_better', target: 35,  tol: 10, weight: 5, id: 'e5' },
  { code: 'IND-006', name: 'Churn',                unit: '%',  direction: 'lower_better',  target: 1,   tol: 20, weight: 5, id: 'e6' },
  { code: 'IND-007', name: '% Quebra',             unit: '%',  direction: 'lower_better',  target: 10,  tol: 15, weight: 5, id: 'e7' },
  { code: 'IND-008', name: 'Delta Ticket',         unit: 'R$', direction: 'higher_better', target: 0,   tol: 10, weight: 4, id: 'e8' },
  { code: 'IND-009', name: 'Renovação',            unit: '%',  direction: 'higher_better', target: 82,  tol: 8,  weight: 5, id: 'e9' },
  { code: 'IND-010', name: 'Aparelhos',            unit: '%',  direction: 'higher_better', target: 100, tol: 15, weight: 3, id: 'ea' },
  { code: 'IND-011', name: 'Gestão de Prospecção', unit: '%',  direction: 'higher_better', target: 90,  tol: 10, weight: 5, id: 'eb' },
  { code: 'IND-012', name: 'Gestão de Funil',      unit: 'x',  direction: 'higher_better', target: 3,   tol: 15, weight: 5, id: 'ec' },
];

const uuidDe = (sufixo: string) => `00000000-0000-0000-0000-0000000000${sufixo}`;
const CODIGOS = CANONICO.map((c) => `'${c.code}'`).join(',');

interface LinhaCatalogo {
  code: string; name: string; lifecycle: string; def_id: string; ver_id: string;
  unit: string; direction: string; target: number; tol: number; weight: number; versoes: number;
}

describe('bootstrap do catálogo de indicadores (0021)', () => {
  let db: TestDb;

  const catalogo = () => db.query<LinhaCatalogo>(`
    select d.code, d.name, d.lifecycle::text as lifecycle,
           d.id::text as def_id, v.id::text as ver_id,
           v.unit, v.direction::text as direction,
           v.target::float8 as target, v.yellow_tolerance::float8 as tol, v.weight::float8 as weight,
           (select count(*)::int from public.indicator_versions x where x.definition_id = d.id) as versoes
      from public.indicator_definitions d
      join public.indicator_versions v on v.definition_id = d.id and v.version_number = 1
     where d.code in (${CODIGOS})
     order by d.code`);

  const efeitosColaterais = () => db.query<{
    resultados: number; medicoes: number; usuarios: number; identidades: number;
    parceiros: number; orgs: number; regioes: number; unidades: number; coordenacoes: number;
    avaliacoes: number; respostas: number; planos: number; evidencias: number;
    visitas: number; escopos: number; onboarding: number;
  }>(`select
        (select count(*)::int from public.indicator_results)   as resultados,
        (select count(*)::int from public.measurements)        as medicoes,
        (select count(*)::int from public.users)               as usuarios,
        (select count(*)::int from auth.users)                 as identidades,
        (select count(*)::int from public.operations)          as parceiros,
        (select count(*)::int from public.organizations)       as orgs,
        (select count(*)::int from public.regions)             as regioes,
        (select count(*)::int from public.units)               as unidades,
        (select count(*)::int from public.coordinations)       as coordenacoes,
        (select count(*)::int from public.evaluations)         as avaliacoes,
        (select count(*)::int from public.evaluation_answers)  as respostas,
        (select count(*)::int from public.action_plans)        as planos,
        (select count(*)::int from public.evidence_files)      as evidencias,
        (select count(*)::int from public.visit_reports)       as visitas,
        (select count(*)::int from public.user_scopes)         as escopos,
        (select count(*)::int from app.user_password_onboarding) as onboarding
     `).then((r) => r[0]);

  beforeAll(async () => { db = await createTestDb(); }, 30_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.reset(); });

  it('cria exatamente os 12 indicadores P05, com o conteúdo aprovado', async () => {
    const linhas = await catalogo();
    expect(linhas).toHaveLength(12);
    linhas.forEach((linha, i) => {
      const esperado = CANONICO[i];
      expect(linha.code).toBe(esperado.code);
      expect(linha.name).toBe(esperado.name);
      expect(linha.lifecycle).toBe('active');
      expect(linha.unit).toBe(esperado.unit);
      expect(linha.direction).toBe(esperado.direction);
      expect(linha.target).toBe(esperado.target);
      expect(linha.tol).toBe(esperado.tol);
      expect(linha.weight).toBe(esperado.weight);
      expect(linha.versoes).toBe(1);
    });
  });

  it('usa os UUIDs determinísticos canônicos — os mesmos do seed', async () => {
    const linhas = await catalogo();
    linhas.forEach((linha, i) => {
      expect(linha.def_id).toBe(uuidDe(CANONICO[i].id));
      expect(linha.ver_id).toBe(uuidDe(CANONICO[i].id.replace(/^e/, 'f')));
    });
  });

  it('não cria resultado, medição, usuário, parceiro, estrutura, avaliação, plano nem evidência', async () => {
    const c = await efeitosColaterais();
    expect(c).toEqual({
      resultados: 0, medicoes: 0, usuarios: 0, identidades: 0, parceiros: 0,
      orgs: 0, regioes: 0, unidades: 0, coordenacoes: 0, avaliacoes: 0,
      respostas: 0, planos: 0, evidencias: 0, visitas: 0, escopos: 0, onboarding: 0,
    });
  });

  it('reexecução integral é idempotente: nada duplica', async () => {
    const antes = await catalogo();
    await db.exec(MIGRATION_0021);
    await db.exec(MIGRATION_0021);
    const depois = await catalogo();
    expect(depois).toEqual(antes);
    expect(depois).toHaveLength(12);
    const totais = await db.query<{ defs: number; vers: number }>(
      `select (select count(*)::int from public.indicator_definitions) as defs,
              (select count(*)::int from public.indicator_versions) as vers`);
    expect(totais[0]).toEqual({ defs: 12, vers: 12 });
  });

  it('rodar depois do seed canônico é no-op: as duas fontes concordam', async () => {
    await db.reset({ seed: true });
    const linhas = await catalogo();
    expect(linhas).toHaveLength(12);
    const totais = await db.query<{ defs: number; vers: number }>(
      `select (select count(*)::int from public.indicator_definitions) as defs,
              (select count(*)::int from public.indicator_versions) as vers`);
    expect(totais[0]).toEqual({ defs: 12, vers: 12 });
  });

  it('META divergente sob o mesmo código ABORTA nomeando o indicador', async () => {
    await db.exec(`update public.indicator_versions set target = 999
                    where definition_id = '${uuidDe('e6')}' and version_number = 1`);
    await expect(db.exec(MIGRATION_0021)).rejects.toThrow(/divergente.*IND-006/s);
  });

  it('DIREÇÃO divergente ABORTA — Churn não pode virar higher_better em silêncio', async () => {
    await db.exec(`update public.indicator_versions set direction = 'higher_better'
                    where definition_id = '${uuidDe('e6')}' and version_number = 1`);
    await expect(db.exec(MIGRATION_0021)).rejects.toThrow(/divergente.*IND-006/s);
  });

  it('NOME divergente da definição ABORTA', async () => {
    await db.exec(`update public.indicator_definitions set name = 'Outro Nome' where code = 'IND-003'`);
    await expect(db.exec(MIGRATION_0021)).rejects.toThrow(/divergente.*IND-003/s);
  });

  it('código canônico já criado pela UI de Admin, com conteúdo divergente, ABORTA', async () => {
    // Cenário real: alguém cadastrou IND-012 pela tela de Admin ANTES da
    // migration — outro UUID, outra meta. O `on conflict (code)` pula a
    // inserção, então a verificação escopada é a única defesa contra o catálogo
    // de produção ficar diferente do contrato P05.
    await db.exec(`
      delete from public.indicator_versions where definition_id = '${uuidDe('ec')}';
      delete from public.indicator_definitions where id = '${uuidDe('ec')}';
      insert into public.indicator_definitions (id, code, name, lifecycle)
        values ('00000000-0000-0000-0000-00000000c012','IND-012','Gestão de Funil','active');
      insert into public.indicator_versions
        (definition_id, version_number, unit, direction, target, yellow_tolerance, weight)
        values ('00000000-0000-0000-0000-00000000c012',1,'x','higher_better',99,15,5);
    `);
    await expect(db.exec(MIGRATION_0021)).rejects.toThrow(/divergente.*IND-012/s);
  });

  it('código canônico já criado pela UI de Admin, com conteúdo IDÊNTICO, é aceito sem duplicar', async () => {
    await db.exec(`
      delete from public.indicator_versions where definition_id = '${uuidDe('ec')}';
      delete from public.indicator_definitions where id = '${uuidDe('ec')}';
      insert into public.indicator_definitions (id, code, name, lifecycle)
        values ('00000000-0000-0000-0000-00000000c012','IND-012','Gestão de Funil','active');
      insert into public.indicator_versions
        (definition_id, version_number, unit, direction, target, yellow_tolerance, weight)
        values ('00000000-0000-0000-0000-00000000c012',1,'x','higher_better',3,15,5);
    `);
    await db.exec(MIGRATION_0021);
    const linhas = await catalogo();
    expect(linhas).toHaveLength(12);
    expect(linhas[11].code).toBe('IND-012');
    expect(linhas[11].versoes).toBe(1);
  });

  it('convive com indicador criado pela UI de Admin: outro código não interfere', async () => {
    await seedScenario(db); // a fixture cria IND-FIC pela mesma via da UI Admin
    await db.exec(MIGRATION_0021);
    const linhas = await catalogo();
    expect(linhas).toHaveLength(12);
    const fic = await db.query<{ n: number }>(
      `select count(*)::int n from public.indicator_definitions where code = 'IND-FIC'`);
    expect(fic[0].n).toBe(1);
  });

  it('um indicador canônico serve de ponta a ponta ao save_indicator_result (0020)', async () => {
    await seedScenario(db);
    const dto = await db.asUser(ID.uGcA, async (tx) => {
      const rows = await tx.query<{ dto: { indicatorId: string; actual: number; target: number } }>(
        `select public.save_indicator_result($1::jsonb) as dto`,
        [JSON.stringify({ operationId: ID.opA, indicatorId: uuidDe('e6'), period: '2099-07', actual: 0.5 })],
      );
      return rows[0].dto;
    });
    expect(dto.indicatorId).toBe(uuidDe('e6'));
    expect(dto.actual).toBe(0.5);
    expect(dto.target).toBe(1);       // meta ausente = meta da versão canônica de Churn
    // A medição nasceu na versão canônica, não em outra.
    const med = await db.query<{ n: number }>(
      `select count(*)::int n from public.measurements
        where indicator_version_id = '${uuidDe('f6')}' and period = '2099-07'`);
    expect(med[0].n).toBe(1);
  });

  it('o texto da migration não altera migrations anteriores nem fabrica campos inexistentes', () => {
    // As asserções são sobre o SQL EXECUTÁVEL, não sobre a prosa do cabeçalho:
    // os comentários citam `category`/`diagnosticOptions` justamente para
    // registrar que NÃO são gravados.
    const sql = MIGRATION_0021.replace(/^\s*--.*$/gm, '');
    // Aditiva: nenhum DROP/ALTER de objeto pré-existente.
    expect(sql).not.toMatch(/\bdrop\s+(table|function|view|trigger|policy|type)\b/i);
    expect(sql).not.toMatch(/\balter\s+table\b/i);
    // `category` e `diagnosticOptions` não existem no modelo corporativo.
    expect(sql).not.toMatch(/\bcategory\b/i);
    expect(sql).not.toMatch(/diagnosticOptions/i);
    // Não toca em Auth, usuários, parceiros nem cria resultado/medição.
    expect(sql).not.toMatch(/insert\s+into\s+(auth\.|public\.users|public\.operations|public\.indicator_results|public\.measurements)/i);
    // Idempotência declarada nas duas inserções.
    expect(sql.match(/on conflict/gi)?.length).toBe(2);
  });
});
