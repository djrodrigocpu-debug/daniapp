/**
 * Desenho do **Relatório Oficial da Auditoria Mensal** em PDF (AAPEx 1.3.5).
 *
 * GERADOR INDEPENDENTE. Não é o de 1.3.3 com um parâmetro, e a razão está no
 * cabeçalho de `monthlyAuditReport.ts`: os dois documentos congelam coisas
 * diferentes, e um `if` decidindo se o plano entra no hash seria o ponto em que
 * os dois contratos passariam a divergir em silêncio.
 *
 * O QUE É REUTILIZADO, e por que pode ser: `pdfDocument.ts` — páginas, fontes,
 * medição de texto, retângulos e linhas. São **primitivas visuais sem
 * acoplamento semântico**: não sabem o que é auditoria, nota, critério ou
 * snapshot. Reescrevê-las produziria duas implementações de WinAnsi para
 * manter, e nenhuma garantia a mais.
 *
 * PAGINAÇÃO. Toda escrita passa por `garantirEspaco`. Um bloco só começa se
 * couber pelo menos o cabeçalho e a primeira linha — nenhum título fica órfão
 * no pé da página, e o documento nunca termina em folha em branco.
 *
 * TERMINOLOGIA D8, e ela é obrigatória: este documento se chama **"Relatório
 * Oficial da Auditoria Mensal"**. **"Relatório oficial da operação"** é a fonte
 * EXTERNA que o Gerente de Canal consulta antes da visita. Se os dois se
 * chamarem igual, o usuário procura o número no lugar errado.
 */
import { MonthlyAuditReportModel, MonthlyReportCriterion } from '../monthlyAuditReport';
import { A4_HEIGHT, A4_WIDTH, PdfDocument, wrapText, type RGB } from './pdfDocument';

const MARGIN_X = 48;
const MARGIN_TOP = 52;
const FOOTER_Y = A4_HEIGHT - 34;
const CONTENT_BOTTOM = A4_HEIGHT - 62;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;

const PRIMARY: RGB = { r: 0.843, g: 0.098, b: 0.125 };
const INK: RGB = { r: 0.125, g: 0.126, b: 0.141 };
const MUTED: RGB = { r: 0.42, g: 0.44, b: 0.48 };
const RULE: RGB = { r: 0.85, g: 0.86, b: 0.88 };
const SOFT: RGB = { r: 0.965, g: 0.969, b: 0.976 };
const WHITE: RGB = { r: 1, g: 1, b: 1 };

/**
 * A cor de cada resposta. **Nunca é o único sinal** — o rótulo textual
 * acompanha em todos os lugares em que a cor aparece.
 */
const ANSWER_COLOR: Record<string, RGB> = {
  conforme: { r: 0.11, g: 0.53, b: 0.30 },
  nao_conforme: { r: 0.78, g: 0.14, b: 0.16 },
  nao_aplicavel: { r: 0.20, g: 0.40, b: 0.70 },
  nao_avaliado: MUTED,
};

class Layout {
  y = MARGIN_TOP;
  private aberta = false;

  constructor(readonly doc: PdfDocument) {}

  private abrir(): void {
    if (!this.aberta) { this.doc.addPage(); this.aberta = true; }
  }

  novaPagina(): void {
    this.doc.addPage();
    this.aberta = true;
    this.y = MARGIN_TOP;
  }

  garantirEspaco(altura: number): void {
    this.abrir();
    if (this.y + altura > CONTENT_BOTTOM) this.novaPagina();
  }

  espaco(pontos: number): void { this.y += pontos; }

  texto(value: string, opts: { size?: number; font?: 'regular' | 'bold'; color?: RGB; x?: number; leading?: number } = {}): void {
    const { size = 9.5, font = 'regular', color = INK, x = MARGIN_X, leading = size * 1.42 } = opts;
    this.garantirEspaco(leading);
    this.doc.text(x, this.y + size, value, { size, font, color });
    this.y += leading;
  }

  paragrafo(value: string, opts: { size?: number; font?: 'regular' | 'bold'; color?: RGB; x?: number; width?: number } = {}): void {
    const { size = 9.5, font = 'regular', color = INK, x = MARGIN_X, width = CONTENT_WIDTH } = opts;
    const leading = size * 1.42;
    for (const linha of wrapText(value, font, size, width)) {
      this.garantirEspaco(leading);
      this.doc.text(x, this.y + size, linha, { size, font, color });
      this.y += leading;
    }
  }

