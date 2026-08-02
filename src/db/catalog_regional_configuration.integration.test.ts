/**
 * Indicadores com escopo e CONFIGURAÇÃO REGIONAL (migration 0037), em banco REAL
 * (PGlite/PG18).
 *
 * A PERGUNTA QUE ESTE ARQUIVO RESPONDE. A decisão A-08 promete três coisas:
 * o indicador global mantém uma identidade só, cada região o opera do seu jeito,
 * e nenhuma região alcança a outra. Nada disso vale se estiver só na interface.
 * Aqui as três são exercidas contra o banco, sob RLS, com o JWT de cada perfil.
 *
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

interface CatalogVersionDto {
  id: string;
  versionNumber: number;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  status: 'draft' | 'published';
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface CatalogIndicatorDto {
  id: string;
  code: string;
  name: string;
  scopeKind: 'global' | 'regional';
  regionId: string | null;
  lifecycle: string;
  versions: CatalogVersionDto[];
}

interface ConfigVersionDto {
  id: string;
  versionNumber: number;
  indicatorVersionId: string;
  themeVersionId: string;
  sortOrder: number;
  target: string;
  tolerance: string;
  weight: string;
  active: boolean;
  includeInAssistedManagement: boolean;
  includeInMonthlyAudit: boolean;
  status: 'draft' | 'published';
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface ConfigDto {
  id: string;
  regionId: string;
  indicatorDefinitionId: string;
  indicatorCode: string;
  versions: ConfigVersionDto[];
}

const rpc = async <T>(db: TestDb, userId: string, sql: string, params: unknown[]): Promise<T> => {
  const rows = await db.asUser(userId, (tx) => tx.query<{ dto: T }>(sql, params));
  return rows[0].dto;
};

const criarIndicador = (
  db: TestDb, userId: string, scope: 'global' | 'regional',
  regionId: string | null, code: string, payload: Record<string, unknown>,
) => rpc<CatalogIndicatorDto>(db, userId,
  `select public.catalog_create_indicator($1,$2,$3,$4::jsonb) as dto`,
  [scope, regionId, code, JSON.stringify(payload)]);

const publicarIndicador = (db: TestDb, userId: string, versionId: string) =>
  rpc<CatalogIndicatorDto>(db, userId,
    `select public.catalog_publish_indicator_version($1) as dto`, [versionId]);

const criarTemaPublicado = async (
  db: TestDb, userId: string, scope: 'global' | 'regional',
  regionId: string | null, code: string,
): Promise<string> => {
  const tema = await rpc<{ versions: { id: string }[] }>(db, userId,
    `select public.catalog_create_theme($1,$2,$3,$4::jsonb) as dto`,
    [scope, regionId, code, JSON.stringify({ name: `Tema ${code}` })]);
  await db.asUser(userId, (tx) =>
    tx.query(`select public.catalog_publish_theme_version($1)`, [tema.versions[0].id]));
  return tema.versions[0].id;
};

const salvarRascunho = (
  db: TestDb, userId: string, regionId: string, indicatorId: string, payload: Record<string, unknown>,
) => rpc<ConfigDto>(db, userId,
  `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as dto`,
  [regionId, indicatorId, JSON.stringify(payload)]);

const publicarConfig = (db: TestDb, userId: string, versionId: string) =>
  rpc<ConfigDto>(db, userId,
    `select public.catalog_publish_regional_config_version($1) as dto`, [versionId]);

/** Última versão da configuração — a que acabou de ser gravada. */
const ultima = (c: ConfigDto) => c.versions[c.versions.length - 1];

