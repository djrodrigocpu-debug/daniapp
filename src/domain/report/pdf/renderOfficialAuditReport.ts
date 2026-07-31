/**
 * Desenho do Relatório Oficial de Auditoria em PDF (AAPEx 1.3.3).
 *
 * Recebe o modelo já pronto (`buildOfficialAuditReportModel`) e o transforma em
 * páginas A4. Não busca dado, não decide autorização, não formata conteúdo — o
 * que chega aqui já está ordenado, normalizado e rotulado.
 *
 * PAGINAÇÃO. Toda escrita passa por `garantirEspaco`, que abre página nova
 * quando o bloco não cabe. Um bloco só é iniciado se couber pelo menos seu
 * cabeçalho e a primeira linha, para que nenhum título fique órfão no pé da
 * página. A página nova nasce apenas quando há o que escrever nela — é assim
 * que o documento nunca termina em folha em branco.
 *
 * O RODAPÉ é escrito no fim, quando o total de páginas já é conhecido.
 */
import { OfficialAuditReportModel } from '../officialAuditReport';
import { A4_HEIGHT, A4_WIDTH, PdfDocument, ellipsize, wrapText, type RGB } from './pdfDocument';

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

const STATUS_COLOR: Record<string, RGB> = {
  green: { r: 0.11, g: 0.53, b: 0.30 },
  yellow: { r: 0.70, g: 0.47, b: 0.05 },
  red: { r: 0.78, g: 0.14, b: 0.16 },
  not_applicable: { r: 0.20, g: 0.40, b: 0.70 },
  not_evaluated: MUTED,
};

/** Cursor de escrita com paginação. */
class Layout {
  y = MARGIN_TOP;
  private aberta = false;

  constructor(readonly doc: PdfDocument) {}

  /** Abre a primeira página só quando houver conteúdo. */
  private abrir(): void {
    if (!this.aberta) { this.doc.addPage(); this.aberta = true; }
  }

  novaPagina(): void {
    this.doc.addPage();
    this.aberta = true;
    this.y = MARGIN_TOP;
  }

  /** Garante `altura` pontos livres; pagina se não houver. */
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

  /** Parágrafo com quebra medida; pagina no meio quando precisa. */
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

  /** Título de seção — nunca fica sozinho no pé da página. */
  secao(titulo: string): void {
    this.garantirEspaco(46);
    this.espaco(6);
    this.doc.text(MARGIN_X, this.y + 12, titulo.toUpperCase(), { size: 11.5, font: 'bold', color: PRIMARY });
    this.y += 18;
    this.doc.line(MARGIN_X, this.y, A4_WIDTH - MARGIN_X, this.y, { color: PRIMARY, width: 1.2 });
    this.y += 12;
  }
}

/** Par rótulo/valor em duas colunas. */
function campo(l: Layout, rotulo: string, valor: string): void {
  const larguraRotulo = 132;
  const linhas = wrapText(valor || '—', 'regular', 9.5, CONTENT_WIDTH - larguraRotulo);
  const altura = Math.max(linhas.length, 1) * 13.5;
  l.garantirEspaco(altura);
  l.doc.text(MARGIN_X, l.y + 9.5, rotulo, { size: 8.5, font: 'bold', color: MUTED });
  linhas.forEach((linha, i) => {
    l.doc.text(MARGIN_X + larguraRotulo, l.y + 9.5 + i * 13.5, linha, { size: 9.5, color: INK });
  });
  l.y += altura;
}

export interface RenderOptions {
  /** Rótulo de classificação de uso, quando o produto tiver um. */
  usageClassification?: string;
}

export function renderOfficialAuditReportPdf(
  model: OfficialAuditReportModel,
  options: RenderOptions = {},
): Uint8Array {
  const doc = new PdfDocument({
    title: `Relatório Oficial de Auditoria — ${model.cover.partnerName} — ${model.cover.periodLabel}`,
    author: 'AAPEx',
    subject: 'Relatório Oficial de Auditoria do Parceiro AACE',
    creator: `AAPEx ${model.integrity.reportVersion}`,
  });
  const l = new Layout(doc);

  capa(l, model);
  identificacao(l, model);
  resumoExecutivo(l, model);
  checklist(l, model);
  evidencias(l, model);
  planos(l, model);
  integridade(l, model);
  rodape(doc, model, options.usageClassification);

  return doc.build();
}

