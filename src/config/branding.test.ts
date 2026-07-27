/**
 * Teste obrigatório 16 (AAPEx v2): o nome visível do aplicativo é "AAPEx".
 *
 * Garante também que os IDENTIFICADORES TÉCNICOS não foram renomeados
 * (slug/scheme/bundle/package — mudá-los quebraria EAS, deep links e a
 * identidade nas lojas) e que nenhum nome antigo ("AACE Excelência") ou
 * terminologia antiga de tela ("Operações AACE") sobrou na interface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
  expo: {
    name: string; slug: string; scheme: string;
    ios: { bundleIdentifier: string };
    android: { package: string };
    web: { name: string; shortName: string };
  };
};

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('nome visível do aplicativo é AAPEx (teste 16)', () => {
  it('app.json: nome do app, título web e shortName são AAPEx', () => {
    expect(appJson.expo.name).toBe('AAPEx');
    expect(appJson.expo.web.name).toBe('AAPEx');
    expect(appJson.expo.web.shortName).toBe('AAPEx');
  });

  it('identificadores técnicos permanecem intocados (compatibilidade)', () => {
    expect(appJson.expo.slug).toBe('aace-excelencia');
    expect(appJson.expo.scheme).toBe('aaceexcelencia');
    expect(appJson.expo.ios.bundleIdentifier).toBe('com.aace.excelencia');
    expect(appJson.expo.android.package).toBe('com.aace.excelencia');
  });

  it('nenhum nome antigo sobrou na interface (telas + navegação + app.json)', () => {
    const files = [
      ...listSourceFiles(join(ROOT, 'src', 'screens')),
      ...listSourceFiles(join(ROOT, 'src', 'navigation')),
      join(ROOT, 'app.json'),
    ];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content, `nome antigo em ${file}`).not.toMatch(/AACE Excel[êe]ncia/);
      expect(content, `terminologia antiga em ${file}`).not.toMatch(/Operaç[õo]es AACE/);
      expect(content, `terminologia antiga em ${file}`).not.toMatch(/Operação AACE/);
      expect(content, `aba antiga em ${file}`).not.toMatch(/name="Operações"/);
    }
  });
});