describe('escopo do indicador', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('ADMIN cria indicador GLOBAL; a versão 1 nasce em rascunho e carrega a semântica', async () => {
    const dto = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-G01', {
      name: 'Conversão', description: 'Percentual de conversão', unit: '%', direction: 'higher_better',
    });
    expect(dto.scopeKind).toBe('global');
    expect(dto.regionId).toBeNull();
    expect(dto.lifecycle).toBe('draft');
    expect(dto.versions[0].status).toBe('draft');
    expect(dto.versions[0].name).toBe('Conversão');
    expect(dto.versions[0].description).toBe('Percentual de conversão');
    expect(dto.versions[0].direction).toBe('higher_better');
  });

  it('REGIONAL cria indicador da própria região, mas nunca global nem de outra região', async () => {
    const meu = await criarIndicador(db, ID.uReg, 'regional', ID.region, 'IND-R1-01', { name: 'Local da R1' });
    expect(meu.regionId).toBe(ID.region);

    await db.asUser(ID.uReg, async (tx) => {
      expect((await tx.expectError(`select public.catalog_create_indicator($1,$2,$3,$4::jsonb)`,
        ['global', null, 'IND-X1', JSON.stringify({ name: 'x' })])).message).toMatch(/sem permissao/i);
      expect((await tx.expectError(`select public.catalog_create_indicator($1,$2,$3,$4::jsonb)`,
        ['regional', ID2.region2, 'IND-X2', JSON.stringify({ name: 'x' })])).message).toMatch(/sem permissao/i);
    });
  });

  it('REGIONAL não versiona indicador GLOBAL — a semântica é do ADMIN', async () => {
    const global = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-G02', { name: 'Global' });
    await db.asUser(ID.uReg, async (tx) => {
      expect((await tx.expectError(`select public.catalog_add_indicator_version($1,$2::jsonb)`,
        [global.id, JSON.stringify({ name: 'renomeado pela regiao' })])).message)
        .toMatch(/inexistente ou fora do escopo/i);
      expect((await tx.expectError(`select public.catalog_set_indicator_lifecycle($1,$2)`,
        [global.id, 'inactive'])).message).toMatch(/inexistente ou fora do escopo/i);
    });
  });

  it('REGIONAL publica nova versão de nome, descrição, unidade e direção do indicador da PRÓPRIA região', async () => {
    const meu = await criarIndicador(db, ID.uReg, 'regional', ID.region, 'IND-R1-02', {
      name: 'v1', unit: '%', direction: 'higher_better',
    });
    const comV2 = await rpc<CatalogIndicatorDto>(db, ID.uReg,
      `select public.catalog_add_indicator_version($1,$2::jsonb) as dto`,
      [meu.id, JSON.stringify({ name: 'v2', description: 'nova descricao', unit: 'un', direction: 'lower_better' })]);

    const v2 = comV2.versions.find((v) => v.versionNumber === 2)!;
    expect(v2.name).toBe('v2');
    expect(v2.unit).toBe('un');
    expect(v2.direction).toBe('lower_better');
    expect(v2.status).toBe('draft');
    // v1 intacta: nenhuma edição alcança o passado.
    expect(comV2.versions.find((v) => v.versionNumber === 1)!.name).toBe('v1');
  });

  it('COORDENADOR e GC não criam indicador', async () => {
    for (const uid of [ID.uCoord1, ID.uGcA]) {
      const erro = await db.asUser(uid, (tx) =>
        tx.expectError(`select public.catalog_create_indicator($1,$2,$3,$4::jsonb)`,
          ['regional', ID.region, 'IND-NAO', JSON.stringify({ name: 'x' })]));
      expect(erro.message).toMatch(/sem permissao/i);
    }
  });

  it('indicador regional não é visível para outra região', async () => {
    const daR2 = await criarIndicador(db, ID2.uReg2, 'regional', ID2.region2, 'IND-R2-99', { name: 'Da R2' });
    const visiveis = await db.asUser(ID.uReg, (tx) =>
      tx.query<{ id: string }>(`select id from public.indicator_definitions`));
    expect(visiveis.map((r) => r.id)).not.toContain(daR2.id);
  });

  it('o catálogo legado permanece GLOBAL, sem região e sem configuração automática', async () => {
    const rows = await db.query<{ scope_kind: string; region_id: string | null; cfgs: number }>(
      `select d.scope_kind, d.region_id,
              (select count(*)::int from public.indicator_regional_configs c
                where c.indicator_definition_id = d.id) as cfgs
         from public.indicator_definitions d where d.id = $1`, [ID.indDef]);
    expect(rows[0].scope_kind).toBe('global');
    expect(rows[0].region_id).toBeNull();
    expect(rows[0].cfgs).toBe(0);          // decisão D-G: existir não é operar
  });
});