// ---------------------------------------------------------------------------
// Capa
// ---------------------------------------------------------------------------
function capa(l: Layout, m: OfficialAuditReportModel): void {
  l.novaPagina();
  const doc = l.doc;

  doc.rect(0, 0, A4_WIDTH, 138, PRIMARY);
  doc.text(MARGIN_X, 52, 'AAPEx', { size: 26, font: 'bold', color: WHITE });
  doc.text(MARGIN_X, 74, 'Avaliação de Parceiros AACE de Excelência', { size: 9.5, color: WHITE });
  doc.text(MARGIN_X, 108, 'RELATÓRIO OFICIAL DE AUDITORIA', { size: 15, font: 'bold', color: WHITE });

  l.y = 178;
  l.texto(m.cover.partnerName, { size: 22, font: 'bold' });
  l.texto(`${m.cover.officeName} · ${m.cover.locationLabel}`, { size: 10.5, color: MUTED });

  l.espaco(24);
  // Painel do resultado oficial.
  const painelY = l.y;
  doc.rect(MARGIN_X, painelY, CONTENT_WIDTH, 108, SOFT);
  doc.line(MARGIN_X, painelY, MARGIN_X, painelY + 108, { color: PRIMARY, width: 3 });

  doc.text(MARGIN_X + 20, painelY + 26, 'NOTA OFICIAL', { size: 8, font: 'bold', color: MUTED });
  doc.text(MARGIN_X + 20, painelY + 62, m.cover.scoreLabel, { size: 40, font: 'bold', color: PRIMARY });
  doc.text(MARGIN_X + 20, painelY + 84, m.cover.classification, { size: 11, font: 'bold', color: INK });

  const colX = MARGIN_X + 210;
  doc.text(colX, painelY + 26, 'COMPETÊNCIA', { size: 8, font: 'bold', color: MUTED });
  doc.text(colX, painelY + 42, m.cover.periodLabel, { size: 11, font: 'bold', color: INK });
  doc.text(colX, painelY + 64, 'CICLO', { size: 8, font: 'bold', color: MUTED });
  doc.text(colX, painelY + 80, m.cover.frequencyLabel, { size: 11, color: INK });

  const col2X = MARGIN_X + 360;
  doc.text(col2X, painelY + 26, 'SITUAÇÃO OFICIAL', { size: 8, font: 'bold', color: MUTED });
  doc.text(col2X, painelY + 42, m.cover.officialStatusLabel, { size: 10, font: 'bold', color: INK });
  doc.text(col2X, painelY + 64, 'VALIDADA EM', { size: 8, font: 'bold', color: MUTED });
  doc.text(col2X, painelY + 80, m.cover.validatedAtLabel, { size: 9.5, color: INK });

  l.y = painelY + 108 + 30;
  l.paragrafo(
    'Este documento reproduz o resultado oficial e imutável da auditoria no momento da sua validação. ' +
    'A situação dos planos de ação é informação operacional atual e está identificada como tal na seção própria.',
    { size: 9.5, color: MUTED },
  );
}

// ---------------------------------------------------------------------------
// Identificação
// ---------------------------------------------------------------------------
function identificacao(l: Layout, m: OfficialAuditReportModel): void {
  l.novaPagina();
  l.secao('Identificação da auditoria');
  campo(l, 'Parceiro AACE', m.identification.partnerName);
  campo(l, 'Escritório', m.identification.officeName);
  campo(l, 'Estrutura', m.identification.structureLabel);
  campo(l, 'Competência', m.cover.periodLabel);
  campo(l, 'Frequência', m.cover.frequencyLabel);
  l.espaco(6);
  campo(l, 'Avaliador', `${m.identification.evaluatorName} — ${m.identification.evaluatorRoleLabel}`);
  campo(l, 'Validador', `${m.identification.validatorName} — ${m.identification.validatorRoleLabel}`);
  l.espaco(6);
  campo(l, 'Início', m.identification.startedAtLabel);
  campo(l, 'Envio para validação', m.identification.submittedAtLabel);
  campo(l, 'Validação oficial', m.identification.validatedAtLabel);
}

