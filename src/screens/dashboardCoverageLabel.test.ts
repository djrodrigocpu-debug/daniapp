/**
 * PROVA ESTÁTICA — rótulo "Índice médio geral" e cobertura X de Y (0026).
 * A fórmula do índice em si é coberta em domain/dashboard/metrics.test.ts;
 * aqui só se prova que a tela usa o rótulo/valores corretos, sem duplicar a
 * lógica de cálculo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const tela = readFileSync(join(__dirname, '..', '..', 'src/screens/DashboardScreen.tsx'), 'utf8');

describe('rótulo e cobertura do Índice médio geral (0026)', () => {
  it('13 — exibe "Índice médio geral", não mais "Índice médio dos Parceiros AACE"', () => {
    expect(tela).toContain('Índice médio geral');
    expect(tela).not.toContain('Índice médio dos Parceiros AACE');
  });

  it('13 — mostra a cobertura "X de Y parceiros auditados" a partir de metrics', () => {
    expect(tela).toContain('{metrics.auditedCount} de {metrics.operationsCount} parceiros auditados');
    expect(tela).toContain('Parceiros ainda sem auditoria aprovada entram como zero');
  });
});