describe('configuração operacional regional: mesma definição, operações independentes', () => {
  let db: TestDb;
  let indicadorGlobal = '';
  let versaoGlobal = '';
  let temaGlobal = '';
  let temaR1 = '';
  let temaR2 = '';

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);

    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-COMPART', {
      name: 'Compartilhado', unit: '%', direction: 'higher_better',
    });
    indicadorGlobal = ind.id;
    versaoGlobal = ind.versions[0].id;
    await publicarIndicador(db, ID.uAdmin, versaoGlobal);

    temaGlobal = await criarTemaPublicado(db, ID.uAdmin, 'global', null, 'TEMA-COMUM');
    temaR1 = await criarTemaPublicado(db, ID.uReg, 'regional', ID.region, 'TEMA-SO-R1');
    temaR2 = await criarTemaPublicado(db, ID2.uReg2, 'regional', ID2.region2, 'TEMA-SO-R2');
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('duas regiões adotam o MESMO indicador global com metas diferentes', async () => {
    const naR1 = await salvarRascunho(db, ID.uReg, ID.region, indicadorGlobal, {
      indicatorVersionId: versaoGlobal, themeVersionId: temaR1, target: 90, tolerance: 5, weight: 30, sortOrder: 1,
    });
    const naR2 = await salvarRascunho(db, ID2.uReg2, ID2.region2, indicadorGlobal, {
      indicatorVersionId: versaoGlobal, themeVersionId: temaGlobal, target: 75, tolerance: 10, weight: 20, sortOrder: 4,
    });

    await publicarConfig(db, ID.uReg, ultima(naR1).id);
    await publicarConfig(db, ID2.uReg2, ultima(naR2).id);

    expect(naR1.id).not.toBe(naR2.id);
    expect(Number(ultima(naR1).target)).toBe(90);
    expect(Number(ultima(naR2).target)).toBe(75);
    expect(ultima(naR1).themeVersionId).toBe(temaR1);      // tema regional próprio
    expect(ultima(naR2).themeVersionId).toBe(temaGlobal);  // tema global
  });

  it('mudar a meta da R1 NÃO altera a configuração publicada da R2', async () => {
    const antesR2 = await db.query<{ target: string }>(
      `select v.target from public.indicator_regional_config_versions v
         join public.indicator_regional_configs c on c.id = v.config_id
        where c.region_id = $1 and v.status = 'published'`, [ID2.region2]);

    const nova = await salvarRascunho(db, ID.uReg, ID.region, indicadorGlobal, {
      indicatorVersionId: versaoGlobal, themeVersionId: temaR1, target: 95,
      effectiveFrom: '2099-02-01',
    });
    await publicarConfig(db, ID.uReg, ultima(nova).id);

    const depoisR2 = await db.query<{ target: string }>(
      `select v.target from public.indicator_regional_config_versions v
         join public.indicator_regional_configs c on c.id = v.config_id
        where c.region_id = $1 and v.status = 'published'`, [ID2.region2]);
    expect(depoisR2).toEqual(antesR2);
  });

  it('a versão anterior da R1 é preservada e tem a vigência encerrada', async () => {
    const versoes = await db.query<{ version_number: number; target: string; effective_to: string | null }>(
      `select v.version_number, v.target, v.effective_to
         from public.indicator_regional_config_versions v
         join public.indicator_regional_configs c on c.id = v.config_id
        where c.region_id = $1 and c.indicator_definition_id = $2
        order by v.version_number`, [ID.region, indicadorGlobal]);
    expect(versoes).toHaveLength(2);
    expect(Number(versoes[0].target)).toBe(90);       // o passado continua 90
    expect(versoes[0].effective_to).not.toBeNull();
    expect(versoes[1].effective_to).toBeNull();
  });

  it('a adoção é uma só por região: reabrir não cria uma segunda configuração', async () => {
    const linhas = await db.query<{ n: number }>(
      `select count(*)::int n from public.indicator_regional_configs
        where region_id = $1 and indicator_definition_id = $2`, [ID.region, indicadorGlobal]);
    expect(linhas[0].n).toBe(1);
  });

  it('DEFAULTS empresariais: Gestão Assistida sim, Auditoria Mensal não', async () => {
    const cfg = await salvarRascunho(db, ID.uReg, ID.region, indicadorGlobal, {
      indicatorVersionId: versaoGlobal, themeVersionId: temaR1, target: 50, effectiveFrom: '2099-09-01',
    });
    const v = ultima(cfg);
    expect(v.includeInAssistedManagement).toBe(true);
    expect(v.includeInMonthlyAudit).toBe(false);
    expect(v.active).toBe(true);
    expect(v.status).toBe('draft');
  });

  it('RECUSA usar tema regional de OUTRA região', async () => {
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_save_regional_config_draft($1,$2,$3::jsonb)`,
        [ID.region, indicadorGlobal, JSON.stringify({
          indicatorVersionId: versaoGlobal, themeVersionId: temaR2, target: 10, effectiveFrom: '2099-10-01',
        })]));
    expect(erro.message).toMatch(/tema regional de outra regiao/i);
  });

  it('RECUSA configurar indicador regional de OUTRA região', async () => {
    const daR2 = await criarIndicador(db, ID2.uReg2, 'regional', ID2.region2, 'IND-SO-R2', { name: 'Da R2' });
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_save_regional_config_draft($1,$2,$3::jsonb)`,
        [ID.region, daR2.id, JSON.stringify({
          indicatorVersionId: daR2.versions[0].id, themeVersionId: temaR1, target: 1,
        })]));
    expect(erro.message).toMatch(/inexistente ou fora do escopo/i);
  });

  it('REGIONAL não configura a região do vizinho', async () => {
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_save_regional_config_draft($1,$2,$3::jsonb)`,
        [ID2.region2, indicadorGlobal, JSON.stringify({
          indicatorVersionId: versaoGlobal, themeVersionId: temaGlobal, target: 1,
        })]));
    expect(erro.message).toMatch(/sem permissao/i);
  });

  it('RECUSA versão de indicador que não é do indicador configurado', async () => {
    const outro = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-OUTRO-V', { name: 'Outro' });
    await publicarIndicador(db, ID.uAdmin, outro.versions[0].id);
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_save_regional_config_draft($1,$2,$3::jsonb)`,
        [ID.region, indicadorGlobal, JSON.stringify({
          indicatorVersionId: outro.versions[0].id, themeVersionId: temaR1, target: 1,
        })]));
    expect(erro.message).toMatch(/nao pertence ao indicador configurado/i);
  });

  it('RECUSA publicar apoiado em versão de indicador AINDA NÃO publicada', async () => {
    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-RASCUNHO', { name: 'Rascunho' });
    const cfg = await salvarRascunho(db, ID.uReg, ID.region, ind.id, {
      indicatorVersionId: ind.versions[0].id, themeVersionId: temaR1, target: 10,
    });
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_publish_regional_config_version($1)`, [ultima(cfg).id]));
    expect(erro.message).toMatch(/versao de indicador nao publicada/i);
  });

  it('RECUSA publicar em tema ainda não publicado', async () => {
    const tema = await rpc<{ versions: { id: string }[] }>(db, ID.uReg,
      `select public.catalog_create_theme($1,$2,$3,$4::jsonb) as dto`,
      ['regional', ID.region, 'TEMA-NAO-PUB', JSON.stringify({ name: 'Ainda rascunho' })]);
    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-TEMA-RASC', { name: 'x' });
    await publicarIndicador(db, ID.uAdmin, ind.versions[0].id);

    const cfg = await salvarRascunho(db, ID.uReg, ID.region, ind.id, {
      indicatorVersionId: ind.versions[0].id, themeVersionId: tema.versions[0].id, target: 10,
    });
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_publish_regional_config_version($1)`, [ultima(cfg).id]));
    expect(erro.message).toMatch(/versao de tema nao publicada/i);
  });

  it('publicação de configuração é IDEMPOTENTE', async () => {
    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-IDEMP-CFG', { name: 'x' });
    await publicarIndicador(db, ID.uAdmin, ind.versions[0].id);
    const cfg = await salvarRascunho(db, ID.uReg, ID.region, ind.id, {
      indicatorVersionId: ind.versions[0].id, themeVersionId: temaR1, target: 7,
    });
    const um = await publicarConfig(db, ID.uReg, ultima(cfg).id);
    const dois = await publicarConfig(db, ID.uReg, ultima(cfg).id);
    expect(dois.versions).toEqual(um.versions);
    expect(dois.versions).toHaveLength(1);
  });

  it('o gatilho RECUSA sobreposição de vigência entre configurações publicadas', async () => {
    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-SOBREP-CFG', { name: 'x' });
    await publicarIndicador(db, ID.uAdmin, ind.versions[0].id);
    const cfg = await salvarRascunho(db, ID.uReg, ID.region, ind.id, {
      indicatorVersionId: ind.versions[0].id, themeVersionId: temaR1, target: 7,
    });
    await publicarConfig(db, ID.uReg, ultima(cfg).id);

    const erro = await (async () => {
      try {
        await db.exec(`
          insert into public.indicator_regional_config_versions
            (config_id, version_number, indicator_version_id, theme_version_id, target, status, effective_from)
          values ('${cfg.id}', 99, '${ind.versions[0].id}', '${temaR1}', 1, 'published', now() + interval '1 day');
        `);
        return null;
      } catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/vigencia sobreposta/i);
  });

  it('configuração publicada não é excluída — nem pelo superusuário', async () => {
    const erro = await (async () => {
      try {
        await db.exec(`delete from public.indicator_regional_configs
                        where region_id = '${ID.region}' and indicator_definition_id = '${indicadorGlobal}'`);
        return null;
      } catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/ja publicada/i);
  });

  it('indicador adotado por uma região não pode ser excluído pelo ADMIN', async () => {
    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.admin_delete_indicator($1)`, [indicadorGlobal]));
    expect(erro.message).toMatch(/configurado por alguma regiao/i);
  });

  it('tema em uso por configuração não pode ser excluído', async () => {
    const erro = await (async () => {
      try {
        await db.exec(`delete from public.themes where code = 'TEMA-SO-R1'`);
        return null;
      } catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/inative em vez de excluir/i);
  });
});

describe('target_band: bloqueado enquanto A-01 não for decidida', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('RECUSA publicar configuração de Gestão Assistida sobre indicador target_band', async () => {
    const tema = await criarTemaPublicado(db, ID.uAdmin, 'global', null, 'TEMA-BAND');
    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-BAND', {
      name: 'Faixa', unit: '%', direction: 'target_band',
    });
    await publicarIndicador(db, ID.uAdmin, ind.versions[0].id);

    const cfg = await salvarRascunho(db, ID.uReg, ID.region, ind.id, {
      indicatorVersionId: ind.versions[0].id, themeVersionId: tema, target: 50,
      includeInAssistedManagement: true,
    });

    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_publish_regional_config_version($1)`, [ultima(cfg).id]));
    expect(erro.message).toMatch(/target_band/i);
    expect(erro.message).toMatch(/A-01/);
    // Não converteu nem calculou nada: a versão continua em rascunho.
    const st = await db.query<{ status: string }>(
      `select status from public.indicator_regional_config_versions where id = $1`, [ultima(cfg).id]);
    expect(st[0].status).toBe('draft');
  });

  it('o valor target_band CONTINUA existindo no enum — nada histórico é tocado', async () => {
    const rows = await db.query<{ v: string }>(
      `select unnest(enum_range(null::app.indicator_direction))::text as v`);
    expect(rows.map((r) => r.v)).toContain('target_band');
  });

  it('target_band FORA da Gestão Assistida é publicável — a restrição é do módulo, não do dado', async () => {
    const tema = await criarTemaPublicado(db, ID.uAdmin, 'global', null, 'TEMA-BAND-2');
    const ind = await criarIndicador(db, ID.uAdmin, 'global', null, 'IND-BAND-2', {
      name: 'Faixa 2', direction: 'target_band',
    });
    await publicarIndicador(db, ID.uAdmin, ind.versions[0].id);

    const cfg = await salvarRascunho(db, ID.uReg, ID.region, ind.id, {
      indicatorVersionId: ind.versions[0].id, themeVersionId: tema, target: 50,
      includeInAssistedManagement: false,
    });
    const publicado = await publicarConfig(db, ID.uReg, ultima(cfg).id);
    expect(ultima(publicado).status).toBe('published');
  });
});

