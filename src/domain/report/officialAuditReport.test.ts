/**
 * Modelo de domínio e código de integridade do Relatório Oficial de Auditoria.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCanonicalContent,
  buildOfficialAuditReportModel,
  buildReportFileName,
  formatPeriodBR,
  normalizeText,
  sanitizeFileNamePart,
  REPORT_FORMAT_VERSION,
} from './officialAuditReport';
import { reportInputFixture, JUSTIFICATIVA_LONGA, OBSERVACAO_LONGA } from './officialAuditReportFixture';

const AGORA = '2026-09-02T10:15:30.000Z';

function modelo(input = reportInputFixture(), agora = AGORA) {
  const r = buildOfficialAuditReportModel(input, agora);
  if (!r.ok) throw r.error;
  return r.value;
}

describe('modelo do relatório oficial', () => {
  it('preserva o score oficial sem recalcular e deriva a classificação pelas faixas do produto', () => {
    // A soma ponderada das respostas do fixture NÃO dá 82,5 — e o relatório tem
    // que imprimir o que o snapshot registrou, não o que a conta daria.
    const m = modelo(reportInputFixture({ score: 82.5 }));
    expect(m.summary.scoreLabel).toBe('82.5');
    expect(m.cover.scoreLabel).toBe('82.5');

    expect(modelo(reportInputFixture({ score: 92 })).cover.classification).toBe('Excelência');
    expect(modelo(reportInputFixture({ score: 82.5 })).cover.classification).toBe('Alta performance');
    expect(modelo(reportInputFixture({ score: 74 })).cover.classification).toBe('Em desenvolvimento');
    expect(modelo(reportInputFixture({ score: 61 })).cover.classification).toBe('Atenção');
    expect(modelo(reportInputFixture({ score: 40 })).cover.classification).toBe('Crítico');
  });

  it('ordena o checklist pelo código do catálogo, não pelo título nem pela ordem de chegada', () => {
    const embaralhado = reportInputFixture();
    embaralhado.official.answers = [...embaralhado.official.answers].reverse();
    const codigos = modelo(embaralhado).checklist.map((i) => i.code);
    expect(codigos).toEqual([...codigos].sort());
    expect(codigos[0]).toBe('T02');
  });

  it('calcula as contagens derivadas e elas fecham com o total', () => {
    const s = modelo().summary;
    expect(s.total).toBe(16);
    expect(s.conforming).toBe(11);
    expect(s.attention).toBe(3);
    expect(s.nonConforming).toBe(1);
    expect(s.notApplicable).toBe(1);
    expect(s.withEvidence).toBe(2);
    expect(s.conforming + s.attention + s.nonConforming + s.notApplicable + s.notEvaluated)
      .toBe(s.total);
  });

  it('preserva o não aplicável com a justificativa integral', () => {
    const na = modelo().checklist.find((i) => i.notApplicable);
    expect(na?.code).toBe('T22');
    expect(na?.notApplicableReason).toBe(normalizeText(JUSTIFICATIVA_LONGA));
    expect(na?.statusLabel).toBe('Não aplicável');
  });

  it('marca os planos como situação ATUAL, datada, ordenada por prazo e fora do bloco oficial', () => {
    const m = modelo();
    expect(m.plansReadAtLabel).toBe('02/09/2026 10:15 UTC');
    // Ordem por PRAZO — o que vence primeiro aparece primeiro, e não a ordem em
    // que os planos foram criados.
    expect(m.plans.map((p) => p.code)).toEqual(['T11', 'T04']);
    expect(m.plans[0].validationLabel).toContain('Validado por Validadora Fictícia');
    expect(m.plans[0].overdue).toBe(false);
    expect(m.plans[1].overdue).toBe(true);
    expect(m.plans[1].statusLabel).toBe('Em andamento');
  });

  it('ordena as evidências por item e por nome, com tipo e tamanho legíveis', () => {
    const m = modelo();
    expect(m.evidences.map((e) => `${e.code}/${e.name}`)).toEqual([
      'T02/Funil_oportunidades.png',
      'T02/Relatorio_producao_julho.pdf',
      'T07/Dashboard_churn.pdf',
    ]);
    expect(m.evidences[0].kindLabel).toBe('Imagem');
    expect(m.evidences[2].sizeLabel).toBe('1.5 MB');
  });

  it('abrevia identificadores e não deixa e-mail, caminho, URL nem token no que é apresentado', () => {
    const m = modelo();
    expect(m.evaluationCode).toBe('3F2A91C4');
    expect(m.snapshotCode).toBe('A81C6D20');

    // `canonicalContent` fica de fora: é a entrada do resumo criptográfico, e
    // os identificadores integrais PRECISAM entrar nele — é o que amarra o
    // código de integridade a esta avaliação e a este snapshot, e não a outra
    // auditoria de conteúdo igual. Ele nunca é impresso; o teste do PDF prova
    // que nenhum UUID chega ao documento.
    const apresentado = JSON.stringify({ ...m, canonicalContent: undefined });
    expect(apresentado).not.toContain('3f2a91c4-77bd-4e0a-9c31-0b5d2e7a4f18');
    expect(apresentado).not.toContain('@');
    expect(apresentado).not.toMatch(/https?:\/\//);
    expect(apresentado).not.toContain('evidencias/');
    expect(apresentado).not.toMatch(/\btoken\b/i);
  });

  it('recusa entrada truncada em vez de emitir documento oficial incompleto', () => {
    const semRespostas = reportInputFixture();
    semRespostas.official.answers = [];
    const a = buildOfficialAuditReportModel(semRespostas, AGORA);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error.message).toMatch(/não tem respostas/);

    const semSnapshot = reportInputFixture();
    (semSnapshot as { snapshotId: string }).snapshotId = '';
    const b = buildOfficialAuditReportModel(semSnapshot, AGORA);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe('validation/invalid-input');
  });
});

describe('código de integridade', () => {
  it('é estável e independe do que é volátil: hora de geração, planos e data de leitura', () => {
    expect(modelo().integrity.fullCode).toMatch(/^[0-9a-f]{64}$/);
    expect(modelo().integrity.fullCode).toBe(modelo().integrity.fullCode);

    const cedo = modelo(reportInputFixture(), '2026-09-02T10:15:30.000Z');
    const tarde = modelo(reportInputFixture(), '2027-01-31T23:59:59.000Z');
    expect(tarde.integrity.fullCode).toBe(cedo.integrity.fullCode);
    expect(tarde.integrity.generatedAtLabel).not.toBe(cedo.integrity.generatedAtLabel);

    expect(modelo(reportInputFixture({ plans: [] })).integrity.fullCode)
      .toBe(modelo(reportInputFixture()).integrity.fullCode);
    expect(modelo(reportInputFixture({ readAt: '2028-04-01T00:00:00.000Z' })).integrity.fullCode)
      .toBe(modelo(reportInputFixture({ readAt: '2026-09-02T10:15:00.000Z' })).integrity.fullCode);
  });

  it('MUDA quando qualquer conteúdo oficial muda', () => {
    const base = modelo().integrity.fullCode;

    const outraResposta = reportInputFixture();
    outraResposta.official.answers = outraResposta.official.answers.map((a) =>
      a.code === 'T05' ? { ...a, status: 'red' } : a);
    expect(modelo(outraResposta).integrity.fullCode).not.toBe(base);

    const outroComentario = reportInputFixture();
    outroComentario.official.answers = outroComentario.official.answers.map((a) =>
      a.code === 'T02' ? { ...a, observation: `${OBSERVACAO_LONGA} Acréscimo.` } : a);
    expect(modelo(outroComentario).integrity.fullCode).not.toBe(base);

    expect(modelo(reportInputFixture({ score: 82.6 })).integrity.fullCode).not.toBe(base);

    const menosEvidencias = reportInputFixture();
    menosEvidencias.official.evidenceIndex = menosEvidencias.official.evidenceIndex.slice(0, 1);
    expect(modelo(menosEvidencias).integrity.fullCode).not.toBe(base);
  });

  it('canonicaliza de forma estável, sem depender da ordem das respostas nem das chaves', () => {
    const embaralhado = reportInputFixture();
    embaralhado.official.answers = [...embaralhado.official.answers].reverse();
    expect(modelo(embaralhado).integrity.fullCode).toBe(modelo().integrity.fullCode);

    const canonico = buildCanonicalContent(reportInputFixture());
    expect(buildCanonicalContent(JSON.parse(JSON.stringify(reportInputFixture())))).toBe(canonico);
    expect(canonico.split('\n')[0]).toBe(`formato=${REPORT_FORMAT_VERSION}`);

    // E o volátil fica de fora do texto resumido.
    expect(canonico).not.toContain('readAt');
    expect(canonico).not.toContain('Reinstituir a reunião semanal');
    expect(canonico).not.toContain('overdue');
    expect(canonico).not.toMatch(/https?:\/\//);
  });

  it('imprime um prefixo legível agrupado de quatro em quatro', () => {
    const m = modelo();
    expect(m.integrity.displayCode).toMatch(/^([0-9A-F]{4} ){4}[0-9A-F]{4}$/);
    expect(m.integrity.displayCode.replace(/ /g, '').toLowerCase())
      .toBe(m.integrity.fullCode.slice(0, 20));
  });
});

describe('normalização e nome do arquivo', () => {
  it('unifica quebras de linha, apara espaços e compõe acentos', () => {
    expect(normalizeText('  linha um \r\n\r\n\r\n  linha dois  ')).toBe('linha um\n\nlinha dois');
    expect(normalizeText(null)).toBe('');
    // "ç"/"ã" prontos e "c + cedilha"/"a + til" são a mesma palavra — e têm que
    // gerar o mesmo resumo.
    expect(normalizeText('situação')).toBe(normalizeText('situação'));
  });

  it('sanea o nome do parceiro preservando a legibilidade', () => {
    expect(sanitizeFileNamePart('Parceiro Exemplo Comunicações Ltda.'))
      .toBe('Parceiro_Exemplo_Comunicacoes_Ltda');
    expect(sanitizeFileNamePart('A/B:C*D?E"F<G>H|I')).toBe('A_B_C_D_E_F_G_H_I');
    expect(sanitizeFileNamePart('   ')).toBe('Parceiro');
    expect(sanitizeFileNamePart('x'.repeat(200))).toHaveLength(40);
  });

  it('monta o nome no formato acordado, sem UUID integral e sem caractere reservado', () => {
    const nome = buildReportFileName('Parceiro Exemplo Comunicações Ltda.', '2026-07', 'abcdef1234567890');
    expect(nome).toBe('AAPEx_Relatorio_Auditoria_Parceiro_Exemplo_Comunicacoes_Ltda_2026-07_abcdef12.pdf');
    expect(nome).not.toMatch(/[\\/:*?"<>|]/);

    const m = modelo();
    expect(m.fileName.startsWith('AAPEx_Relatorio_Auditoria_Parceiro_Exemplo')).toBe(true);
    expect(m.fileName).toContain(m.integrity.fullCode.slice(0, 8));
  });

  it('escreve a competência por extenso', () => {
    expect(formatPeriodBR('2026-07')).toBe('Julho de 2026');
    expect(formatPeriodBR('2026-03')).toBe('Março de 2026');
    expect(formatPeriodBR('lixo')).toBe('lixo');
  });
});
