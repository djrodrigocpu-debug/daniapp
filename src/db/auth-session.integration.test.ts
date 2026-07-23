/**
 * Prova, em banco REAL sob RLS, o CONTRATO DE DADOS que o SupabaseAuthRepository
 * usa para montar a sessão (buildSession — §7.1). Sem PostgREST/GoTrue disponíveis
 * localmente (BLOQUEADO POR DEPENDÊNCIA EXTERNA), validamos aqui que as MESMAS
 * consultas (users por id, user_scopes ativos, operation_assignments ativos),
 * executadas como o próprio usuário, retornam exatamente o escopo esperado — e
 * que a RLS impede um usuário de montar a sessão de outro.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, ID } from './testing/fixtures';
import { rolesFromScopes } from '../domain/auth/session';
import type { UserScope } from '../domain/model';

function toScopes(rows: Array<Record<string, unknown>>, assignments: string[]): UserScope[] {
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    role: r.role as UserScope['role'],
    regionId: (r.region_id as string) ?? null,
    coordinationId: (r.coordination_id as string) ?? null,
    unitId: (r.unit_id as string) ?? null,
    operationIds: r.role === 'channel_manager' ? assignments : [],
    validFrom: String(r.valid_from),
    validTo: (r.valid_to as string) ?? null,
    active: Boolean(r.active),
  }));
}

async function buildSessionAs(db: TestDb, userId: string) {
  return db.asUser(userId, async (tx) => {
    // Réplica das três consultas de SupabaseAuthRepository.buildSession, sob RLS.
    const users = await tx.query(`select * from public.users where id='${userId}'`);
    const scopeRows = await tx.query(`select * from public.user_scopes where user_id='${userId}' and active=true`);
    const assignRows = await tx.query<{ operation_id: string }>(
      `select operation_id from public.operation_assignments where user_id='${userId}' and active=true`,
    );
    const scopes = toScopes(scopeRows, assignRows.map((a) => a.operation_id));
    return {
      user: users[0] ?? null,
      scopes,
      roles: rolesFromScopes(scopes, new Date().toISOString()),
    };
  });
}

describe('contrato de dados da sessão autenticada (banco real, RLS)', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
  }, 30_000);
  afterAll(async () => { await db.close(); });

  it('GC A monta sessão com papel channel_manager e a operação atribuída', async () => {
    const s = await buildSessionAs(db, ID.uGcA);
    expect(s.user).toBeTruthy();
    expect(s.roles).toEqual(['channel_manager']);
    expect(s.scopes[0].operationIds).toEqual([ID.opA]);
  });

  it('GC A não consegue montar a sessão do GC B (RLS bloqueia o perfil alheio)', async () => {
    const s = await buildSessionAs(db, ID.uGcB); // atuando como GC A? não — asUser(uGcB) atua como B.
    // Aqui provamos o inverso: como B, vê só o próprio; então checamos vazamento cruzado:
    const crossed = await db.asUser(ID.uGcA, (tx) =>
      tx.query(`select id from public.users where id='${ID.uGcB}'`));
    expect(crossed).toEqual([]);
    expect(s.roles).toEqual(['channel_manager']); // sanidade de B
  });

  it('Coordenador monta sessão com papel coordinator (sem operationIds diretos)', async () => {
    const s = await buildSessionAs(db, ID.uCoord1);
    expect(s.roles).toEqual(['coordinator']);
    expect(s.scopes[0].coordinationId).toBe(ID.coord1);
  });

  it('Administrador monta sessão com papel admin', async () => {
    const s = await buildSessionAs(db, ID.uAdmin);
    expect(s.roles).toEqual(['admin']);
  });
});
