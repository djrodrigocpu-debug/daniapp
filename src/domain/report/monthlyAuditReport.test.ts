/**
 * O modelo do Relatório Oficial da Auditoria Mensal (AAPEx 1.3.5).
 *
 * O que estes casos protegem é o **código de integridade**: ele precisa mudar
 * quando o conteúdo oficial muda, e precisa NÃO mudar quando muda qualquer
 * outra coisa. Um código que muda por acaso não prova nada; um que não muda
 * quando deveria prova menos ainda.
 */
import { describe, it, expect } from 'vitest';
import {
  MONTHLY_CANONICALIZATION, MONTHLY_REPORT_FORMAT_VERSION, buildMonthlyAuditReportModel,
  buildMonthlyCanonicalContent, buildMonthlyReportFileName, formatProcessScore, sortCriteria,
} from './monthlyAuditReport';
import { REPORT_FORMAT_VERSION } from './officialAuditReport';
import {
  DIAGNOSTICO_LONGO, monthlyReportInputFixture, monthlyReportInsufficientFixture,
} from './monthlyAuditReportFixture';

const codigo = (over = {}) => buildMonthlyAuditReportModel(
  monthlyReportInputFixture(over)).integrity.fullCode;

describe('as duas constantes de formato', () => {
  it('o formato mensal é 1.3.5 e o histórico continua 1.3.3', () => {
    expect(MONTHLY_REPORT_FORMAT_VERSION).toBe('1.3.5');
    expect(REPORT_FORMAT_VERSION).toBe('1.3.3');
    expect(MONTHLY_REPORT_FORMAT_VERSION).not.toBe(REPORT_FORMAT_VERSION);
  });

  it('a versão do formato PARTICIPA da canonicalização', () => {
    const canonico = buildMonthlyCanonicalContent(monthlyReportInputFixture());
    expect(canonico.split('\n')[0]).toBe(`formato=${MONTHLY_REPORT_FORMAT_VERSION}`);
    expect(canonico).toContain(`canonicalizacao=${MONTHLY_CANONICALIZATION}`);
  });

  it('o documento mensal não menciona 1.3.3 em lugar nenhum', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    expect(JSON.stringify(m)).not.toContain('1.3.3');
  });
});

describe('o código de integridade é estável quando deve ser', () => {
  it('a mesma auditoria e o mesmo snapshot dão o MESMO código', () => {
    expect(codigo()).toBe(codigo());
  });

  it('`generatedAt` NÃO altera o código — é o único campo volátil', () => {
    const a = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    const b = buildMonthlyAuditReportModel(
      monthlyReportInputFixture({ generatedAt: '2031-12-25T23:59:59.000Z' }));
    expect(b.integrity.fullCode).toBe(a.integrity.fullCode);
    // …e o rótulo de geração muda, provando que o campo realmente chegou.
    expect(b.integrity.generatedAtLabel).not.toBe(a.integrity.generatedAtLabel);
  });

  it('a ORDEM em que o conteúdo chega não altera o código', () => {
    const base = monthlyReportInputFixture();
    const invertido = monthlyReportInputFixture({ content: [...base.content].reverse() });
    expect(buildMonthlyAuditReportModel(invertido).integrity.fullCode)
      .toBe(buildMonthlyAuditReportModel(base).integrity.fullCode);
  });

  it('a ordem das evidências e dos planos também não altera o código', () => {
    const base = monthlyReportInputFixture();
    const trocado = monthlyReportInputFixture({
      content: base.content.map((c) => ({ ...c, evidences: [...c.evidences].reverse() })),
    });
    expect(buildMonthlyAuditReportModel(trocado).integrity.fullCode)
      .toBe(buildMonthlyAuditReportModel(base).integrity.fullCode);
  });
});

describe('o código de integridade MUDA quando o conteúdo protegido muda', () => {
  const base = codigo();

  it('mudar a resposta de um critério muda o código', () => {
    const f = monthlyReportInputFixture();
    f.content[0].answer = 'nao_conforme';
    expect(buildMonthlyAuditReportModel(f).integrity.fullCode).not.toBe(base);
  });

  it('mudar a pontuação muda o código', () => {
    const f = monthlyReportInputFixture();
    f.summary.processScore = 100;
    expect(buildMonthlyAuditReportModel(f).integrity.fullCode).not.toBe(base);
  });

  it('mudar o diagnóstico muda o código', () => {
    const f = monthlyReportInputFixture();
    f.content[1].diagnosis = 'outro diagnóstico';
    expect(buildMonthlyAuditReportModel(f).integrity.fullCode).not.toBe(base);
  });

  it('mudar uma evidência muda o código', () => {
    const f = monthlyReportInputFixture();
    f.content[0].evidences[0].name = 'outro-arquivo.jpg';
    expect(buildMonthlyAuditReportModel(f).integrity.fullCode).not.toBe(base);
  });

  it('mudar um plano MATERIALIZADO muda o código — e é aqui que 1.3.5 difere de 1.3.3', () => {
    // No relatório legado o plano é "situação atual" e fica FORA do hash. No
    // mensal ele foi congelado no snapshot e é parte do que a auditoria afirmou.
    const f = monthlyReportInputFixture();
    f.content[1].plans[0].owner = 'Outro Responsável';
    expect(buildMonthlyAuditReportModel(f).integrity.fullCode).not.toBe(base);
  });

  it('mudar o snapshot muda o código', () => {
    expect(codigo({
      identity: { ...monthlyReportInputFixture().identity, snapshotId: 'outro-snapshot' },
    })).not.toBe(base);
  });
});