describe('superfície nova fechada para anon e para escrita direta', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 60_000);
  afterAll(async () => { await db.close(); });

  it('anon não lê as tabelas novas nem executa as RPCs novas', async () => {
    await db.asAnon(async (tx) => {
      for (const t of ['indicator_regional_configs', 'indicator_regional_config_versions']) {
        expect((await tx.expectError(`select * from public.${t}`)).message).toMatch(/permission denied/i);
      }
      for (const fn of [
        `public.catalog_create_indicator('global', null, 'X', '{}'::jsonb)`,
        `public.catalog_save_regional_config_draft(null, null, '{}'::jsonb)`,
        `public.catalog_publish_regional_config_version(null)`,
      ]) {
        expect((await tx.expectError(`select ${fn}`)).message).toMatch(/permission denied/i);
      }
    });
  });

  it('autenticado não escreve direto na configuração regional', async () => {
    await db.asUser(ID.uAdmin, async (tx) => {
      const erro = await tx.expectError(
        `insert into public.indicator_regional_configs (region_id, indicator_definition_id)
         values ($1, $2)`, [ID.region, ID.indDef]);
      expect(erro.message).toMatch(/permission denied/i);
    });
  });

  it('as funções internas de DTO não são executáveis por ninguém de fora', async () => {
    await db.asUser(ID.uAdmin, async (tx) => {
      for (const fn of ['app.catalog_indicator_dto', 'app.regional_config_dto', 'app.theme_dto']) {
        expect((await tx.expectError(`select ${fn}($1)`, [ID.indDef])).message)
          .toMatch(/permission denied/i);
      }
    });
  });
});
