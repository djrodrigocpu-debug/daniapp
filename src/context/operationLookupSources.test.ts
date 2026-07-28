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

/**
 * Remove comentários antes de asseverar ausência: a documentação destes
 * módulos cita `data.evaluations` justamente para registrar que NÃO é mais
 * usada, e a prova acusaria o próprio comentário. O que interessa é o código
 * executável.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(new RegExp(String.fromCharCode(13), 'g'), '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((linha) => linha.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const ler = (caminho: string) => semComentarios(readFileSync(join(RAIZ, caminho), 'utf8'));

const arquivos = {
  evaluations: ler('src/context/EvaluationsProvider.tsx'),
  actions: ler('src/context/ActionsProvider.tsx'),
  validations: ler('src/context/ValidationsProvider.tsx'),
  performance: ler('src/context/usePerformance.ts'),
};

describe('resolução de USUÁRIO e AVALIAÇÃO reais — sem seed de demonstração', () => {
  it('1 — getUser vem do diretório compartilhado, não de data.users', () => {
    for (const fonte of [arquivos.evaluations, arquivos.validations]) {
      expect(fonte).toContain("from './DirectoryProvider'");
      expect(fonte).toContain('useDirectory()');
      expect(fonte).not.toContain('data.users.find');
    }
  });

  it('2 — getEvaluation/listByOperation/getCurrentDraft não leem data.evaluations', () => {
    expect(arquivos.evaluations).not.toContain('data.evaluations');
    expect(arquivos.evaluations).toContain('repo.listVisible()');
  });

  it('6 — avaliação recém-criada é recarregada antes de a tela navegar', () => {
    // Sem este await, a tela navegaria para uma avaliação que o provider
    // ainda não conhece — e mostraria "não encontrada".
    const trecho = arquivos.evaluations.slice(
      arquivos.evaluations.indexOf('const startEvaluation'),
      arquivos.evaluations.indexOf('const saveAnswer'),
    );
    expect(trecho).toContain('await load()');
  });

  it('4 — o diretório resolve por UUID e é indexado, sem consulta por item', () => {
    const dir = ler('src/context/DirectoryProvider.tsx');
    expect(dir).toContain('new Map(users.map((u) => [u.id, u]))');
    expect(dir).toContain('byId.get(id)');
    // Nenhuma busca por nome/e-mail substituindo a chave canônica.
    expect(dir).not.toMatch(/find\(\s*\(?u\)?\s*=>\s*u\.(name|email)/);
  });

  it('3 — o modo demonstração continua com o store local como fonte', () => {
    const dir = ler('src/context/DirectoryProvider.tsx');
    expect(dir).toMatch(/source !== 'local'/);
    const repoDir = ler('src/data/repositories/DirectoryRepository.ts');
    expect(repoDir).toContain('class LocalDirectoryRepository');
    expect(repoDir).toContain('class SupabaseDirectoryRepository');
  });
});

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
