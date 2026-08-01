/**
 * Modelo de domínio do Relatório Oficial de Auditoria (AAPEx 1.3.3).
 *
 * Módulo PURO: não conhece banco, Supabase, DOM, React, Expo, navegador nem
 * download. Recebe os dados já autorizados pela RPC `get_official_audit_report_data`
 * (migration 0035) e devolve um modelo pronto para ser desenhado — a mesma
 * entrada produz sempre o mesmo conteúdo lógico, o que é o que torna o código
 * de integridade reproduzível.
 *
 * A REGRA CENTRAL É A SEPARAÇÃO. O documento carrega duas naturezas de
 * informação que não podem se misturar:
 *
 *   OFICIAL   — congelado no snapshot no instante da validação. Não muda nunca
 *               mais, e é isso que o código de integridade resume.
 *   ATUAL     — os planos de ação, lidos no momento da geração. Mudam sozinhos
 *               com o tempo, e por isso saem datados e FORA do hash.
 *
 * Apresentar plano de ação como se fosse parte do snapshot seria afirmar que a
 * auditoria dizia, em julho, algo que só passou a ser verdade em setembro.
 *
 * O SCORE NÃO É RECALCULADO. `calculateScore` existe e funciona, mas rodá-lo
 * aqui criaria uma segunda aritmética ao lado da oficial (`app.evaluation_score`,
 * 0006) — e um relatório "oficial" que discorda do snapshot é pior do que
 * relatório nenhum. O número vem do snapshot e é impresso como veio.
 */
import { getMaturity, roleLabel, trafficLightLabel } from '../../utils/format';
import { actionStatusHumanLabel } from '../workflow/actionPlanWorkflow';
import { ActionStatus, TrafficLight, UserRole } from '../../types';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';
import { sha256Hex } from './sha256';

/** Versão do FORMATO do relatório. Muda quando o conteúdo canônico muda. */
export const REPORT_FORMAT_VERSION = '1.3.3';

/** Quantos caracteres do resumo são impressos no documento. */
export const INTEGRITY_CODE_DISPLAY_LENGTH = 20;

// ---------------------------------------------------------------------------
// Entrada — o contrato da RPC 0035, nada além
// ---------------------------------------------------------------------------

export interface ReportAnswerInput {
  code: string;
  pillar: string;
  title: string;
  weight: number;
  status: string;
  measuredValue: string;
  observation: string;
  notApplicableReason: string;
  evidenceCount: number;
}

export interface ReportEvidenceInput {
  code: string;
  name: string;
  mimeType: string;
  sizeBytes: number | string;
  confirmed: boolean;
}

export interface ReportPlanInput {
  code: string;
  action: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
  overdue: boolean;
  validatorName: string | null;
  validatedAt: string | null;
  updatedAt: string;
}

export interface OfficialAuditReportInput {
  evaluationId: string;
  snapshotId: string;
  operationId: string;
  official: {
    partnerName: string;
    officeName: string;
    city: string;
    state: string;
    regionName: string | null;
    unitName: string | null;
    coordinationName: string | null;
    period: string;
    periodStart: string | null;
    periodEnd: string | null;
    cycleLabel: string;
    frequency: string;
    score: number;
    status: string;
    evaluatorName: string | null;
    evaluatorRole: string | null;
    validatorName: string | null;
    validatorRole: string | null;
    validatorNote: string;
    startedAt: string | null;
    submittedAt: string | null;
    validatedAt: string | null;
    answers: ReportAnswerInput[];
    evidenceIndex: ReportEvidenceInput[];
  };
  current: {
    readAt: string;
    actionPlans: ReportPlanInput[];
  };
}

// ---------------------------------------------------------------------------
// Saída — o modelo desenhável
// ---------------------------------------------------------------------------

export interface ReportChecklistItem {
  code: string;
  pillar: string;
  title: string;
  statusLabel: string;
  status: string;
  measuredValue: string;
  observation: string;
  notApplicable: boolean;
  notApplicableReason: string;
  evidenceCount: number;
}

