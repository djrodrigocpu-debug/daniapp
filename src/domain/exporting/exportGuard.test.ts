import { describe, it, expect } from 'vitest';
import { authorizeExport, ExportRequest, OperationScopeLookup } from './exportGuard';
import { AuthzSubject } from '../authz/policy';

const NOW = '2026-07-22T12:00:00Z';
const lookup: Record<string, OperationScopeLookup> = {
  'op-A': { regionId: 'reg-1', coordinationId: 'coord-1' },
  'op-B': { regionId: 'reg-2', coordinationId: 'coord-2' },
};
const resolve = (id: string) => lookup[id] ?? null;

function subject(partial: Partial<AuthzSubject>): AuthzSubject {
  return { userId: 'u1', roles: [], regionIds: [], coordinationIds: [], assignedOperationIds: [], ...partial };
}

describe('authorizeExport (T16)', () => {
  it('coordenador exporta apenas operações do seu escopo', () => {
    const coord = subject({ roles: ['coordinator'], coordinationIds: ['coord-1'] });
    const req: ExportRequest = { purpose: 'Relatório mensal', operationIds: ['op-A'], raw: false };
    const r = authorizeExport(coord, req, NOW, resolve);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.userId).toBe('u1');
      expect(r.value.purpose).toBe('Relatório mensal');
      expect(r.value.scopeKind).toBe('coordinations');
    }
  });

  it('bloqueia exportação fora do escopo', () => {
    const coord = subject({ roles: ['coordinator'], coordinationIds: ['coord-1'] });
    const req: ExportRequest = { purpose: 'Relatório', operationIds: ['op-B'], raw: false };
    const r = authorizeExport(coord, req, NOW, resolve);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('authz/out-of-scope');
  });

  it('dados brutos exigem admin', () => {
    const reg = subject({ roles: ['regional'], regionIds: ['reg-1'] });
    const req: ExportRequest = { purpose: 'Auditoria', operationIds: ['op-A'], raw: true };
    const r = authorizeExport(reg, req, NOW, resolve);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('authz/forbidden');
  });

  it('exige finalidade declarada', () => {
    const admin = subject({ roles: ['admin'] });
    const req: ExportRequest = { purpose: '', operationIds: ['op-A'], raw: false };
    expect(authorizeExport(admin, req, NOW, resolve).ok).toBe(false);
  });

  it('admin exporta qualquer operação com marca dágua', () => {
    const admin = subject({ roles: ['admin'] });
    const req: ExportRequest = { purpose: 'Consolidado', operationIds: ['op-A', 'op-B'], raw: true };
    const r = authorizeExport(admin, req, NOW, resolve);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.operationIds).toEqual(['op-A', 'op-B']);
  });
});