  regua(): void {
    this.garantirEspaco(8);
    this.doc.line(MARGIN_X, this.y, A4_WIDTH - MARGIN_X, this.y, { color: RULE });
    this.y += 8;
  }

  secao(titulo: string): void {
    this.garantirEspaco(46);
    this.espaco(6);
    this.doc.text(MARGIN_X, this.y + 12, titulo.toUpperCase(), { size: 11.5, font: 'bold', color: PRIMARY });
    this.y += 18;
    this.doc.line(MARGIN_X, this.y, A4_WIDTH - MARGIN_X, this.y, { color: PRIMARY, width: 1.2 });
    this.y += 12;
  }
}

function campo(l: Layout, rotulo: string, valor: string): void {
  const larguraRotulo = 142;
  const linhas = wrapText(valor || '—', 'regular', 9.5, CONTENT_WIDTH - larguraRotulo);
  const altura = Math.max(linhas.length, 1) * 13.5;
  l.garantirEspaco(altura);
  l.doc.text(MARGIN_X, l.y + 9.5, rotulo, { size: 8.5, font: 'bold', color: MUTED });
  linhas.forEach((linha, i) => {
    l.doc.text(MARGIN_X + larguraRotulo, l.y + 9.5 + i * 13.5, linha, { size: 9.5, color: INK });
  });
  l.y += altura;
}

export interface RenderMonthlyOptions {
  usageClassification?: string;
}

export function renderMonthlyAuditReportPdf(
  model: MonthlyAuditReportModel,
  options: RenderMonthlyOptions = {},
): Uint8Array {
  const doc = new PdfDocument({
    title: `Relatório Oficial da Auditoria Mensal — ${model.cover.partnerName} — ${model.cover.competenceLabel}`,
    author: 'AAPEx',
    subject: 'Relatório Oficial da Auditoria Mensal do Parceiro AACE',
    creator: `AAPEx ${model.integrity.formatVersion}`,
  });
  const l = new Layout(doc);

  capa(l, model);
  identificacao(l, model);
  resumo(l, model);
  criterios(l, model);
  planos(l, model);
  integridade(l, model);
  rodape(doc, model, options.usageClassification);

  return doc.build();
}

