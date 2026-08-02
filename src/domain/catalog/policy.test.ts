/**
 * Espelho de domínio do catálogo com escopo (A-08).
 *
 * ESTES TESTES NÃO PROVAM SEGURANÇA — a prova está em
 * `src/db/catalog_*.integration.test.ts`, contra banco real e sob RLS. Provam
 * que a interface DECIDE IGUAL ao servidor, para não oferecer o que será
 * recusado nem esconder o que seria aceito.
 */
import { describe, it, expect } from 'vitest';
import { AuthzSubject } from '../authz/policy';
import {
  canManageCatalog,
  canManageScope,
  canSeeScope,
  describePublishBlock,
  hasPublishedActiveCriterion,
  isInForce,
  overlaps,
  publishBlocks,
  reachesRegion,
  versionInForce,
} from './policy';
import {
  AuditCriterion,
  REGIONAL_CONFIG_DEFAULTS,
  ValidityInterval,
  scopeOf,
  scopeRegionId,
} from './types';

const R1 = 'regiao-1';
const R2 = 'regiao-2';

const subject = (over: Partial<AuthzSubject>): AuthzSubject => ({
  userId: 'u1', roles: [], regionIds: [], coordinationIds: [], assignedOperationIds: [], ...over,
});

const admin = subject({ roles: ['admin'] });
const regionalR1 = subject({ roles: ['regional'], regionIds: [R1] });
const regionalDuasRegioes = subject({ roles: ['regional'], regionIds: [R1, R2] });
const coordenador = subject({ roles: ['coordinator'], coordinationIds: ['c1'] });
const gc = subject({ roles: ['channel_manager'], assignedOperationIds: ['op1'] });

describe('escopo do catálogo é um tipo, não um par de campos soltos', () => {
  it('global descarta a região; regional a exige', () => {
    expect(scopeOf('global', R1)).toEqual({ kind: 'global' });
    expect(scopeOf('regional', R1)).toEqual({ kind: 'regional', regionId: R1 });
    // Regional sem região não é representável: cai para global, como o CHECK do
    // banco exigiria antes de aceitar a linha.
    expect(scopeOf('regional', null)).toEqual({ kind: 'global' });
  });

  it('devolve ao servidor a forma que ele espera', () => {
    expect(scopeRegionId({ kind: 'global' })).toBeNull();
    expect(scopeRegionId({ kind: 'regional', regionId: R2 })).toBe(R2);
  });
});

describe('canManageCatalog espelha app.can_manage_catalog', () => {
  it('catálogo GLOBAL é só do ADMIN', () => {
    expect(canManageCatalog(admin, null)).toBe(true);
    expect(canManageCatalog(regionalR1, null)).toBe(false);
    expect(canManageCatalog(coordenador, null)).toBe(false);
    expect(canManageCatalog(gc, null)).toBe(false);
  });

  it('catálogo REGIONAL é do ADMIN e do regional DAQUELA região', () => {
    expect(canManageCatalog(admin, R2)).toBe(true);
    expect(canManageCatalog(regionalR1, R1)).toBe(true);
    expect(canManageCatalog(regionalR1, R2)).toBe(false);
  });

  it('regional com mais de uma região administra as suas — A-07 não bloqueia', () => {
    expect(canManageCatalog(regionalDuasRegioes, R1)).toBe(true);
    expect(canManageCatalog(regionalDuasRegioes, R2)).toBe(true);
  });

  it('COORDENADOR e GC não administram catálogo nem no próprio escopo', () => {
    expect(canManageCatalog(coordenador, R1)).toBe(false);
    expect(canManageCatalog(gc, R1)).toBe(false);
  });

  it('decide igual a partir do escopo já resolvido', () => {
    expect(canManageScope(regionalR1, { kind: 'regional', regionId: R1 })).toBe(true);
    expect(canManageScope(regionalR1, { kind: 'global' })).toBe(false);
  });
});