describe('ausência NUNCA é zero', () => {
  it('nota nula vira "Dados insuficientes", e não 0,00', () => {
    expect(formatProcessScore(null)).toBe('Dados insuficientes');
    expect(formatProcessScore(0)).toBe('0,00');
    expect(formatProcessScore(66.67)).toBe('66,67');
  });

  it('nota nula entra no canônico como `ausente`, nunca como `0.00`', () => {
    const canonico = buildMonthlyCanonicalContent(monthlyReportInsufficientFixture());
    expect(canonico).toContain('pontuacaoProcesso=ausente');
    expect(canonico).not.toContain('pontuacaoProcesso=0.00');
  });

  it('"sem critério aplicável" e "zero por cento" têm códigos DIFERENTES', () => {
    // Se a ausência entrasse como zero, os dois documentos teriam o mesmo
    // resumo criptográfico — e dizer que uma auditoria sem critério aplicável
    // é igual a uma reprovada seria uma afirmação falsa sobre o parceiro.
    const ausente = buildMonthlyAuditReportModel(monthlyReportInsufficientFixture());
    const zerada = monthlyReportInsufficientFixture();
    zerada.summary.processScore = 0;
    zerada.summary.sufficient = true;
    zerada.summary.insufficiencyReasons = [];
    expect(buildMonthlyAuditReportModel(zerada).integrity.fullCode)
      .not.toBe(ausente.integrity.fullCode);
  });

  it('o modelo insuficiente diz o MOTIVO, em português', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInsufficientFixture());
    expect(m.cover.sufficient).toBe(false);
    expect(m.cover.scoreLabel).toBe('Dados insuficientes');
    expect(m.summary.insufficiencyLabel).toContain('nenhum critério aplicável');
  });
});

describe('agrupamento e ordenação', () => {
  it('os critérios saem agrupados por tema e, dentro dele, por indicador', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    expect(m.groups.map((g) => g.themeCode)).toEqual(['TEMA-01', 'TEMA-02']);
    expect(m.groups[0].indicators.map((i) => i.indicatorCode)).toEqual(['IND-011']);
    expect(m.groups[0].indicators[0].criteria.map((c) => c.criterionCode))
      .toEqual(['CRIT-011-A', 'CRIT-011-B']);
  });

  it('a ordenação é total: tema, indicador e critério', () => {
    const base = monthlyReportInputFixture();
    const ordenado = sortCriteria([...base.content].reverse());
    expect(ordenado.map((c) => c.criterionCode))
      .toEqual(['CRIT-011-A', 'CRIT-011-B', 'CRIT-021-A', 'CRIT-021-B']);
  });

  it('os planos aparecem achatados, com o critério de origem nomeado', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    expect(m.plans).toHaveLength(1);
    expect(m.plans[0].criterionCode).toBe('CRIT-011-B');
    expect(m.plans[0].dueDateLabel).toBe('30/09/2026');
  });
});

describe('o nome do arquivo', () => {
  it('identifica parceiro, competência e as oito primeiras casas do código', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    expect(m.fileName).toMatch(/^AAPEx-Auditoria-Mensal-.+-2026-07-[0-9a-f]{8}\.pdf$/);
    expect(m.fileName).not.toContain(' ');
  });

  it('não confunde o documento com o do formato legado', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    expect(m.fileName).toContain('Auditoria-Mensal');
    expect(buildMonthlyReportFileName('', '', '')).toBe(
      'AAPEx-Auditoria-Mensal-parceiro-competencia-semcodig.pdf');
  });
});

describe('o documento não carrega segredo', () => {
  it('nenhuma URL, token, e-mail ou caminho de objeto no modelo', () => {
    const t = JSON.stringify(buildMonthlyAuditReportModel(monthlyReportInputFixture()));
    expect(t).not.toMatch(/https?:\/\//);
    expect(t).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(t).not.toMatch(/evidencias\//);
    expect(t).not.toMatch(/Bearer |eyJ/);
  });

  it('o texto longo sobrevive inteiro, sem truncar', () => {
    const m = buildMonthlyAuditReportModel(monthlyReportInputFixture());
    const c = m.groups[0].indicators[0].criteria[1];
    expect(c.diagnosis).toBe(DIAGNOSTICO_LONGO);
  });
});
