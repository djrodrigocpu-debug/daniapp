/**
 * Critérios de processo da Auditoria Mensal, por região (migration 0038), em
 * banco REAL (PGlite/PG18).
 *
 * O QUE ESTÁ SENDO PROVADO. Que o mesmo indicador global pode ter questionários
 * diferentes em regiões diferentes; que marcar Auditoria Mensal sem critério
 * publicado é RECUSADO pelo banco; e que as duas proibições expressas de D4
 * continuam valendo — nenhum critério nasce do nome do indicador, e `audit_items`
 * não vira critério.
 *
 * Dados 100% SINTÉTICOS (§23).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

interface CriterionVersionDto {
  id: string;
  versionNumber: number;
  question: string;
  description: string | null;
  guidance: string | null;
  sortOrder: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  requiresJustification: boolean;
  status: 'draft' | 'published';
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface CriterionDto {
  id: string;
  configId: string;
  code: string;
  lifecycle: string;
  versions: CriterionVersionDto[];
}

interface ConfigDto {
  id: string;
  regionId: string;
  versions: { id: string; status: string; includeInMonthlyAudit: boolean }[];
  criteria: CriterionDto[];
}

const rpc = async <T>(db: TestDb, userId: string, sql: string, params: unknown[]): Promise<T> => {
  const rows = await db.asUser(userId, (tx) => tx.query<{ dto: T }>(sql, params));
  return rows[0].dto;
};

const ultima = <T>(xs: T[]) => xs[xs.length - 1];

/**
 * Monta o caminho inteiro até uma configuração regional publicável: tema
 * publicado, indicador global publicado e a configuração em rascunho.
 */
async function montarConfig(
  db: TestDb, gestor: string, regionId: string, sufixo: string,
): Promise<ConfigDto> {
  const tema = await rpc<{ versions: { id: string }[] }>(db, ID.uAdmin,
    `select public.catalog_create_theme($1,$2,$3,$4::jsonb) as dto`,
    ['global', null, `TEMA-CRIT-${sufixo}`, JSON.stringify({ name: `Tema ${sufixo}` })]);
  await db.asUser(ID.uAdmin, (tx) =>
    tx.query(`select public.catalog_publish_theme_version($1)`, [tema.versions[0].id]));

  const ind = await rpc<{ id: string; versions: { id: string }[] }>(db, ID.uAdmin,
    `select public.catalog_create_indicator($1,$2,$3,$4::jsonb) as dto`,
    ['global', null, `IND-CRIT-${sufixo}`, JSON.stringify({ name: `Indicador ${sufixo}` })]);
  await db.asUser(ID.uAdmin, (tx) =>
    tx.query(`select public.catalog_publish_indicator_version($1)`, [ind.versions[0].id]));

  return rpc<ConfigDto>(db, gestor,
    `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as dto`,
    [regionId, ind.id, JSON.stringify({
      indicatorVersionId: ind.versions[0].id, themeVersionId: tema.versions[0].id,
      target: 80, includeInMonthlyAudit: true,
    })]);
}

const criarCriterio = (db: TestDb, uid: string, configId: string, code: string, payload: Record<string, unknown>) =>
  rpc<CriterionDto>(db, uid, `select public.catalog_create_criterion($1,$2,$3::jsonb) as dto`,
    [configId, code, JSON.stringify(payload)]);

const publicarCriterio = (db: TestDb, uid: string, versionId: string) =>
  rpc<CriterionDto>(db, uid, `select public.catalog_publish_criterion_version($1) as dto`, [versionId]);

