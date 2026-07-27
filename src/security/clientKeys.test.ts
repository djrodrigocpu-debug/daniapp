/**
 * Teste obrigatório 17 (AAPEx v2): nenhuma chave privilegiada é enviada ao
 * cliente. O bundle só pode conter a chave anônima (EXPO_PUBLIC_*); qualquer
 * referência a service_role/segredos no código de produção é falha de build.
 * Arquivos *.test.ts ficam fora do bundle e são excluídos da varredura
 * (migrations.test.ts, por exemplo, menciona "service role" para PROIBI-LO).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const FORBIDDEN = [
  /service[_-]?role/i,
  /sb_secret/i,
  /SUPABASE_SERVICE/i,
];

/**
 * Remove comentários (// e barra-asterisco) antes da varredura: comentários como
 * "Nunca usa service_role" DOCUMENTAM a proibição e não embarcam segredo algum.
 * A varredura vale para código executável e literais.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function listShippedSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // src/db é infraestrutura de teste (harness/migrations) — nunca entra no bundle.
      if (entry === 'db') continue;
      out.push(...listShippedSources(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Única exceção: src/config/env.ts cita os NOMES proibidos exatamente para
// bloqueá-los em runtime (assertNoPrivilegedSecrets, T03) — é defesa, não vazamento.
const GUARD_FILE = join(ROOT, 'src', 'config', 'env.ts');

describe('nenhuma chave privilegiada no cliente (teste 17)', () => {
  it('código de produção e app.json não referenciam service_role/segredos', () => {
    const files = [...listShippedSources(join(ROOT, 'src')), join(ROOT, 'app.json')];
    expect(files.length).toBeGreaterThan(20); // sanidade: a varredura cobre o app
    for (const file of files) {
      if (file === GUARD_FILE) continue;
      const content = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of FORBIDDEN) {
        expect(content, `${pattern} encontrado em ${file}`).not.toMatch(pattern);
      }
    }
  });

  it('o guard de runtime contra chaves privilegiadas continua presente (T03)', () => {
    const env = readFileSync(GUARD_FILE, 'utf8');
    expect(env).toMatch(/assertNoPrivilegedSecrets/);
    expect(env).toMatch(/SUPABASE_SERVICE_ROLE_KEY/); // blocklist do guard
    // Nenhum VALOR de segredo embutido (apenas nomes na blocklist).
    expect(env).not.toMatch(/sb_secret_[A-Za-z0-9]/);
    expect(env).not.toMatch(/eyJ[A-Za-z0-9_-]{40,}/); // JWT literal
  });

  it('config de runtime só lê variáveis públicas EXPO_PUBLIC_*', () => {
    const env = readFileSync(join(ROOT, 'src', 'config', 'env.ts'), 'utf8');
    const accesses = env.match(/process\.env\.[A-Z0-9_]+/g) ?? [];
    expect(accesses.length).toBeGreaterThan(0);
    for (const access of accesses) {
      expect(access).toMatch(/^process\.env\.EXPO_PUBLIC_/);
    }
  });
});
