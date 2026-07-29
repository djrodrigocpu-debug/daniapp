/**
 * PROVA ESTÁTICA — visibilidade da aba Validações (microcorreção 0026).
 *
 * Administração passa a enxergar a MESMA aba operacional (rota/componente/
 * provider) que Coordenação e Regional já usavam — não uma tela nova, nem uma
 * segunda entrada "Validações Admin". Gerente de Canal continua sem a aba.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const nav = readFileSync(join(RAIZ, 'src/navigation/AppNavigator.tsx'), 'utf8');

describe('aba Validações — visibilidade por papel (0026)', () => {
  it('9 — a aba Validações aparece exatamente uma vez na navegação', () => {
    const ocorrencias = nav.match(/<Tabs\.Screen name="Validações"/g) ?? [];
    expect(ocorrencias.length).toBe(1);
  });

  it('9 — Administração vê a aba (mesmo componente ValidationsScreen, sem tela nova)', () => {
    expect(nav).toMatch(/canValidate\s*=[^;]*currentUser\?\.role === 'admin'/);
    expect(nav).toContain('component={ValidationsScreen}');
    expect(nav).not.toContain('ValidationsAdminScreen');
  });

  it('10 — Coordenação vê a aba', () => {
    expect(nav).toMatch(/canValidate\s*=[^;]*currentUser\?\.role === 'coordinator'/);
  });

  it('11 — Regional vê a aba', () => {
    expect(nav).toMatch(/canValidate\s*=[^;]*currentUser\?\.role === 'regional'/);
  });

  it('12 — Gerente de Canal não vê a aba', () => {
    const linha = nav.split('\n').find((l) => l.includes('const canValidate =')) ?? '';
    expect(linha).not.toContain('channel_manager');
  });
});