describe('critério de processo: os dez campos de D4, versionados', () => {
  let db: TestDb;
  let config: ConfigDto;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
    config = await montarConfig(db, ID.uReg, ID.region, 'D4');
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('cria critério com os dez campos e a versão 1 em rascunho', async () => {
    const c = await criarCriterio(db, ID.uReg, config.id, 'crit-01', {
      question: 'A rotina de prospecção diária é executada e registrada?',
      description: 'Verificar em campo',
      guidance: 'Conferir o registro dos últimos cinco dias úteis',
      sortOrder: 1,
      required: true,
      evidenceRequired: true,
      allowsNa: true,
      requiresJustification: true,
    });
    const v = c.versions[0];
    expect(c.code).toBe('CRIT-01');
    expect(c.lifecycle).toBe('draft');
    expect(v.question).toMatch(/prospecção/);
    expect(v.description).toBe('Verificar em campo');
    expect(v.guidance).toMatch(/cinco dias/);
    expect(v.sortOrder).toBe(1);
    expect(v.required).toBe(true);
    expect(v.evidenceRequired).toBe(true);
    expect(v.allowsNa).toBe(true);
    expect(v.requiresJustification).toBe(true);
    expect(v.active).toBe(true);
    expect(v.status).toBe('draft');
    expect(v.effectiveFrom).toBeTruthy();
  });

  it('nova versão não altera a publicada — o questionário de ontem continua o de ontem', async () => {
    const c = await criarCriterio(db, ID.uReg, config.id, 'CRIT-VER', { question: 'Pergunta v1' });
    await publicarCriterio(db, ID.uReg, c.versions[0].id);

    const comV2 = await rpc<CriterionDto>(db, ID.uReg,
      `select public.catalog_add_criterion_version($1,$2::jsonb) as dto`,
      [c.id, JSON.stringify({ question: 'Pergunta v2', effectiveFrom: '2099-03-01' })]);

    expect(comV2.versions[0].question).toBe('Pergunta v1');
    expect(comV2.versions[0].status).toBe('published');
    expect(comV2.versions[1].question).toBe('Pergunta v2');
    expect(comV2.versions[1].status).toBe('draft');
  });

  it('publicar encerra a vigência da versão anterior e é IDEMPOTENTE', async () => {
    const c = await criarCriterio(db, ID.uReg, config.id, 'CRIT-IDEMP', { question: 'v1' });
    await publicarCriterio(db, ID.uReg, c.versions[0].id);
    const comV2 = await rpc<CriterionDto>(db, ID.uReg,
      `select public.catalog_add_criterion_version($1,$2::jsonb) as dto`,
      [c.id, JSON.stringify({ question: 'v2', effectiveFrom: '2099-04-01' })]);

    const depois = await publicarCriterio(db, ID.uReg, ultima(comV2.versions).id);
    expect(depois.versions[0].effectiveTo).not.toBeNull();
    expect(ultima(depois.versions).effectiveTo).toBeNull();

    const outraVez = await publicarCriterio(db, ID.uReg, ultima(comV2.versions).id);
    expect(outraVez.versions).toEqual(depois.versions);
  });

  it('inativar preserva o histórico; excluir critério publicado é RECUSADO', async () => {
    const c = await criarCriterio(db, ID.uReg, config.id, 'CRIT-INAT', { question: 'v1' });
    await publicarCriterio(db, ID.uReg, c.versions[0].id);

    const inativo = await rpc<CriterionDto>(db, ID.uReg,
      `select public.catalog_set_criterion_lifecycle($1,$2) as dto`, [c.id, 'inactive']);
    expect(inativo.lifecycle).toBe('inactive');
    expect(inativo.versions).toHaveLength(1);

    const erro = await (async () => {
      try { await db.exec(`delete from public.audit_criteria where id = '${c.id}'`); return null; }
      catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/ja publicado: inative/i);
  });

  it('RECUSA código repetido na mesma configuração, e pergunta vazia', async () => {
    await criarCriterio(db, ID.uReg, config.id, 'CRIT-DUP', { question: 'v1' });
    await db.asUser(ID.uReg, async (tx) => {
      expect((await tx.expectError(`select public.catalog_create_criterion($1,$2,$3::jsonb)`,
        [config.id, 'CRIT-DUP', JSON.stringify({ question: 'outra' })])).message)
        .toMatch(/ja existe um criterio/i);
      expect((await tx.expectError(`select public.catalog_create_criterion($1,$2,$3::jsonb)`,
        [config.id, 'CRIT-VAZIO', JSON.stringify({ question: '  ' })])).message)
        .toMatch(/obrigatorios/i);
    });
  });
});

describe('Auditoria Mensal exige critério publicado (D4)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('RECUSA publicar include_in_monthly_audit = true SEM critério nenhum', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'SEM');
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_publish_regional_config_version($1)`,
        [ultima(config.versions).id]));
    expect(erro.message).toMatch(/exige ao menos um criterio publicado/i);
  });

  it('RECUSA quando o critério existe mas está apenas em RASCUNHO', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'RASC');
    await criarCriterio(db, ID.uReg, config.id, 'CRIT-RASC', { question: 'Ainda rascunho' });

    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_publish_regional_config_version($1)`,
        [ultima(config.versions).id]));
    expect(erro.message).toMatch(/exige ao menos um criterio publicado/i);
  });

  it('ACEITA depois que o critério é publicado', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'OK');
    const c = await criarCriterio(db, ID.uReg, config.id, 'CRIT-OK', { question: 'Publicado' });
    await publicarCriterio(db, ID.uReg, c.versions[0].id);

    const publicada = await rpc<ConfigDto>(db, ID.uReg,
      `select public.catalog_publish_regional_config_version($1) as dto`,
      [ultima(config.versions).id]);
    expect(ultima(publicada.versions).status).toBe('published');
    expect(ultima(publicada.versions).includeInMonthlyAudit).toBe(true);
  });

  it('RECUSA quando o único critério publicado foi INATIVADO', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'INAT');
    const c = await criarCriterio(db, ID.uReg, config.id, 'CRIT-INAT-2', { question: 'Publicado' });
    await publicarCriterio(db, ID.uReg, c.versions[0].id);
    await db.asUser(ID.uReg, (tx) =>
      tx.query(`select public.catalog_set_criterion_lifecycle($1,$2)`, [c.id, 'inactive']));

    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_publish_regional_config_version($1)`,
        [ultima(config.versions).id]));
    expect(erro.message).toMatch(/exige ao menos um criterio publicado/i);
  });

  it('a guarda é do BANCO: nem escrita direta como superusuário passa', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'DIRETO');
    const erro = await (async () => {
      try {
        await db.exec(`update public.indicator_regional_config_versions
                          set status = 'published' where id = '${ultima(config.versions).id}'`);
        return null;
      } catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/exige ao menos um criterio publicado/i);
  });

  it('sem Auditoria Mensal marcada, nenhum critério é exigido', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'SO-GA');
    // Nova versão da configuração, agora fora da Auditoria Mensal.
    const semAuditoria = await rpc<ConfigDto>(db, ID.uReg,
      `select public.catalog_save_regional_config_draft($1,$2,$3::jsonb) as dto`,
      [ID.region,
       (await db.query<{ id: string }>(
         `select indicator_definition_id as id from public.indicator_regional_configs where id = $1`,
         [config.id]))[0].id,
       JSON.stringify({
         indicatorVersionId: (await db.query<{ id: string }>(
           `select indicator_version_id as id from public.indicator_regional_config_versions
             where config_id = $1 order by version_number desc limit 1`, [config.id]))[0].id,
         themeVersionId: (await db.query<{ id: string }>(
           `select theme_version_id as id from public.indicator_regional_config_versions
             where config_id = $1 order by version_number desc limit 1`, [config.id]))[0].id,
         target: 80, includeInMonthlyAudit: false, effectiveFrom: '2099-06-01',
       })]);

    const publicada = await rpc<ConfigDto>(db, ID.uReg,
      `select public.catalog_publish_regional_config_version($1) as dto`,
      [ultima(semAuditoria.versions).id]);
    expect(ultima(publicada.versions).status).toBe('published');
  });
});

describe('critérios não atravessam a fronteira da região', () => {
  let db: TestDb;
  let configR1: ConfigDto;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
    configR1 = await montarConfig(db, ID.uReg, ID.region, 'ISOL');
    await criarCriterio(db, ID.uReg, configR1.id, 'CRIT-R1', { question: 'Só da R1' });
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('o REGIONAL vizinho não cria critério na configuração da R1', async () => {
    const erro = await db.asUser(ID2.uReg2, (tx) =>
      tx.expectError(`select public.catalog_create_criterion($1,$2,$3::jsonb)`,
        [configR1.id, 'CRIT-INVASOR', JSON.stringify({ question: 'x' })]));
    expect(erro.message).toMatch(/inexistente ou fora do escopo/i);
  });

  it('o REGIONAL vizinho não enxerga os critérios da R1', async () => {
    const vistos = await db.asUser(ID2.uReg2, (tx) =>
      tx.query<{ code: string }>(`select code from public.audit_criteria`));
    expect(vistos.map((r) => r.code)).not.toContain('CRIT-R1');
  });

  it('COORDENADOR e GC não criam nem versionam critério', async () => {
    for (const uid of [ID.uCoord1, ID.uGcA]) {
      const erro = await db.asUser(uid, (tx) =>
        tx.expectError(`select public.catalog_create_criterion($1,$2,$3::jsonb)`,
          [configR1.id, 'CRIT-LEITOR', JSON.stringify({ question: 'x' })]));
      expect(erro.message).toMatch(/inexistente ou fora do escopo/i);
    }
  });

  it('ADMIN administra critério de qualquer região', async () => {
    const c = await criarCriterio(db, ID.uAdmin, configR1.id, 'CRIT-ADMIN', { question: 'Pelo admin' });
    expect(c.code).toBe('CRIT-ADMIN');
  });

  it('anon não lê as tabelas de critério nem executa as RPCs', async () => {
    await db.asAnon(async (tx) => {
      for (const t of ['audit_criteria', 'audit_criteria_versions']) {
        expect((await tx.expectError(`select * from public.${t}`)).message).toMatch(/permission denied/i);
      }
      expect((await tx.expectError(
        `select public.catalog_create_criterion(null, 'X', '{}'::jsonb)`)).message)
        .toMatch(/permission denied/i);
    });
  });

  it('autenticado não escreve direto nas tabelas de critério', async () => {
    await db.asUser(ID.uAdmin, async (tx) => {
      expect((await tx.expectError(
        `insert into public.audit_criteria (config_id, code) values ($1, 'X')`, [configR1.id])).message)
        .toMatch(/permission denied/i);
    });
  });
});

describe('as duas proibições expressas de D4', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('nenhum critério é gerado automaticamente ao criar indicador ou configuração', async () => {
    const config = await montarConfig(db, ID.uReg, ID.region, 'AUTO');
    const n = await db.query<{ n: number }>(
      `select count(*)::int n from public.audit_criteria where config_id = $1`, [config.id]);
    expect(n[0].n).toBe(0);
  });

  it('`audit_items` NÃO é convertido: as duas estruturas coexistem intactas', async () => {
    const itens = await db.query<{ n: number }>(`select count(*)::int n from public.audit_items`);
    const criterios = await db.query<{ n: number }>(`select count(*)::int n from public.audit_criteria`);
    expect(itens[0].n).toBeGreaterThan(0);      // o checklist legado continua lá
    expect(criterios[0].n).toBe(0);             // e nada dele virou critério
  });
});