// ---------------------------------------------------------------------------
// Resumo executivo
// ---------------------------------------------------------------------------
function resumoExecutivo(l: Layout, m: OfficialAuditReportModel): void {
  l.secao('Resumo executivo');

  const celulas: Array<[string, string]> = [
    ['Nota oficial', m.summary.scoreLabel],
    ['Classificação', m.summary.classification],
    ['Itens avaliados', String(m.summary.total)],
    ['Conformes', String(m.summary.conforming)],
    ['Em atenção', String(m.summary.attention)],
    ['Não conformes', String(m.summary.nonConforming)],
    ['Não aplicáveis', String(m.summary.notApplicable)],
    ['Com comprovação', String(m.summary.withEvidence)],
  ];

  const colunas = 4;
  const largura = CONTENT_WIDTH / colunas;
  const linhas = Math.ceil(celulas.length / colunas);
  l.garantirEspaco(linhas * 46 + 8);

  celulas.forEach(([rotulo, valor], i) => {
    const linha = Math.floor(i / colunas);
    const coluna = i % colunas;
    const x = MARGIN_X + coluna * largura;
    const y = l.y + linha * 46;
    l.doc.rect(x, y, largura - 6, 40, SOFT);
    l.doc.text(x + 10, y + 15, rotulo.toUpperCase(), { size: 6.8, font: 'bold', color: MUTED });
    l.doc.text(x + 10, y + 32, ellipsize(valor, 'bold', 13, largura - 26), { size: 13, font: 'bold', color: INK });
  });
  l.y += linhas * 46 + 10;

  if (m.summary.notEvaluated > 0) {
    l.paragrafo(`Itens sem avaliação registrada no snapshot: ${m.summary.notEvaluated}.`,
      { size: 8.5, color: MUTED });
    l.espaco(4);
  }

  l.texto('Diagnóstico consolidado da validação', { size: 9, font: 'bold', color: MUTED });
  l.espaco(2);
  l.paragrafo(m.summary.diagnosis, { size: 9.5 });
}

// ---------------------------------------------------------------------------
// Checklist oficial
// ---------------------------------------------------------------------------
function checklist(l: Layout, m: OfficialAuditReportModel): void {
  l.secao('Checklist oficial');
  l.paragrafo(
    'Itens na ordem do catálogo oficial da versão do checklist utilizada nesta auditoria.',
    { size: 8.5, color: MUTED });
  l.espaco(8);

  let pilarAtual: string | null = null;

  for (const item of m.checklist) {
    if (item.pillar !== pilarAtual) {
      l.garantirEspaco(64);
      l.espaco(6);
      l.texto(item.pillar, { size: 10, font: 'bold', color: PRIMARY });
      l.espaco(2);
      pilarAtual = item.pillar;
    }

    // Cabeçalho do item: código, título e classificação. Só é iniciado se
    // couber com a primeira linha do conteúdo.
    l.garantirEspaco(52);
    const topo = l.y;
    l.doc.rect(MARGIN_X, topo, CONTENT_WIDTH, 20, SOFT);
    l.doc.text(MARGIN_X + 8, topo + 14, item.code, { size: 9, font: 'bold', color: PRIMARY });

    const cor = STATUS_COLOR[item.status] ?? MUTED;
    const larguraStatus = 96;
    l.doc.text(A4_WIDTH - MARGIN_X - larguraStatus, topo + 14,
      ellipsize(item.statusLabel, 'bold', 8.5, larguraStatus - 4), { size: 8.5, font: 'bold', color: cor });

    const larguraTitulo = CONTENT_WIDTH - 44 - larguraStatus;
    l.doc.text(MARGIN_X + 40, topo + 14, ellipsize(item.title, 'bold', 9.5, larguraTitulo),
      { size: 9.5, font: 'bold', color: INK });
    l.y = topo + 26;

    if (item.measuredValue) {
      linhaRotulada(l, 'Resultado observado', item.measuredValue);
    }
    if (item.observation) {
      linhaRotulada(l, 'Análise do gerente de canal', item.observation);
    }
    if (item.notApplicable) {
      linhaRotulada(l, 'Justificativa do não aplicável',
        item.notApplicableReason || 'Justificativa não registrada.');
    }
    linhaRotulada(l, 'Comprovações',
      item.evidenceCount === 0 ? 'Nenhuma comprovação anexada.'
        : `${item.evidenceCount} comprovação(ões) anexada(s).`);

    l.espaco(6);
    l.regua();
  }
}