describe('alcance de leitura é mais largo que a autoridade de escrita', () => {
  it('o global é visível a todos; o regional, só a quem alcança', () => {
    expect(canSeeScope([], { kind: 'global' })).toBe(true);
    expect(canSeeScope([R1], { kind: 'regional', regionId: R1 })).toBe(true);
    expect(canSeeScope([R1], { kind: 'regional', regionId: R2 })).toBe(false);
  });

  it('região nula nunca é alcançada por engano', () => {
    expect(reachesRegion([R1], null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

const criterio = (over: Partial<AuditCriterion> = {}): AuditCriterion => ({
  id: 'c1', configId: 'cfg1', code: 'CRIT-01', lifecycle: 'active',
  versions: [{
    id: 'cv1', versionNumber: 1, question: 'A rotina existe?', description: null, guidance: null,
    sortOrder: 0, required: true, evidenceRequired: false, allowsNa: false,
    requiresJustification: false, status: 'published', active: true,
    validity: { from: '2026-01-01', to: null },
  }],
  ...over,
});

const contexto = (over: Partial<Parameters<typeof publishBlocks>[1]> = {}) => ({
  direction: 'higher_better' as const,
  indicatorVersionPublished: true,
  themeVersionPublished: true,
  criteria: [] as AuditCriterion[],
  ...over,
});

const versao = (over: Partial<{ includeInAssistedManagement: boolean; includeInMonthlyAudit: boolean }> = {}) => ({
  includeInAssistedManagement: REGIONAL_CONFIG_DEFAULTS.includeInAssistedManagement,
  includeInMonthlyAudit: REGIONAL_CONFIG_DEFAULTS.includeInMonthlyAudit,
  ...over,
});

describe('guardas de publicação — espelho dos gatilhos', () => {
  it('os defaults empresariais publicam sem bloqueio', () => {
    expect(publishBlocks(versao(), contexto())).toEqual([]);
  });

  it('target_band na Gestão Assistida é BLOQUEADO enquanto A-01 estiver aberta', () => {
    const blocks = publishBlocks(versao(), contexto({ direction: 'target_band' }));
    expect(blocks).toEqual([{ reason: 'target-band-sem-regra' }]);
    expect(describePublishBlock(blocks[0])).toMatch(/A-01/);
    // E não converte para nada: a recusa é o comportamento inteiro.
    expect(describePublishBlock(blocks[0])).not.toMatch(/higher_better|lower_better/);
  });

  it('target_band FORA da Gestão Assistida não é bloqueado', () => {
    expect(publishBlocks(
      versao({ includeInAssistedManagement: false }),
      contexto({ direction: 'target_band' }),
    )).toEqual([]);
  });

  it('Auditoria Mensal sem critério publicado é BLOQUEADA', () => {
    expect(publishBlocks(versao({ includeInMonthlyAudit: true }), contexto()))
      .toEqual([{ reason: 'auditoria-mensal-sem-criterio' }]);
  });

  it('critério em rascunho, inativo ou de critério inativado não conta', () => {
    const rascunho = criterio({ versions: [{ ...criterio().versions[0], status: 'draft' }] });
    const inativo = criterio({ versions: [{ ...criterio().versions[0], active: false }] });
    const aposentado = criterio({ lifecycle: 'inactive' });

    for (const c of [rascunho, inativo, aposentado]) {
      expect(hasPublishedActiveCriterion([c])).toBe(false);
      expect(publishBlocks(versao({ includeInMonthlyAudit: true }), contexto({ criteria: [c] })))
        .toEqual([{ reason: 'auditoria-mensal-sem-criterio' }]);
    }
  });

  it('um critério publicado e ativo libera a Auditoria Mensal', () => {
    expect(hasPublishedActiveCriterion([criterio()])).toBe(true);
    expect(publishBlocks(versao({ includeInMonthlyAudit: true }), contexto({ criteria: [criterio()] })))
      .toEqual([]);
  });

  it('versão de indicador ou de tema em rascunho bloqueia', () => {
    expect(publishBlocks(versao(), contexto({ indicatorVersionPublished: false })))
      .toEqual([{ reason: 'indicador-nao-publicado' }]);
    expect(publishBlocks(versao(), contexto({ themeVersionPublished: false })))
      .toEqual([{ reason: 'tema-nao-publicado' }]);
  });

  it('bloqueios acumulam — a tela mostra tudo que falta de uma vez', () => {
    const blocks = publishBlocks(
      versao({ includeInMonthlyAudit: true }),
      contexto({ direction: 'target_band', themeVersionPublished: false }),
    );
    expect(blocks.map((b) => b.reason)).toEqual([
      'tema-nao-publicado', 'target-band-sem-regra', 'auditoria-mensal-sem-criterio',
    ]);
  });

  it('toda mensagem é apresentável: sem SQL, sem nome de coluna', () => {
    const todos = publishBlocks(
      versao({ includeInMonthlyAudit: true }),
      contexto({ direction: 'target_band', indicatorVersionPublished: false, themeVersionPublished: false }),
    );
    for (const b of todos) {
      const texto = describePublishBlock(b);
      expect(texto).not.toMatch(/include_in_|_version_id|select |raise /i);
      expect(texto.length).toBeGreaterThan(20);
    }
  });
});

describe('vigência meio-aberta [from, to)', () => {
  const iv = (from: string, to: string | null = null): ValidityInterval => ({ from, to });

  it('encostar pelo extremo NÃO é sobrepor — é o caminho normal de publicação', () => {
    expect(overlaps(iv('2026-01-01', '2026-06-01'), iv('2026-06-01'))).toBe(false);
  });

  it('sobreposição real é detectada, inclusive contra vigência indeterminada', () => {
    expect(overlaps(iv('2026-01-01', '2026-06-01'), iv('2026-05-01'))).toBe(true);
    expect(overlaps(iv('2026-01-01'), iv('2027-01-01'))).toBe(true);
  });

  it('o começo entra na vigência e o fim não', () => {
    expect(isInForce(iv('2026-01-01', '2026-06-01'), '2026-01-01')).toBe(true);
    expect(isInForce(iv('2026-01-01', '2026-06-01'), '2026-06-01')).toBe(false);
    expect(isInForce(iv('2026-01-01'), '2099-01-01')).toBe(true);
  });

  it('a vigente é a publicada da data — rascunho nunca vale', () => {
    const versoes = [
      { status: 'published', validity: iv('2026-01-01', '2026-06-01'), n: 1 },
      { status: 'published', validity: iv('2026-06-01'), n: 2 },
      { status: 'draft', validity: iv('2026-01-01'), n: 3 },
    ];
    expect(versionInForce(versoes, '2026-03-01')?.n).toBe(1);
    expect(versionInForce(versoes, '2026-09-01')?.n).toBe(2);
    expect(versionInForce([versoes[2]], '2026-03-01')).toBeNull();
  });

  it('sem versão publicada vigente não há operação — o estado normal de quem não adotou', () => {
    expect(versionInForce([], '2026-03-01')).toBeNull();
  });
});
