/**
 * Harness de banco EXECUTÁVEL para AAPEX/AACE V2 (Masterplan §11, §18.3; Anexo D).
 *
 * Diferente de `src/db/migrations.test.ts` (testes estáticos que apenas leem o
 * texto do SQL), este harness sobe um PostgreSQL REAL em processo — PGlite (WASM,
 * PostgreSQL 18) — aplica as MIGRATIONS REAIS (0001/0002/0003) e a seed, e expõe
 * utilidades para executar consultas sob RLS como cada perfil autenticado.
 *
 * Isso permite validar de verdade, sem Docker nem credenciais externas:
 *   - criação integral do esquema e `db reset` idempotente;
 *   - constraints, FKs, uniqueness, checks;
 *   - triggers de integridade histórica (T05/T06/T07/T25);
 *   - RLS positiva e negativa por perfil (T01/T02/T17) — isolamento entre GCs,
 *     escopo de coordenador/regional, admin-only em indicadores, sem autoaprovação.
 *
 * Referência da técnica: conectar como papel `authenticated` e injetar o claim
 * JWT (`request.jwt.claims`) na transação — é o que o PostgREST faz por requisição.
 */
import { PGlite } from '@electric-sql/pglite';
// pgcrypto real (WASM) para que `create extension if not exists "pgcrypto"` da
// migration 0001 rode SEM alteração no arquivo — mantém as migrations intactas (§28).
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const SUPA = join(ROOT, 'supabase');

export const MIGRATION_FILES = [
  join(SUPA, 'migrations', '0001_core_schema.sql'),
  join(SUPA, 'migrations', '0002_rls_policies.sql'),
  join(SUPA, 'migrations', '0003_integrity_triggers.sql'),
] as const;

export const COMPAT_FILE = join(HERE, 'supabase_compat.sql');
export const SEED_FILE = join(SUPA, 'seed', '0001_seed_catalog.sql');
export const DOWN_FILE = join(SUPA, 'migrations', '0001_core_schema.down.sql');

const read = (p: string) => readFileSync(p, 'utf8');

export interface TestDbOptions {
  /** Aplica a seed de catálogo (24 temas + 12 indicadores). Default: false. */
  seed?: boolean;
}

export interface TestDb {
  raw: PGlite;
  /** Executa SQL como superuser (postgres) — ignora RLS. Use para montar cenário. */
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Executa `fn` dentro de uma transação como o papel `authenticated`, com o
   * claim JWT `sub = userId` — ou seja, sob RLS, exatamente como um usuário real.
   */
  asUser<T>(userId: string, fn: (tx: RlsSession) => Promise<T>): Promise<T>;
  /** Sessão anônima (sem JWT): usada para provar que nada vaza sem login. */
  asAnon<T>(fn: (tx: RlsSession) => Promise<T>): Promise<T>;
  /** Reaplica todas as migrations sobre um banco limpo (teste de `db reset`). */
  reset(opts?: TestDbOptions): Promise<void>;
  close(): Promise<void>;
}

export interface RlsSession {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Espera que a consulta LANCE (violação de RLS/constraint/trigger). */
  expectError(sql: string, params?: unknown[]): Promise<Error>;
}

async function applyBaseline(db: PGlite, opts: TestDbOptions): Promise<void> {
  await db.exec(read(COMPAT_FILE));
  for (const f of MIGRATION_FILES) {
    await db.exec(read(f));
  }
  // Concede às roles o acesso de tabela que o Supabase concede globalmente.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    grant usage on schema app to anon, authenticated, service_role;
    grant select on all tables in schema public to anon;
  `);
  if (opts.seed) {
    await db.exec(read(SEED_FILE));
  }
}

export async function createTestDb(opts: TestDbOptions = {}): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await applyBaseline(db, opts);

  const runAs = async <T>(
    role: 'authenticated' | 'anon',
    claim: Record<string, string> | null,
    fn: (tx: RlsSession) => Promise<T>,
  ): Promise<T> => {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      const claims = claim ? JSON.stringify({ role, ...claim }) : '';
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);

      const session: RlsSession = {
        async query<T2>(sql: string, params: unknown[] = []) {
          const r = await db.query<T2>(sql, params);
          return r.rows;
        },
        // Usa savepoint para manter a transação utilizável após a falha esperada,
        // permitindo múltiplas asserções no mesmo bloco `asUser`.
        async expectError(sql: string, params: unknown[] = []) {
          await db.query('savepoint sp');
          try {
            await db.query(sql, params);
          } catch (e) {
            await db.query('rollback to savepoint sp').catch(() => undefined);
            return e as Error;
          }
          await db.query('release savepoint sp').catch(() => undefined);
          throw new Error('esperava erro (RLS/constraint/trigger), mas a operação foi permitida');
        },
      };
      const out = await fn(session);
      await db.exec('commit');
      return out;
    } catch (e) {
      await db.exec('rollback').catch(() => undefined);
      throw e;
    }
  };

  return {
    raw: db,
    async exec(sql: string) {
      await db.exec(sql);
    },
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await db.query<T>(sql, params);
      return r.rows;
    },
    asUser: (userId, fn) => runAs('authenticated', { sub: userId }, fn),
    asAnon: (fn) => runAs('anon', null, fn),
    async reset(resetOpts: TestDbOptions = {}) {
      await db.exec(read(DOWN_FILE));
      await db.exec(`drop schema if exists auth cascade;`);
      await applyBaseline(db, resetOpts);
    },
    async close() {
      await db.close();
    },
  };
}