function linhaRotulada(l: Layout, rotulo: string, valor: string): void {
  l.garantirEspaco(24);
  l.doc.text(MARGIN_X + 8, l.y + 8, rotulo.toUpperCase(), { size: 6.8, font: 'bold', color: MUTED });
  l.y += 11;
  l.paragrafo(valor, { size: 9, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
  l.espaco(3);
}

// ---------------------------------------------------------------------------
// Evidências
// ---------------------------------------------------------------------------
function evidencias(l: Layout, m: OfficialAuditReportModel): void {
  l.secao('Comprovações registradas');
  l.paragrafo(
    'Índice das comprovações vinculadas à auditoria. Os arquivos não são incorporados a este ' +
    'documento e permanecem acessíveis apenas pelo aplicativo, para quem tem acesso à operação.',
    { size: 8.5, color: MUTED });
  l.espaco(8);

  if (m.evidences.length === 0) {
    l.paragrafo('Nenhuma comprovação registrada nesta auditoria.', { size: 9.5 });
    return;
  }

  const colItem = MARGIN_X + 4;
  const colNome = MARGIN_X + 52;
  const colTipo = MARGIN_X + 320;
  const colTam = MARGIN_X + 396;
  const colOk = MARGIN_X + 452;

  l.garantirEspaco(24);
  l.doc.rect(MARGIN_X, l.y, CONTENT_WIDTH, 18, SOFT);
  l.doc.text(colItem, l.y + 12.5, 'ITEM', { size: 7, font: 'bold', color: MUTED });
  l.doc.text(colNome, l.y + 12.5, 'ARQUIVO', { size: 7, font: 'bold', color: MUTED });
  l.doc.text(colTipo, l.y + 12.5, 'TIPO', { size: 7, font: 'bold', color: MUTED });
  l.doc.text(colTam, l.y + 12.5, 'TAMANHO', { size: 7, font: 'bold', color: MUTED });
  l.doc.text(colOk, l.y + 12.5, 'SITUAÇÃO', { size: 7, font: 'bold', color: MUTED });
  l.y += 22;

  for (const ev of m.evidences) {
    l.garantirEspaco(18);
    l.doc.text(colItem, l.y + 9, ev.code, { size: 8.5, font: 'bold', color: PRIMARY });
    l.doc.text(colNome, l.y + 9, ellipsize(ev.name, 'regular', 8.5, colTipo - colNome - 8), { size: 8.5, color: INK });
    l.doc.text(colTipo, l.y + 9, ev.kindLabel, { size: 8.5, color: INK });
    l.doc.text(colTam, l.y + 9, ev.sizeLabel, { size: 8.5, color: INK });
    l.doc.text(colOk, l.y + 9, ev.confirmed ? 'Confirmada' : 'Pendente',
      { size: 8.5, color: ev.confirmed ? STATUS_COLOR.green : STATUS_COLOR.yellow });
    l.y += 15;
    l.doc.line(MARGIN_X, l.y, A4_WIDTH - MARGIN_X, l.y, { color: RULE });
    l.y += 4;
  }
}

// ---------------------------------------------------------------------------
// Planos de ação — conteúdo ATUAL
// ---------------------------------------------------------------------------
function planos(l: Layout, m: OfficialAuditReportModel): void {
  l.secao('Situação do plano de ação na data de geração');

  l.garantirEspaco(34);
  l.doc.rect(MARGIN_X, l.y, CONTENT_WIDTH, 26, { r: 0.98, g: 0.95, b: 0.90 });
  l.doc.text(MARGIN_X + 10, l.y + 11,
    'Esta seção NÃO faz parte do snapshot oficial imutável.', { size: 8.2, font: 'bold', color: { r: 0.60, g: 0.42, b: 0.05 } });
  l.doc.text(MARGIN_X + 10, l.y + 21,
    `Situação lida em ${m.plansReadAtLabel}.`, { size: 8.2, color: { r: 0.60, g: 0.42, b: 0.05 } });
  l.y += 34;

  if (m.plans.length === 0) {
    l.paragrafo('Nenhum plano de ação registrado na data de geração.', { size: 9.5 });
    return;
  }

  for (const plano of m.plans) {
    l.garantirEspaco(58);
    const topo = l.y;
    l.doc.rect(MARGIN_X, topo, CONTENT_WIDTH, 18, SOFT);
    l.doc.text(MARGIN_X + 8, topo + 12.5, plano.code, { size: 8.5, font: 'bold', color: PRIMARY });
    l.doc.text(MARGIN_X + 52, topo + 12.5, plano.statusLabel, { size: 8.5, font: 'bold', color: INK });
    if (plano.overdue) {
      l.doc.text(A4_WIDTH - MARGIN_X - 60, topo + 12.5, 'EM ATRASO',
        { size: 8, font: 'bold', color: STATUS_COLOR.red });
    }
    l.y = topo + 24;

    l.paragrafo(plano.action, { size: 9, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    l.espaco(2);
    l.paragrafo(
      `Responsável: ${plano.owner}   ·   Prazo: ${plano.dueDateLabel}   ·   ${plano.validationLabel}`,
      { size: 8.2, color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    l.paragrafo(`Última atualização: ${plano.updatedAtLabel}`,
      { size: 8.2, color: MUTED, x: MARGIN_X + 8, width: CONTENT_WIDTH - 16 });
    l.espaco(6);
    l.regua();
  }
}

// ---------------------------------------------------------------------------
// Validação e integridade
// ---------------------------------------------------------------------------
function integridade(l: Layout, m: OfficialAuditReportModel): void {
  l.secao('Validação e integridade');

  campo(l, 'Código da avaliação', m.evaluationCode);
  campo(l, 'Código do snapshot', m.snapshotCode);
  campo(l, 'Versão do AAPEx', m.integrity.reportVersion);
  campo(l, 'Gerado em', m.integrity.generatedAtLabel);

  l.espaco(10);
  l.garantirEspaco(56);
  const topo = l.y;
  l.doc.rect(MARGIN_X, topo, CONTENT_WIDTH, 48, SOFT);
  l.doc.text(MARGIN_X + 14, topo + 17, 'CÓDIGO DE INTEGRIDADE', { size: 7.5, font: 'bold', color: MUTED });
  l.doc.text(MARGIN_X + 14, topo + 38, m.integrity.displayCode, { size: 15, font: 'bold', color: INK });
  l.y = topo + 56;

  l.paragrafo(
    'Documento gerado a partir do snapshot oficial imutável da auditoria.',
    { size: 9.5, font: 'bold' });
  l.espaco(2);
  l.paragrafo(
    'O código de integridade é um resumo criptográfico do conteúdo oficial deste relatório. ' +
    'Dois documentos com o mesmo código descrevem exatamente a mesma auditoria oficial. ' +
    'A data de geração e a situação dos planos de ação não entram nesse cálculo. ' +
    'Este código não é assinatura digital nem certificado.',
    { size: 8.5, color: MUTED });
}

// ---------------------------------------------------------------------------
// Rodapé — escrito quando o total de páginas já é conhecido
// ---------------------------------------------------------------------------
function rodape(doc: PdfDocument, m: OfficialAuditReportModel, classificacaoDeUso?: string): void {
  const total = doc.pageCount;
  for (let i = 0; i < total; i += 1) {
    doc.selectPage(i);
    doc.line(MARGIN_X, FOOTER_Y - 10, A4_WIDTH - MARGIN_X, FOOTER_Y - 10, { color: RULE });
    doc.text(MARGIN_X, FOOTER_Y, 'AAPEx · Relatório Oficial de Auditoria', { size: 7.5, color: MUTED });
    const direita = `Página ${i + 1} de ${total}   ·   Gerado em ${m.integrity.generatedAtLabel}`;
    doc.text(A4_WIDTH - MARGIN_X - 232, FOOTER_Y, direita, { size: 7.5, color: MUTED });
    if (classificacaoDeUso) {
      doc.text(MARGIN_X, FOOTER_Y + 10, classificacaoDeUso, { size: 7, font: 'bold', color: MUTED });
    }
  }
}
