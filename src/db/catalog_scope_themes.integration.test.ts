/**
 * Temas com escopo global/regional (migration 0036) em banco REAL (PGlite/PG18).
 *
 * O QUE ESTÁ SENDO PROVADO. A decisão A-08 (ADR-135-001) só vale se o BANCO
 * impedir o que ela proíbe. Aqui não se testa a interface nem o repositório: as
 * chamadas são as mesmas que o PostgREST faria, sob RLS, com o JWT de cada
 * perfil. Se a regra não estiver no servidor, estes testes falham.
 *
 * Dados 100% SINTÉTICOS (§23). A segunda região existe só aqui e em 0037/0038 —
 * sem ela é impossível provar que a autonomia de uma região não alcança a outra.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, seedSecondRegion, ID, ID2 } from './testing/fixtures';

interface ThemeVersionDto {
  id: string;
  versionNumber: number;
  name: string;
  description: string | null;
  sortOrder: number;
  status: 'draft' | 'published';
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface ThemeDto {
  id: string;
  code: string;
  scopeKind: 'global' | 'regional';
  regionId: string | null;
  lifecycle: 'draft' | 'active' | 'inactive';
  versions: ThemeVersionDto[];
}

async function criarTema(
  db: TestDb,
  userId: string,
  scope: 'global' | 'regional',
  regionId: string | null,
  code: string,
  payload: Record<string, unknown>,
): Promise<ThemeDto> {
  return db.asUser(userId, async (tx) => {
    const rows = await tx.query<{ dto: ThemeDto }>(
      `select public.catalog_create_theme($1, $2, $3, $4::jsonb) as dto`,
      [scope, regionId, code, JSON.stringify(payload)],
    );
    return rows[0].dto;
  });
}

async function publicar(db: TestDb, userId: string, versionId: string): Promise<ThemeDto> {
  return db.asUser(userId, async (tx) => {
    const rows = await tx.query<{ dto: ThemeDto }>(
      `select public.catalog_publish_theme_version($1) as dto`,
      [versionId],
    );
    return rows[0].dto;
  });
}

describe('escopo de tema: global é do ADMIN, regional é da região', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('ADMIN cria tema GLOBAL, sem região, e a versão 1 nasce em rascunho', async () => {
    const dto = await criarTema(db, ID.uAdmin, 'global', null, ' tema-glob-1 ', {
      name: 'Atendimento', description: 'Tema global de atendimento', sortOrder: 1,
    });
    expect(dto.code).toBe('TEMA-GLOB-1');            // normalizado
    expect(dto.scopeKind).toBe('global');
    expect(dto.regionId).toBeNull();
    expect(dto.lifecycle).toBe('draft');
    expect(dto.versions).toHaveLength(1);
    expect(dto.versions[0].status).toBe('draft');    // publicar é ato explícito
    expect(dto.versions[0].name).toBe('Atendimento');
  });

  it('GERENTE REGIONAL cria tema REGIONAL na própria região', async () => {
    const dto = await criarTema(db, ID.uReg, 'regional', ID.region, 'TEMA-R1-A', { name: 'Tema da R1' });
    expect(dto.scopeKind).toBe('regional');
    expect(dto.regionId).toBe(ID.region);
  });

  it('RECUSA tema global ao GERENTE REGIONAL — catálogo global é do ADMIN', async () => {
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['global', null, 'TEMA-PROIBIDO', JSON.stringify({ name: 'x' })]));
    expect(erro.message).toMatch(/sem permissao/i);
  });

  it('RECUSA tema regional em OUTRA região', async () => {
    const erro = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['regional', ID2.region2, 'TEMA-INVASOR', JSON.stringify({ name: 'x' })]));
    expect(erro.message).toMatch(/sem permissao/i);
  });

  it('RECUSA escopo regional sem região e escopo desconhecido', async () => {
    await db.asUser(ID.uAdmin, async (tx) => {
      expect((await tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['regional', null, 'TEMA-SEM-REG', JSON.stringify({ name: 'x' })])).message)
        .toMatch(/exige regiao/i);
      expect((await tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['nacional', null, 'TEMA-ESCOPO', JSON.stringify({ name: 'x' })])).message)
        .toMatch(/escopo invalido/i);
    });
  });

  it('escopo global IGNORA a região enviada pelo cliente — não cria híbrido', async () => {
    const dto = await criarTema(db, ID.uAdmin, 'global', ID.region, 'TEMA-GLOB-HIB', { name: 'Global puro' });
    expect(dto.regionId).toBeNull();
    expect(dto.scopeKind).toBe('global');
  });

  it('COORDENADOR e GERENTE DE CANAL não criam tema em escopo nenhum', async () => {
    for (const uid of [ID.uCoord1, ID.uGcA]) {
      const erro = await db.asUser(uid, (tx) =>
        tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
          ['regional', ID.region, 'TEMA-LEITOR', JSON.stringify({ name: 'x' })]));
      expect(erro.message).toMatch(/sem permissao/i);
    }
  });

  it('código é identidade GLOBAL: não repete nem entre regiões (decisão D-E)', async () => {
    await criarTema(db, ID.uReg, 'regional', ID.region, 'TEMA-DUP', { name: 'Na R1' });

    // Mesma região: recusado.
    const naMesma = await db.asUser(ID.uReg, (tx) =>
      tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['regional', ID.region, 'TEMA-DUP', JSON.stringify({ name: 'Repetido' })]));
    expect(naMesma.message).toMatch(/ja existe um tema com o codigo TEMA-DUP/i);

    // Outra região: também recusado — o espaço de códigos é compartilhado.
    const naOutra = await db.asUser(ID2.uReg2, (tx) =>
      tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['regional', ID2.region2, 'TEMA-DUP', JSON.stringify({ name: 'Na R2' })]));
    expect(naOutra.message).toMatch(/ja existe um tema com o codigo TEMA-DUP/i);
    // ...e a recusa NÃO revela de quem é o tema.
    expect(naOutra.message).not.toMatch(/regi[aã]o|R1/i);
  });

  it('RECUSA código ou nome vazio', async () => {
    await db.asUser(ID.uAdmin, async (tx) => {
      expect((await tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['global', null, '   ', JSON.stringify({ name: 'Nome' })])).message).toMatch(/obrigatorios/i);
      expect((await tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['global', null, 'TEMA-VAZIO', JSON.stringify({ name: '  ' })])).message).toMatch(/obrigatorios/i);
    });
  });
});

describe('versionamento, publicação e vigência', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it('nova versão nasce em rascunho e NÃO altera a versão publicada', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-VER', { name: 'Nome v1', sortOrder: 1 });
    const publicado = await publicar(db, ID.uAdmin, tema.versions[0].id);
    expect(publicado.versions[0].status).toBe('published');

    const comV2 = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: ThemeDto }>(
        `select public.catalog_add_theme_version($1, $2::jsonb) as dto`,
        [tema.id, JSON.stringify({ name: 'Nome v2', sortOrder: 9, effectiveFrom: '2099-01-01' })]);
      return rows[0].dto;
    });

    expect(comV2.versions).toHaveLength(2);
    const v1 = comV2.versions.find((v) => v.versionNumber === 1)!;
    const v2 = comV2.versions.find((v) => v.versionNumber === 2)!;
    expect(v1.name).toBe('Nome v1');          // o passado não muda
    expect(v1.status).toBe('published');
    expect(v2.name).toBe('Nome v2');
    expect(v2.status).toBe('draft');
    expect(v2.sortOrder).toBe(9);             // reordenar é nova versão
  });

  it('publicar ENCERRA a vigência da versão anterior — sem sobreposição', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-VIG', { name: 'v1' });
    await publicar(db, ID.uAdmin, tema.versions[0].id);

    const comV2 = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: ThemeDto }>(
        `select public.catalog_add_theme_version($1, $2::jsonb) as dto`,
        [tema.id, JSON.stringify({ name: 'v2', effectiveFrom: '2099-05-01' })]);
      return rows[0].dto;
    });
    const v2 = comV2.versions.find((v) => v.versionNumber === 2)!;
    const depois = await publicar(db, ID.uAdmin, v2.id);

    const v1 = depois.versions.find((v) => v.versionNumber === 1)!;
    expect(v1.effectiveTo).not.toBeNull();
    expect(depois.versions.find((v) => v.versionNumber === 2)!.effectiveTo).toBeNull();
  });

  it('o gatilho RECUSA sobreposição de vigência entre versões publicadas', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-SOBREP', { name: 'v1' });
    await publicar(db, ID.uAdmin, tema.versions[0].id);

    // Escrita direta como superuser: prova que a proteção é do BANCO, não da RPC.
    const erro = await (async () => {
      try {
        await db.exec(`
          insert into public.theme_versions (theme_id, version_number, name, status, effective_from)
          values ('${tema.id}', 99, 'sobreposta', 'published', now() + interval '1 day');
        `);
        return null;
      } catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/vigencia sobreposta/i);
  });

  it('publicação é IDEMPOTENTE: publicar duas vezes não muda nada', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-IDEMP', { name: 'v1' });
    const um = await publicar(db, ID.uAdmin, tema.versions[0].id);
    const dois = await publicar(db, ID.uAdmin, tema.versions[0].id);
    expect(dois.versions).toEqual(um.versions);
    expect(dois.versions).toHaveLength(1);
  });

  it('inativar preserva o histórico; excluir tema publicado é RECUSADO', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-INAT', { name: 'v1' });
    await publicar(db, ID.uAdmin, tema.versions[0].id);

    const inativo = await db.asUser(ID.uAdmin, async (tx) => {
      const rows = await tx.query<{ dto: ThemeDto }>(
        `select public.catalog_set_theme_lifecycle($1, $2) as dto`, [tema.id, 'inactive']);
      return rows[0].dto;
    });
    expect(inativo.lifecycle).toBe('inactive');
    expect(inativo.versions).toHaveLength(1);        // histórico intacto

    // Nem o superuser apaga: é gatilho, não permissão.
    const erro = await (async () => {
      try { await db.exec(`delete from public.themes where id = '${tema.id}'`); return null; }
      catch (e) { return e as Error; }
    })();
    expect(erro?.message).toMatch(/inative em vez de excluir/i);
  });

  it('RECUSA voltar um tema para rascunho', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-DRAFT', { name: 'v1' });
    const erro = await db.asUser(ID.uAdmin, (tx) =>
      tx.expectError(`select public.catalog_set_theme_lifecycle($1,$2)`, [tema.id, 'draft']));
    expect(erro.message).toMatch(/situacao invalida/i);
  });

  it('REGIONAL não versiona nem publica tema GLOBAL', async () => {
    const tema = await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-SO-ADMIN', { name: 'v1' });
    await db.asUser(ID.uReg, async (tx) => {
      expect((await tx.expectError(`select public.catalog_add_theme_version($1,$2::jsonb)`,
        [tema.id, JSON.stringify({ name: 'invasao' })])).message).toMatch(/inexistente ou fora do escopo/i);
      expect((await tx.expectError(`select public.catalog_publish_theme_version($1)`,
        [tema.versions[0].id])).message).toMatch(/inexistente ou fora do escopo/i);
      expect((await tx.expectError(`select public.catalog_set_theme_lifecycle($1,$2)`,
        [tema.id, 'inactive'])).message).toMatch(/inexistente ou fora do escopo/i);
    });
  });

  it('tema inexistente e tema de outra região devolvem A MESMA recusa', async () => {
    const daR2 = await criarTema(db, ID2.uReg2, 'regional', ID2.region2, 'TEMA-R2-X', { name: 'Da R2' });
    const [outraRegiao, inexistente] = await db.asUser(ID.uReg, async (tx) => [
      await tx.expectError(`select public.catalog_add_theme_version($1,$2::jsonb)`,
        [daR2.id, JSON.stringify({ name: 'x' })]),
      await tx.expectError(`select public.catalog_add_theme_version($1,$2::jsonb)`,
        ['00000000-0000-0000-0000-0000000000ff', JSON.stringify({ name: 'x' })]),
    ]);
    expect(outraRegiao.message).toBe(inexistente.message);
  });
});

describe('leitura: tema regional não atravessa a fronteira da região', () => {
  let db: TestDb;
  let globalId = '';
  let r1Id = '';
  let r2Id = '';
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    await seedSecondRegion(db);
    globalId = (await criarTema(db, ID.uAdmin, 'global', null, 'TEMA-LEIT-G', { name: 'Global' })).id;
    r1Id = (await criarTema(db, ID.uReg, 'regional', ID.region, 'TEMA-LEIT-R1', { name: 'Da R1' })).id;
    r2Id = (await criarTema(db, ID2.uReg2, 'regional', ID2.region2, 'TEMA-LEIT-R2', { name: 'Da R2' })).id;
  }, 60_000);
  afterAll(async () => { await db.close(); });

  const visiveis = (db: TestDb, uid: string) =>
    db.asUser(uid, (tx) => tx.query<{ id: string }>(`select id from public.themes order by code`));

  it('REGIONAL da R1 vê o global e o da R1, nunca o da R2', async () => {
    const ids = (await visiveis(db, ID.uReg)).map((r) => r.id);
    expect(ids).toContain(globalId);
    expect(ids).toContain(r1Id);
    expect(ids).not.toContain(r2Id);
  });

  it('REGIONAL da R2 vê o global e o da R2, nunca o da R1', async () => {
    const ids = (await visiveis(db, ID2.uReg2)).map((r) => r.id);
    expect(ids).toContain(r2Id);
    expect(ids).not.toContain(r1Id);
  });

  it('COORDENADOR alcança a região da própria coordenadoria', async () => {
    const ids = (await visiveis(db, ID.uCoord1)).map((r) => r.id);   // Coord 1 fica na R1
    expect(ids).toContain(r1Id);
    expect(ids).not.toContain(r2Id);
  });

  it('GERENTE DE CANAL alcança a região dos parceiros a que está atribuído', async () => {
    const ids = (await visiveis(db, ID.uGcA)).map((r) => r.id);      // opA fica na R1
    expect(ids).toContain(r1Id);
    expect(ids).not.toContain(r2Id);
  });

  it('usuário sem escopo vê só o catálogo global', async () => {
    const ids = (await visiveis(db, ID.uNoScope)).map((r) => r.id);
    expect(ids).toEqual([globalId]);
  });

  it('ADMIN vê tudo', async () => {
    const ids = (await visiveis(db, ID.uAdmin)).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([globalId, r1Id, r2Id]));
  });

  it('anon não lê tabela nova nenhuma e não executa RPC nenhuma', async () => {
    await db.asAnon(async (tx) => {
      for (const t of ['themes', 'theme_versions']) {
        const erro = await tx.expectError(`select * from public.${t}`);
        expect(erro.message).toMatch(/permission denied/i);
      }
      const erro = await tx.expectError(`select public.catalog_create_theme($1,$2,$3,$4::jsonb)`,
        ['global', null, 'TEMA-ANON', JSON.stringify({ name: 'x' })]);
      expect(erro.message).toMatch(/permission denied/i);
    });
  });

  it('autenticado não escreve direto nas tabelas — só por RPC', async () => {
    await db.asUser(ID.uAdmin, async (tx) => {
      const erro = await tx.expectError(
        `insert into public.themes (code, scope_kind) values ('TEMA-DIRETO','global')`);
      expect(erro.message).toMatch(/permission denied/i);
    });
  });
});