export interface ReportEvidenceItem {
  code: string;
  name: string;
  kindLabel: string;
  sizeLabel: string;
  confirmed: boolean;
}

export interface ReportPlanItem {
  code: string;
  action: string;
  owner: string;
  dueDateLabel: string;
  statusLabel: string;
  overdue: boolean;
  validationLabel: string;
  updatedAtLabel: string;
}

export interface OfficialAuditReportModel {
  /** Identificadores abreviados — o documento nunca imprime UUID integral. */
  evaluationCode: string;
  snapshotCode: string;
  cover: {
    partnerName: string;
    officeName: string;
    locationLabel: string;
    periodLabel: string;
    frequencyLabel: string;
    scoreLabel: string;
    classification: string;
    officialStatusLabel: string;
    validatedAtLabel: string;
  };
  identification: {
    partnerName: string;
    officeName: string;
    structureLabel: string;
    evaluatorName: string;
    evaluatorRoleLabel: string;
    validatorName: string;
    validatorRoleLabel: string;
    startedAtLabel: string;
    submittedAtLabel: string;
    validatedAtLabel: string;
  };
  summary: {
    scoreLabel: string;
    classification: string;
    total: number;
    conforming: number;
    nonConforming: number;
    attention: number;
    notApplicable: number;
    notEvaluated: number;
    withEvidence: number;
    diagnosis: string;
  };
  checklist: ReportChecklistItem[];
  evidences: ReportEvidenceItem[];
  plans: ReportPlanItem[];
  plansReadAtLabel: string;
  integrity: {
    /** Resumo completo — fica no modelo, não é impresso inteiro. */
    fullCode: string;
    /** Prefixo legível, agrupado, que vai ao documento. */
    displayCode: string;
    reportVersion: string;
    generatedAtLabel: string;
  };
  fileName: string;
  /** Exatamente o texto resumido pelo SHA-256. Exposto para prova. */
  canonicalContent: string;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * Texto normalizado para exibição E para o hash: quebras de linha unificadas,
 * espaço em branco de borda removido, linhas em branco repetidas colapsadas.
 *
 * `normalize('NFC')` compõe os acentos: "ç" digitado como c + cedilha combinante
 * e "ç" como ponto de código único são a MESMA letra para quem lê, e precisam
 * ser o mesmo byte para o resumo. É ES2015 e existe nos três motores-alvo; a
 * guarda evita quebrar caso algum ambiente de teste não a ofereça.
 */
export function normalizeText(value: string | null | undefined): string {
  if (value == null) return '';
  let text = String(value).replace(/\r\n?/g, '\n');
  if (typeof text.normalize === 'function') text = text.normalize('NFC');
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Data ISO → dd/mm/aaaa, sem depender de Intl (que varia por plataforma). */
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Data-hora ISO → dd/mm/aaaa hh:mm, em UTC, para ser igual em toda parte. */
export function formatDateTimeBR(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getUTCDate())}/${p(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())} UTC`;
}

/** Competência AAAA-MM → "Julho de 2026". */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function formatPeriodBR(period: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period ?? ''));
  if (!match) return String(period ?? '—');
  const mes = MESES[Number(match[2]) - 1];
  if (!mes) return String(period);
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${match[1]}`;
}

