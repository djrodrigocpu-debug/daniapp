import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guarda de segurança sobre a árvore de código (Masterplan §9.2, §13.3;
 * Anexo D — T03 e T30).
 *
 * Distingue dois tipos de achado:
 *  - VALOR de segredo (senha demo, token JWT embutido): proibido em QUALQUER
 *    arquivo de produção, sem exceção.
 *  - NOME de chave privilegiada (service role): proibido, exceto no arquivo-guarda
 *    `config/env.ts`, cuja função é justamente listar e bloquear esses nomes.
 *
 * Arquivos de teste (`*.test.ts`) são ignorados — precisam citar os padrões.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

/** Arquivos cuja razão de existir é bloquear os nomes de chave privilegiada. */
const KEY_NAME_GUARD_ALLOWLIST = new Set<string>([join('config', 'env.ts')]);

/** Padrões de VALOR de segredo — proibidos em todos os arquivos de produção. */
const SECRET_VALUE_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'senha demo Aace@2026 (T30)', regex: /Aace@2026/ },
  { label: 'token JWT embutido (chave Supabase no bundle, T03)', regex: /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./ },
];

/** Padrões de NOME de chave privilegiada — proibidos, exceto no guarda. */
const KEY_NAME_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'service role key (T03)', regex: /service[_-]?role[_-]?key/i },
  { label: 'SUPABASE_SERVICE_ROLE', regex: /SUPABASE_SERVICE_ROLE/ },
  { label: 'SUPABASE_JWT_SECRET', regex: /SUPABASE_JWT_SECRET/ },
];

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.expo' || entry === 'dist') continue;
      collectSourceFiles(full, acc);
    } else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(full))) {
      if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
      acc.push(full);
    }
  }
  return acc;
}

describe('varredura de segredos no bundle (T03/T30)', () => {
  const files = collectSourceFiles(SRC);

  it('encontra arquivos de código para varrer', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const { label, regex } of SECRET_VALUE_PATTERNS) {
    it(`nenhum arquivo de produção contém VALOR de segredo: ${label}`, () => {
      const offenders = files.filter((f) => regex.test(readFileSync(f, 'utf8')));
      expect(offenders, `Valor de segredo encontrado em:\n${offenders.join('\n')}`).toEqual([]);
    });
  }

  for (const { label, regex } of KEY_NAME_PATTERNS) {
    it(`nenhum arquivo (exceto guarda) menciona NOME de chave privilegiada: ${label}`, () => {
      const offenders = files.filter((f) => {
        const rel = relative(SRC, f).split('/').join(sep);
        if (KEY_NAME_GUARD_ALLOWLIST.has(rel)) return false;
        return regex.test(readFileSync(f, 'utf8'));
      });
      expect(offenders, `Nome de chave privilegiada fora do guarda em:\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});