// ---------------------------------------------------------------------------
// Capa
// ---------------------------------------------------------------------------
function capa(l: Layout, m: MonthlyAuditReportModel): void {
  l.novaPagina();
  const doc = l.doc;

  doc.rect(0, 0, A4_WIDTH, 138, PRIMARY);
  doc.text(MARGIN_X, 52, 'AAPEx', { size: 26, font: 'bold', color: WHITE });
  doc.text(MARGIN_X, 74, 'Avaliação de Parceiros AACE de Excelência', { size: 9.5, color: WHITE });
  doc.text(MARGIN_X, 108, 'RELATÓRIO OFICIAL DA AUDITORIA MENSAL', { size: 14, font: 'bold', color: WHITE });

  l.y = 178;
  l.texto(m.cover.partnerName, { size: 22, font: 'bold' });
  l.texto(m.cover.competenceLabel, { size: 10.5, color: MUTED });

  l.espaco(24);
  const painelY = l.y;
  doc.rect(MARGIN_X, painelY, CONTENT_WIDTH, 108, SOFT);
  doc.line(MARGIN_X, painelY, MARGIN_X, painelY + 108, { color: PRIMARY, width: 3 });

  doc.text(MARGIN_X + 20, painelY + 26, 'PONTUAÇÃO DO PROCESSO', { size: 8, font: 'bold', color: MUTED });
  // Quando não há nota, o painel imprime a frase inteira em corpo menor — nunca
  // um zero, e nunca um traço que o leitor possa ler como "zero".
  if (m.cover.sufficient) {
    doc.text(MARGIN_X + 20, painelY + 66, m.cover.scoreLabel, { size: 38, font: 'bold', color: PRIMARY });
  } else {
    doc.text(MARGIN_X + 20, painelY + 58, m.cover.scoreLabel, { size: 16, font: 'bold', color: MUTED });
    doc.text(MARGIN_X + 20, painelY + 78, m.cover.insufficiencyLabel, { size: 8.5, color: MUTED });
  }

  const colX = MARGIN_X + 240;
  doc.text(colX, painelY + 26, 'COMPETÊNCIA', { size: 8, font: 'bold', color: MUTED });
  doc.text(colX, painelY + 42, m.cover.competenceLabel, { size: 11, font: 'bold', color: INK });
  doc.text(colX, painelY + 64, 'PERÍODO', { size: 8, font: 'bold', color: MUTED });
  doc.text(colX, painelY + 80, m.cover.periodLabel, { size: 9.5, color: INK });

  const col2X = MARGIN_X + 380;
  doc.text(col2X, painelY + 26, 'APROVADA POR', { size: 8, font: 'bold', color: MUTED });
  doc.text(col2X, painelY + 42, m.cover.approvedByLabel, { size: 9.5, font: 'bold', color: INK });
  doc.text(col2X, painelY + 64, 'APROVADA EM', { size: 8, font: 'bold', color: MUTED });
  doc.text(col2X, painelY + 80, m.cover.approvedAtLabel, { size: 9.5, color: INK });

  l.y = painelY + 108 + 30;
  l.paragrafo(
    'Este documento reproduz o conteúdo oficial e imutável da Auditoria Mensal no momento da sua '
    + 'aprovação. A Auditoria Mensal verifica se o processo que sustenta o resultado existe, está '
    + 'implantado e é executado — ela não mede o resultado em si.',
    { size: 9.5, color: MUTED },
  );
  l.espaco(6);
  l.paragrafo(
    'Os números de desempenho do parceiro têm origem no relatório oficial da operação, que é fonte '
    + 'externa e não faz parte deste documento.',
    { size: 8.5, color: MUTED },
  );
}