function formatBytesLabel(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** O score sai com uma casa quando tem fração, e inteiro quando não tem. */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

// ---------------------------------------------------------------------------
// Nome do arquivo
// ---------------------------------------------------------------------------

/**
 * Sanea o nome do parceiro para virar parte de um nome de arquivo válido em
 * Windows, macOS, Linux, Android e iOS. Barras, dois-pontos e o resto dos
 * reservados caem; acentos viram a letra base, para que o arquivo continue
 * legível mesmo quando salvo por um sistema que não fala UTF-8.
 */
export function sanitizeFileNamePart(value: string, maxLength = 40): string {
  let text = String(value ?? '');
  if (typeof text.normalize === 'function') {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  const limpo = text
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, maxLength)
    .replace(/[._-]+$/g, '');
  return limpo || 'Parceiro';
}

/**
 * AAPEx_Relatorio_Auditoria_<Parceiro>_<AAAA-MM>_<codigo-curto>.pdf
 *
 * O código curto são os 8 primeiros hexadecimais do resumo — o bastante para
 * distinguir dois relatórios na mesma pasta, e nada parecido com um UUID
 * integral, que não tem por que sair do banco.
 */
export function buildReportFileName(partnerName: string, period: string, integrityCode: string): string {
  const parceiro = sanitizeFileNamePart(partnerName);
  const competencia = /^\d{4}-\d{2}$/.test(String(period ?? '')) ? period : 'sem-competencia';
  const curto = String(integrityCode ?? '').slice(0, 8) || 'semcodig';
  return `AAPEx_Relatorio_Auditoria_${parceiro}_${competencia}_${curto}.pdf`;
}

// ---------------------------------------------------------------------------
// Conteúdo canônico e código de integridade
// ---------------------------------------------------------------------------

/**
 * A representação canônica do que é OFICIAL. É este texto — e só ele — que o
 * SHA-256 resume.
 *
 * Formato deliberadamente explícito, campo a campo, uma linha por fato: um
 * `JSON.stringify` dependeria da ordem de inserção das chaves, que é uma
 * propriedade do objeto que veio da rede, não do conteúdo da auditoria. Aqui a
 * ordem é escrita no código e não pode escorregar.
 *
 * FICAM DE FORA, por serem voláteis: a hora de geração, os planos de ação, o
 * estado de atraso, o nome do arquivo e qualquer URL, token ou caminho — nenhum
 * deles descreve a auditoria oficial, e todos mudariam o resumo sem que o
 * documento oficial tivesse mudado.
 */
export function buildCanonicalContent(input: OfficialAuditReportInput): string {
  const o = input.official;
  const linhas: string[] = [];
  const campo = (chave: string, valor: unknown) => linhas.push(`${chave}=${normalizeText(String(valor ?? ''))}`);

  campo('formato', REPORT_FORMAT_VERSION);
  campo('avaliacao', input.evaluationId);
  campo('snapshot', input.snapshotId);
  campo('operacao', input.operationId);
  campo('parceiro', o.partnerName);
  campo('escritorio', o.officeName);
  campo('competencia', o.period);
  campo('frequencia', o.frequency);
  campo('ciclo', o.cycleLabel);
  campo('score', formatScore(o.score));
  campo('classificacao', getMaturity(o.score));
  campo('situacao', o.status);
  campo('avaliador', o.evaluatorName);
  campo('validador', o.validatorName);
  campo('enviadoEm', o.submittedAt);
  campo('validadoEm', o.validatedAt);
  campo('diagnostico', o.validatorNote);

  for (const a of sortAnswers(o.answers)) {
    linhas.push(
      `item|${a.code}|${a.status}|${normalizeText(a.measuredValue)}` +
      `|${normalizeText(a.observation)}|${normalizeText(a.notApplicableReason)}|${a.evidenceCount}`,
    );
  }
  for (const e of sortEvidences(o.evidenceIndex)) {
    linhas.push(`evidencia|${e.code}|${normalizeText(e.name)}|${e.mimeType}|${e.sizeBytes}|${e.confirmed ? '1' : '0'}`);
  }

  return linhas.join('\n');
}

/** Agrupa o resumo em blocos de 4 para poder ser conferido a olho. */
export function formatIntegrityDisplay(fullCode: string): string {
  const curto = fullCode.slice(0, INTEGRITY_CODE_DISPLAY_LENGTH).toUpperCase();
  return (curto.match(/.{1,4}/g) ?? []).join(' ');
}

// ---------------------------------------------------------------------------
// Ordenação determinística
// ---------------------------------------------------------------------------

/**
 * Ordem do CATÁLOGO, que é a ordem dos códigos (T01, T02, …) — a mesma que
 * `ui_evaluations` já usa e que a tela de avaliação apresenta. Comparação por
 * código com desempate estável; nada de `localeCompare` sem argumentos, que
 * varia com a localidade do dispositivo e faria o mesmo relatório sair em
 * ordens diferentes em dois aparelhos.
 */
function compareCodes(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortAnswers<T extends { code: string }>(answers: readonly T[]): T[] {
  return [...answers].sort((x, y) => compareCodes(x.code, y.code));
}

function sortEvidences<T extends { code: string; name: string }>(items: readonly T[]): T[] {
  return [...items].sort((x, y) => compareCodes(x.code, y.code) || compareCodes(x.name, y.name));
}

function sortPlans(plans: readonly ReportPlanInput[]): ReportPlanInput[] {
  return [...plans].sort((x, y) =>
    compareCodes(x.dueDate ?? '', y.dueDate ?? '') || compareCodes(x.code ?? '', y.code ?? ''));
}

// ---------------------------------------------------------------------------
// Construção
// ---------------------------------------------------------------------------

function labelStatus(status: string): string {
  return trafficLightLabel[status as TrafficLight] ?? status;
}

function labelRole(role: string | null): string {
  if (!role) return '—';
  return roleLabel[role as UserRole] ?? role;
}

function labelPlanStatus(status: string): string {
  return actionStatusHumanLabel[status as ActionStatus] ?? status;
}

function shortCode(uuid: string): string {
  return String(uuid ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '—';
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator: string): string {
  const uteis = parts.map((p) => normalizeText(p)).filter((p) => p.length > 0);
  return uteis.length ? uteis.join(separator) : '—';
}

/**
 * Constrói o modelo. `generatedAt` é injetado (nunca lido do relógio aqui)
 * porque uma função pura não tem relógio — e porque é isso que permite provar
 * que a hora de geração NÃO entra no código de integridade.
 */
export function buildOfficialAuditReportModel(
  input: OfficialAuditReportInput,
  generatedAt: string,
): Result<OfficialAuditReportModel> {
  const problema = validateInput(input);
  if (problema) {
    return err(new AppError('validation/invalid-input', problema, { severity: 'high' }));
  }

  const o = input.official;
  const answers = sortAnswers(o.answers);
  const classification = getMaturity(o.score);
  const scoreLabel = formatScore(o.score);

  const canonicalContent = buildCanonicalContent(input);
  const fullCode = sha256Hex(canonicalContent);

  const conforming = answers.filter((a) => a.status === 'green').length;
  const attention = answers.filter((a) => a.status === 'yellow').length;
  const nonConforming = answers.filter((a) => a.status === 'red').length;
  const notApplicable = answers.filter((a) => a.status === 'not_applicable').length;
  const notEvaluated = answers.filter((a) => a.status === 'not_evaluated').length;
  const withEvidence = answers.filter((a) => a.evidenceCount > 0).length;

  return ok({
    evaluationCode: shortCode(input.evaluationId),
    snapshotCode: shortCode(input.snapshotId),

    cover: {
      partnerName: normalizeText(o.partnerName),
      officeName: normalizeText(o.officeName),
      locationLabel: joinNonEmpty([o.city, o.state], ' / '),
      periodLabel: formatPeriodBR(o.period),
      frequencyLabel: o.frequency === 'weekly' ? 'Auditoria semanal' : 'Auditoria mensal',
      scoreLabel,
      classification,
      officialStatusLabel: 'Validada oficialmente',
      validatedAtLabel: formatDateTimeBR(o.validatedAt),
    },

    identification: {
      partnerName: normalizeText(o.partnerName),
      officeName: normalizeText(o.officeName),
      structureLabel: joinNonEmpty([o.regionName, o.unitName, o.coordinationName], ' › '),
      evaluatorName: normalizeText(o.evaluatorName) || '—',
      evaluatorRoleLabel: labelRole(o.evaluatorRole),
      validatorName: normalizeText(o.validatorName) || '—',
      validatorRoleLabel: labelRole(o.validatorRole),
      startedAtLabel: formatDateTimeBR(o.startedAt),
      submittedAtLabel: formatDateTimeBR(o.submittedAt),
      validatedAtLabel: formatDateTimeBR(o.validatedAt),
    },

    summary: {
      scoreLabel,
      classification,
      total: answers.length,
      conforming,
      nonConforming,
      attention,
      notApplicable,
      notEvaluated,
      withEvidence,
      diagnosis: normalizeText(o.validatorNote) ||
        'Nenhum diagnóstico consolidado foi registrado na validação.',
    },

    checklist: answers.map((a) => ({
      code: a.code,
      pillar: normalizeText(a.pillar) || '—',
      title: normalizeText(a.title) || a.code,
      status: a.status,
      statusLabel: labelStatus(a.status),
      measuredValue: normalizeText(a.measuredValue),
      observation: normalizeText(a.observation),
      notApplicable: a.status === 'not_applicable',
      notApplicableReason: normalizeText(a.notApplicableReason),
      evidenceCount: a.evidenceCount,
    })),

    evidences: sortEvidences(o.evidenceIndex).map((e) => ({
      code: e.code,
      name: normalizeText(e.name),
      kindLabel: String(e.mimeType ?? '').startsWith('image/') ? 'Imagem' : 'Documento',
      sizeLabel: formatBytesLabel(e.sizeBytes),
      confirmed: e.confirmed,
    })),

    plans: sortPlans(input.current.actionPlans).map((p) => ({
      code: p.code || '—',
      action: normalizeText(p.action),
      owner: normalizeText(p.owner) || '—',
      dueDateLabel: formatDateBR(p.dueDate),
      statusLabel: labelPlanStatus(p.status),
      overdue: !!p.overdue,
      validationLabel: p.validatedAt
        ? `Validado por ${normalizeText(p.validatorName) || '—'} em ${formatDateBR(p.validatedAt)}`
        : 'Sem validação registrada',
      updatedAtLabel: formatDateTimeBR(p.updatedAt),
    })),
    plansReadAtLabel: formatDateTimeBR(input.current.readAt),

    integrity: {
      fullCode,
      displayCode: formatIntegrityDisplay(fullCode),
      reportVersion: REPORT_FORMAT_VERSION,
      generatedAtLabel: formatDateTimeBR(generatedAt),
    },

    fileName: buildReportFileName(o.partnerName, o.period, fullCode),
    canonicalContent,
  });
}

/**
 * Recusa entrada que não descreve uma auditoria oficialmente validada. O
 * servidor já barrou tudo isso; aqui a verificação existe para que o modelo não
 * produza um documento "oficial" a partir de dados truncados por uma falha de
 * rede parcial.
 */
function validateInput(input: OfficialAuditReportInput): string | null {
  if (!input || typeof input !== 'object') return 'Dados do relatório ausentes.';
  if (!input.evaluationId || !input.snapshotId) return 'Relatório sem identificação oficial.';
  const o = input.official;
  if (!o || typeof o !== 'object') return 'Conteúdo oficial ausente.';
  if (!Array.isArray(o.answers) || o.answers.length === 0) {
    return 'A auditoria oficial não tem respostas registradas.';
  }
  if (typeof o.score !== 'number' || !Number.isFinite(o.score)) {
    return 'Nota oficial ausente ou inválida.';
  }
  if (!o.partnerName) return 'Parceiro AACE não identificado.';
  if (!input.current || !Array.isArray(input.current.actionPlans)) {
    return 'Situação atual dos planos de ação ausente.';
  }
  return null;
}
