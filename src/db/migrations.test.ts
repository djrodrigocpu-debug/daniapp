import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Testes estáticos das migrations SQL (Masterplan §11, §18.3; Anexo D).
 *
 * Sem um Postgres disponível no CI local, validamos invariantes estruturais
 * do SQL versionado: presença das tabelas do §11.2, RLS habilitada, gatilhos de
 * integridade histórica (T05/T06/T07/T25) e ausência de segredo. A execução
 * real em banco (T19) é `BLOQUEADO POR DEPENDÊNCIA EXTERNA` (P09/DEP-03).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SUPA = join(HERE, '..', '..', 'supabase');

const schema = readFileSync(join(SUPA, 'migrations', '0001_core_schema.sql'), 'utf8');
const rls = readFileSync(join(SUPA, 'migrations', '0002_rls_policies.sql'), 'utf8');
const triggers = readFileSync(join(SUPA, 'migrations', '0003_integrity_triggers.sql'), 'utf8');
const down = readFileSync(join(SUPA, 'rollback', '0001_core_schema.down.sql'), 'utf8');
const seed = readFileSync(join(SUPA, 'seed', '0001_seed_catalog.sql'), 'utf8');

const REQUIRED_TABLES = [
  'organizations', 'regions', 'units', 'coordinations', 'operations',
  'users', 'user_scopes', 'operation_assignments',
  'visit_rules', 'calendar_exceptions',
  'audit_templates', 'audit_template_versions', 'audit_items',
  'indicator_definitions', 'indicator_versions', 'measurements',
  'visits', 'evaluations', 'evaluation_answers', 'official_snapshots',
  'evidence_files', 'evaluation_answer_evidence',
  'diagnoses', 'action_plans', 'validations', 'best_practices',
  'audit_logs', 'sync_operations',
];

describe('0001 — esquema central (§11.2)', () => {
  it('define todas as entidades do modelo de dados', () => {
    for (const t of REQUIRED_TABLES) {
      expect(schema, `faltando tabela ${t}`).toMatch(new RegExp(`create table public\\.${t}\\b`));
    }
  });

  it('usa UUIDs (gen_random_uuid) e timestamps', () => {
    expect(schema).toMatch(/gen_random_uuid\(\)/);
    expect(schema).toMatch(/timestamptz not null default now\(\)/);
  });

  it('vincula usuários ao Supabase Auth (auth.users)', () => {
    expect(schema).toMatch(/references auth\.users\(id\)/);
  });

  it('tem idempotency_key e row_version (§11.1, §12.3)', () => {
    expect(schema).toMatch(/idempotency_key\s+text not null unique/);
    expect(schema).toMatch(/row_version\s+int not null default 1/);
  });

  it('measurements referencia indicator_version_id (versionamento §11.3)', () => {
    expect(schema).toMatch(/indicator_version_id\s+uuid not null references public\.indicator_versions/);
  });
});

describe('0002 — RLS deny-by-default (§5.1, §13.3)', () => {
  it('habilita e força RLS em todas as tabelas', () => {
    expect(rls).toMatch(/enable row level security/);
    expect(rls).toMatch(/force row level security/);
  });

  it('define função de isolamento por operação (T01)', () => {
    expect(rls).toMatch(/function app\.has_operation_access/);
    expect(rls).toMatch(/create policy operations_scoped_read/);
  });

  it('impede autoaprovação: can_validate exige autor diferente (T02)', () => {
    expect(rls).toMatch(/function app\.can_validate/);
    expect(rls).toMatch(/author_user_id <> auth\.uid\(\)/);
  });

  it('indicadores: escrita somente admin (D-05)', () => {
    expect(rls).toMatch(/create policy ind_def_admin[\s\S]*?app\.is_admin\(\)/);
    expect(rls).toMatch(/create policy ind_ver_admin[\s\S]*?app\.is_admin\(\)/);
  });

  it('snapshots oficiais não têm policy de escrita ao cliente (§11.4)', () => {
    expect(rls).not.toMatch(/create policy \w+ on public\.official_snapshots for insert/);
    expect(rls).not.toMatch(/create policy \w+ on public\.official_snapshots for all/);
  });
});

describe('0003 — integridade histórica (triggers)', () => {
  it('indicador usado não pode ser deletado (T05)', () => {
    expect(triggers).toMatch(/guard_indicator_delete/);
    expect(triggers).toMatch(/trg_guard_indicator_delete before delete on public\.indicator_definitions/);
  });

  it('template usado fica travado e imutável (T06)', () => {
    expect(triggers).toMatch(/lock_template_on_use/);
    expect(triggers).toMatch(/guard_locked_items/);
  });

  it('avaliação aprovada é imutável, só supersede (T07)', () => {
    expect(triggers).toMatch(/guard_approved_evaluation/);
    expect(triggers).toMatch(/avaliacao aprovada e imutavel/);
  });

  it('audit_logs e snapshots são append-only (T25)', () => {
    expect(triggers).toMatch(/trg_audit_no_update before update on public\.audit_logs/);
    expect(triggers).toMatch(/trg_audit_no_delete before delete on public\.audit_logs/);
    expect(triggers).toMatch(/trg_snapshot_no_update/);
  });
});

describe('reversibilidade e seed', () => {
  it('0001 possui migration de reversão (§18.3)', () => {
    expect(down).toMatch(/drop table if exists/);
    expect(down).toMatch(/drop schema if exists app cascade/);
  });

  it('seed traz 24 temas e 12 indicadores (revisáveis, P05)', () => {
    const items = seed.match(/'T\d{2}'/g) ?? [];
    const uniqueItems = new Set(items);
    expect(uniqueItems.size).toBe(24);
    const inds = seed.match(/'IND-\d{3}'/g) ?? [];
    const uniqueInds = new Set(inds);
    expect(uniqueInds.size).toBe(12);
  });
});

describe('segurança do SQL', () => {
  it('nenhum SQL referencia service role', () => {
    for (const sql of [schema, rls, triggers, seed, down]) {
      expect(sql.toLowerCase()).not.toMatch(/service[_-]?role[_-]?key/);
    }
  });
});