// ---------------------------------------------------------------------------
// Identificação
// ---------------------------------------------------------------------------
function identificacao(l: Layout, m: MonthlyAuditReportModel): void {
  l.novaPagina();
  l.secao('Identificação da auditoria');
  campo(l, 'Parceiro AACE', m.identification.partnerName);
  campo(l, 'Competência', m.identification.competence);
  campo(l, 'Período', m.identification.periodLabel);
  campo(l, 'Situação oficial', m.identification.statusLabel);
  campo(l, 'Aprovada por', m.identification.approvedBy);
  campo(l, 'Aprovada em', m.identification.approvedAtLabel);
  campo(l, 'Modelo', 'Auditoria Mensal por critérios de processo');
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------
function resumo(l: Layout, m: MonthlyAuditReportModel): void {
  l.secao('Resumo');

  campo(l, 'Pontuação do processo', m.summary.scoreLabel);
  if (!m.summary.sufficient) {
    campo(l, 'Motivo', m.summary.insufficiencyLabel);
  }
  campo(l, 'Critérios avaliados', String(m.summary.totalCriteria));
  campo(l, 'Critérios aplicáveis', String(m.summary.applicableCriteria));
  campo(l, 'Conformes', String(m.summary.conformCount));
  campo(l, 'Não conformes', String(m.summary.nonConformCount));
  campo(l, 'Não aplicáveis', String(m.summary.notApplicableCount));
  if (m.summary.notEvaluatedCount > 0) {
    campo(l, 'Não avaliados', String(m.summary.notEvaluatedCount));
  }

  const estados = Object.keys(m.summary.plansByStatus).sort();
  if (estados.length > 0) {
    campo(l, 'Planos por estado',
      estados.map((e) => `${e}: ${m.summary.plansByStatus[e]}`).join('   ·   '));
  }

  l.espaco(8);
  l.paragrafo(
    'A pontuação do processo é a proporção de critérios conformes entre os critérios aplicáveis. '
    + 'Critérios marcados como não aplicáveis ficam fora do numerador e do denominador. '
    + 'Quando não há critério aplicável, não existe pontuação — e a ausência não equivale a zero.',
    { size: 8.5, color: MUTED },
  );
  l.espaco(4);
  l.paragrafo(
    'A pontuação do processo não é a ponderação entre módulos e não é o Índice de Excelência.',
    { size: 8.5, font: 'bold', color: MUTED },
  );
}

// ---------------------------------------------------------------------------
// Critérios, agrupados por tema e indicador
// ---------------------------------------------------------------------------
function criterios(l: Layout, m: MonthlyAuditReportModel): void {
  l.novaPagina();
  l.secao('Critérios de processo');

  if (m.groups.length === 0) {
    l.paragrafo('Nenhum critério foi materializado nesta auditoria.', { size: 9.5, color: MUTED });
    return;
  }

  for (const tema of m.groups) {
    l.garantirEspaco(40);
    l.espaco(4);
    l.texto(`${tema.themeCode} · ${tema.themeName}`, { size: 10.5, font: 'bold', color: PRIMARY });
    l.espaco(2);

    for (const indicador of tema.indicators) {
      l.garantirEspaco(32);
      l.texto(`${indicador.indicatorCode} · ${indicador.indicatorName}`,
        { size: 9.5, font: 'bold', color: INK });
      l.espaco(2);
      for (const c of indicador.criteria) desenharCriterio(l, c);
    }
    l.espaco(4);
  }
}

function desenharCriterio(
  l: Layout,
  c: MonthlyReportCriterion & { answerLabel: string },
): void {
  // Cabeça do bloco: código, resposta e as marcas de parametrização.
  l.garantirEspaco(56);
  const topo = l.y;
  l.doc.rect(MARGIN_X, topo, CONTENT_WIDTH, 18, SOFT);
  l.doc.text(MARGIN_X + 8, topo + 12.5, c.criterionCode, { size: 8.5, font: 'bold', color: PRIMARY });
  // A cor vem acompanhada do rótulo — cor nunca é o único sinal.
  l.doc.text(MARGIN_X + 96, topo + 12.5, c.answerLabel,
    { size: 8.5, font: 'bold', color: ANSWER_COLOR[c.answer] ?? INK });
  const marcas = [
    c.required ? 'obrigatório' : 'opcional',
    c.evidenceRequired ? 'evidência exigida' : null,
    c.allowsNa ? 'permite N/A' : null,
  ].filter(Boolean).join(' · ');
  l.doc.text(MARGIN_X + 230, topo + 12.5, marcas, { size: 7.5, color: MUTED });
  l.y = topo + 24;

  l.paragrafo(c.question, { size: 9.5, font: 'bold', x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  if (c.description) {
    l.paragrafo(c.description, { size: 8.5, color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  }
  if (c.guidance) {
    l.paragrafo(`Orientação: ${c.guidance}`,
      { size: 8.5, color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  }
  if (c.justification) {
    l.paragrafo(`Justificativa: ${c.justification}`,
      { size: 8.8, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  }
  if (c.observation) {
    l.paragrafo(`Observação: ${c.observation}`,
      { size: 8.8, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  }
  if (c.diagnosis) {
    l.paragrafo(`Diagnóstico: ${c.diagnosis}`,
      { size: 8.8, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  }

  if (c.evidences.length > 0) {
    l.paragrafo(`Evidências (${c.evidences.length}):`,
      { size: 8.2, font: 'bold', color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    for (const e of c.evidences) {
      l.paragrafo(`• ${e.name} — ${e.mimeType}`,
        { size: 8.2, color: MUTED, x: MARGIN_X + 16, width: CONTENT_WIDTH - 24 });
    }
  }

  if (c.plans.length > 0) {
    l.paragrafo(`Planos de ação (${c.plans.length}):`,
      { size: 8.2, font: 'bold', color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    for (const p of c.plans) {
      l.paragrafo(`• ${p.action} — ${p.owner || 'sem responsável'} — prazo ${p.dueDate} — ${p.status}`,
        { size: 8.2, color: MUTED, x: MARGIN_X + 16, width: CONTENT_WIDTH - 24 });
    }
  }

  l.espaco(4);
  l.regua();
}

// ---------------------------------------------------------------------------
// Planos materializados
// ---------------------------------------------------------------------------
function planos(l: Layout, m: MonthlyAuditReportModel): void {
  l.secao('Planos de ação materializados');

  if (m.plans.length === 0) {
    l.paragrafo('Nenhum plano de ação foi materializado nesta auditoria.',
      { size: 9.5, color: MUTED });
    return;
  }

  l.paragrafo(
    'Os planos abaixo são os que constavam do registro oficial no momento da aprovação. '
    + 'A situação atual deles pode ter mudado desde então, e é consultada no próprio AAPEx.',
    { size: 8.5, color: MUTED },
  );
  l.espaco(6);

  for (const p of m.plans) {
    l.garantirEspaco(48);
    const topo = l.y;
    l.doc.rect(MARGIN_X, topo, CONTENT_WIDTH, 18, SOFT);
    l.doc.text(MARGIN_X + 8, topo + 12.5, p.criterionCode, { size: 8.5, font: 'bold', color: PRIMARY });
    l.doc.text(MARGIN_X + 96, topo + 12.5, p.status, { size: 8.5, font: 'bold', color: INK });
    l.y = topo + 24;

    l.paragrafo(p.action, { size: 9, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    l.paragrafo(
      `Responsável: ${p.owner || '—'}   ·   Prazo: ${p.dueDateLabel}   ·   Prioridade: ${p.priority}`,
      { size: 8.2, color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    l.espaco(4);
    l.regua();
  }
}

// ---------------------------------------------------------------------------
// Integridade
// ---------------------------------------------------------------------------
function integridade(l: Layout, m: MonthlyAuditReportModel): void {
  l.secao('Aprovação e integridade');

  campo(l, 'Código da auditoria', m.identification.evaluationId);
  campo(l, 'Código do snapshot', m.identification.snapshotId);
  campo(l, 'Versão do formato', m.integrity.formatVersion);
  campo(l, 'Versão da regra', m.integrity.ruleVersion);
  campo(l, 'Canonicalização', m.integrity.canonicalization);
  campo(l, 'Ordenação', m.integrity.ordering);
  campo(l, 'Gerado em', m.integrity.generatedAtLabel);

  l.espaco(10);
  l.garantirEspaco(56);
  const topo = l.y;
  l.doc.rect(MARGIN_X, topo, CONTENT_WIDTH, 48, SOFT);
  l.doc.text(MARGIN_X + 14, topo + 17, 'CÓDIGO DE INTEGRIDADE', { size: 7.5, font: 'bold', color: MUTED });
  l.doc.text(MARGIN_X + 14, topo + 38, m.integrity.displayCode, { size: 15, font: 'bold', color: INK });
  l.y = topo + 56;

  l.paragrafo(
    'Documento gerado pelo AAPEx a partir do snapshot oficial imutável da Auditoria Mensal.',
    { size: 9.5, font: 'bold' });
  l.espaco(2);
  l.paragrafo(
    'O código de integridade é um resumo criptográfico do conteúdo oficial deste relatório, '
    + 'incluindo a versão do formato. Dois documentos com o mesmo código descrevem exatamente a '
    + 'mesma auditoria aprovada. A data de geração não entra nesse cálculo. Este código não é '
    + 'assinatura digital nem certificado.',
    { size: 8.5, color: MUTED });
}

// ---------------------------------------------------------------------------
// Rodapé — escrito quando o total de páginas já é conhecido
// ---------------------------------------------------------------------------
function rodape(doc: PdfDocument, m: MonthlyAuditReportModel, classificacaoDeUso?: string): void {
  const total = doc.pageCount;
  for (let i = 0; i < total; i += 1) {
    doc.selectPage(i);
    doc.line(MARGIN_X, FOOTER_Y - 10, A4_WIDTH - MARGIN_X, FOOTER_Y - 10, { color: RULE });
    doc.text(MARGIN_X, FOOTER_Y, 'AAPEx · Relatório Oficial da Auditoria Mensal',
      { size: 7.5, color: MUTED });
    const direita = `Página ${i + 1} de ${total}   ·   Gerado em ${m.integrity.generatedAtLabel}`;
    doc.text(A4_WIDTH - MARGIN_X - 232, FOOTER_Y, direita, { size: 7.5, color: MUTED });
    if (classificacaoDeUso) {
      doc.text(MARGIN_X, FOOTER_Y + 10, classificacaoDeUso, { size: 7, font: 'bold', color: MUTED });
    }
  }
}
