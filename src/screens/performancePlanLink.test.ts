/**
 * PROVA ESTÁTICA — Fatia 6C, Bloqueio 3: o pseudoidentificador
 * `PERF_${operationId}` foi eliminado da Gestão Assistida.
 *
 * `save_action_plan` converte `evaluationId` para UUID; o valor `PERF_...`
 * abortava o fluxo inteiro de plano operacional. O vínculo canônico é a
 * OPERAÇÃO por UUID (`operationId`) com `evaluationId` vazio → NULL no
 * servidor — nunca texto em coluna UUID, nunca avaliação fictícia.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const performanceScreen = ler('src/screens/PerformanceScreen.tsx');

/** Todos os fontes executáveis de src/ (testes fora — este arquivo cita o termo). */
function fontesExecutaveis(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return fontesExecutaveis(caminho);
    if (!/\.tsx?$/.test(nome) || /\.test\.tsx?$/.test(nome)) return [];
    return [caminho];
  });
}

describe('plano operacional da Gestão Assistida (PerformanceScreen)', () => {
  it('nenhum PERF_ é produzido em lugar algum de src/', () => {
    // Sem exceção para comentários: o identificador não pode nem ser sugerido.
    const ofensores = fontesExecutaveis(join(RAIZ, 'src'))
      .filter((caminho) => readFileSync(caminho, 'utf8').includes('PERF_'));
    expect(ofensores).toEqual([]);
  });

  it('o plano vai com evaluationId vazio (NULL no servidor) e operação por UUID', () => {
    expect(performanceScreen).toContain("evaluationId: ''");
    expect(performanceScreen).toMatch(/savePlan\(\{[^}]*operationId/s);
  });

  it('reedição reaproveita o id do plano existente — clique repetido não duplica', () => {
    expect(performanceScreen).toMatch(/id:\s*selectedPlanExisting\?\.id/);
  });

  it('o resumo da visita conta os planos operacionais (sem avaliação), não um pseudo-id', () => {
    expect(performanceScreen).toMatch(/filter\(\(plan\) => !plan\.evaluationId\)/);
  });
});
