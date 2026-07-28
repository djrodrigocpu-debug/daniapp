/**
 * PROVA ESTÁTICA — mesmo defeito do "Parceiro não existente" (fatia 5F),
 * encontrado em mais três pontos na auditoria da fatia 5G: `ActionsProvider`,
 * `ValidationsProvider` e `usePerformance` resolviam a operação real por
 * `data.operations` (store local de demonstração), a mesma fonte errada já
 * corrigida em `EvaluationsProvider`.
 *
 * Sintoma direto: clicar "Abrir Gestão Assistida" em qualquer Parceiro AACE
 * real mostrava "Parceiro AACE não encontrado" — a mesmíssima mensagem do bug
 * original, um clique adiante.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const arquivos = {
  evaluations: ler('src/context/EvaluationsProvider.tsx'),
  actions: ler('src/context/ActionsProvider.tsx'),
  validations: ler('src/context/ValidationsProvider.tsx'),
  performance: ler('src/context/usePerformance.ts'),
};

describe('resolução de Operação real — os quatro pontos usam a lista já carregada', () => {
  for (const [nome, fonte] of Object.entries(arquivos)) {
    it(`${nome} — importa e consome useOperations()`, () => {
      expect(fonte).toContain("from './OperationsProvider'");
      expect(fonte).toMatch(/useOperations\(\)/);
    });

    it(`${nome} — getOperation não lê mais data.operations (store local)`, () => {
      expect(fonte).not.toMatch(/getOperation:?\s*[:=]?\s*\(?.*?data\.operations/);
      expect(fonte).not.toContain('data.operations.find');
    });

    it(`${nome} — getOperation resolve por operations.find`, () => {
      expect(fonte).toContain('operations.find((o) => o.id === id)');
    });
  }
});
