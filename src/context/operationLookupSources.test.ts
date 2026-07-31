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

describe('resolução de PLANO DE AÇÃO e EVIDÊNCIA reais — sem seed de demonstração', () => {
  it('10/11 — getActionPlan e getEvidences não leem mais o store local', () => {
    expect(arquivos.evaluations).not.toContain('data.actionPlans');
    expect(arquivos.evaluations).not.toContain('data.evidences');
    // As coleções vêm dos repositórios do modo vigente, uma consulta cada.
    expect(arquivos.evaluations).toContain('actionsRepo.listByScope(scopeFromUser(user))');
    expect(arquivos.evaluations).toContain('repo.listVisibleEvidences()');
  });

  it('13/14 — as mutações recarregam antes de a tela reler o estado', () => {
    // Duas formas valem, e as duas recarregam: `.then(() => load())` para a
    // mutação que não devolve resultado, e `await load()` para as de evidência,
    // que desde a 1.3.1 devolvem sucesso ou falha ao chamador (D-02) e por isso
    // precisam esperar a recarga antes de responder.
    for (const mutacao of ['addEvidence', 'saveActionPlan', 'removeEvidence']) {
      const inicio = arquivos.evaluations.indexOf(`const ${mutacao}`);
      const trecho = arquivos.evaluations.slice(inicio, inicio + 400);
      expect(trecho, `${mutacao} não recarrega`).toMatch(/\.then\(\(\) => load\(\)\)|await load\(\)/);
    }
  });

  it('15/19/20 — evidências indexadas por UUID, sem busca por nome e sem consulta por item', () => {
    expect(arquivos.evaluations).toContain('new Map(evidences.map((e) => [e.id, e]))');
    expect(arquivos.evaluations).toContain('evidenceById.get(id)');
    expect(arquivos.evaluations).not.toMatch(/find\(\s*\(?e\)?\s*=>\s*e\.(name|uri)\b/);
  });

  it('16/17/18 — a tela de avaliação distingue carregando, erro e inexistência', () => {
    const tela = ler('src/screens/EvaluationScreen.tsx');
    expect(tela).toContain('decideOperationDetailState');
    expect(tela).toMatch(/detailState === 'loading'/);
    expect(tela).toMatch(/detailState === 'error'/);
    // "não encontrada" só depois do estado confirmado.
    expect(tela.indexOf("detailState === 'loading'")).toBeLessThan(tela.indexOf('Avaliação não encontrada'));
  });
});

describe('GESTÃO ASSISTIDA — indicadores, planos e visitas sem seed de demonstração', () => {
  it('1/2/3 — as quatro coleções deixaram de sair do store local', () => {
    for (const colecao of ['data.indicatorResults', 'data.indicatorDefinitions', 'data.actionPlans', 'data.visitReports']) {
      expect(arquivos.performance).not.toContain(colecao);
    }
    // O snapshot do store deixou de ser lido diretamente pelo hook.
    expect(arquivos.performance).not.toContain('localStore.getSnapshot');
  });

  it('1/3 — indicadores, resultados e visitas vêm do repositório do modo vigente', () => {
    for (const leitura of ['perfRepo.listIndicatorDefinitions()', 'perfRepo.listIndicatorResults()', 'perfRepo.listVisitReports()']) {
      expect(arquivos.performance).toContain(leitura);
    }
    const repo = ler('src/data/repositories/PerformanceRepository.ts');
    expect(repo).toContain("from('ui_indicators')");
    expect(repo).toContain("from('indicator_results')");
    expect(repo).toContain("from('visit_reports')");
  });

  it('2/7 — os planos reusam a coleção corporativa da aba Ações, sem repositório novo', () => {
    expect(arquivos.performance).toContain("from './ActionsProvider'");
    expect(arquivos.performance).toContain('useActions()');
    // Nenhuma consulta paralela de planos criada dentro do hook.
    expect(arquivos.performance).not.toContain('listByScope');
  });

  it('4 — o modo demonstração mantém store e reatividade', () => {
    expect(arquivos.performance).toMatch(/source !== 'local'/);
    expect(arquivos.performance).toContain('localStore.subscribe');
    const repo = ler('src/data/repositories/PerformanceRepository.ts');
    expect(repo).toContain('class LocalPerformanceRepository');
    expect(repo).toContain('class SupabasePerformanceRepository');
  });

  it('6/8/13/14 — associação por chave canônica indexada, sem busca por nome e sem N+1', () => {
    expect(arquivos.performance).toContain('resultsByOperation.get(operationId)');
    expect(arquivos.performance).toContain('plansByOperation.get(operationId)');
    expect(arquivos.performance).toContain('latestReportByOperation.get(operationId)');
    expect(arquivos.performance).not.toMatch(/find\(\s*\(?\w\)?\s*=>\s*\w\.(name|email|title|partnerName)\b/);
  });

  it('10/11/12 — a tela distingue carregando, erro e inexistência do parceiro', () => {
    const tela = ler('src/screens/PerformanceScreen.tsx');
    expect(tela).toContain('decideOperationDetailState');
    expect(tela).toMatch(/detailState === 'loading'/);
    expect(tela).toMatch(/detailState === 'error'/);
    expect(tela.indexOf("detailState === 'loading'")).toBeLessThan(tela.indexOf('Parceiro AACE não encontrado'));
  });

  it('9 — catálogo vazio não é anunciado como "dentro da meta"', () => {
    const tela = ler('src/screens/PerformanceScreen.tsx');
    // O bloco verde só pode ser alcançado DEPOIS de descartar catálogo vazio e
    // parceiro sem resultado; sem isso, zero indicador virava boa notícia.
    const vazio = tela.indexOf('!indicatorDefinitions.length');
    const semResultado = tela.indexOf('!items.length');
    const naMeta = tela.indexOf('Todos os indicadores estão dentro da meta');
    expect(vazio).toBeGreaterThan(-1);
    expect(vazio).toBeLessThan(semResultado);
    expect(semResultado).toBeLessThan(naMeta);
    // E nenhum indicador é fabricado quando o servidor não entrega definição.
    expect(tela).not.toContain('indicatorDefinitions.find((item) => item.id === result.indicatorId)!');
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
