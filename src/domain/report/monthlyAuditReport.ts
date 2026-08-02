/**
 * Modelo de domínio do **Relatório Oficial da Auditoria Mensal** (AAPEx 1.3.5).
 *
 * Módulo PURO: não conhece banco, Supabase, DOM, React, Expo, navegador nem
 * download. Recebe o que `get_monthly_audit_report_data` (migration 0051) já
 * autorizou e congelou, e devolve um modelo pronto para ser desenhado.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTE MÓDULO EXISTE, EM VEZ DE UM PARÂMETRO NO DE 1.3.3
 * ---------------------------------------------------------------------------
 * Os dois relatórios respondem perguntas diferentes e, por isso, congelam
 * coisas diferentes:
 *
 *   1.3.3 (legado)  — checklist de `audit_items`, nota por PESO DE ITEM, e os
 *                     planos impressos como "situação ATUAL", datados e FORA do
 *                     código de integridade;
 *   1.3.5 (mensal)  — critérios de processo materializados, nota pela regra
 *                     A-10, e os planos MATERIALIZADOS no snapshot, DENTRO do
 *                     código — porque o plano mensal aponta para a resposta do
 *                     critério (ADR-135-003, D-Q) e é parte do que a auditoria
 *                     afirmou, não do que aconteceu depois.
 *
 * Um módulo só, com bandeiras, teria de decidir em tempo de execução se o plano
 * entra no hash. Duas naturezas de documento controladas por um `if` é como os
 * dois contratos passam a divergir em silêncio.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE MÓDULO NÃO FAZ
 * ---------------------------------------------------------------------------
 * **Não recalcula a nota.** Ela vem do servidor, computada sobre o snapshot, e
 * é impressa como veio. Recalcular aqui criaria uma segunda aritmética ao lado
 * da oficial — e um relatório "oficial" que discorda do snapshot é pior do que
 * relatório nenhum.
 *
 * **Não transforma ausência em zero.** `processScore` é `number | null`, e o
 * `null` atravessa o modelo inteiro até virar texto explícito. É a lição L-04
 * na sua sexta camada.
 */
import { sha256Hex } from './sha256';
import {
  INTEGRITY_CODE_DISPLAY_LENGTH, formatDateBR, formatDateTimeBR, formatIntegrityDisplay,
  formatPeriodBR, normalizeText, sanitizeFileNamePart,
} from './officialAuditReport';

/**
 * Versão do formato do relatório MENSAL.
 *
 * **NÃO É** `REPORT_FORMAT_VERSION`, que continua `1.3.3` e identifica os
 * quarenta documentos legados já emitidos. As duas convivem de propósito: a
 * histórica participa da canonicalização daqueles quarenta códigos, e trocá-la
 * invalidaria uma prova que ainda está por remedir.
 */
export const MONTHLY_REPORT_FORMAT_VERSION = '1.3.5';

/** Identificador versionado da canonicalização deste formato. */
export const MONTHLY_CANONICALIZATION = 'linha-por-fato/1.3.5';

// ---------------------------------------------------------------------------
// Entrada — o contrato da RPC 0051, nada além
// ---------------------------------------------------------------------------

export interface MonthlyReportIdentity {
  reportFormatVersion: string;
  evaluationId: string;
  operationId: string;
  partnerName: string;
  competence: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  approvedBy: string;
  approvedAt: string;
  snapshotId: string;
}

export interface MonthlyReportSummary {
  /** `null` quando nenhum critério era aplicável. **Nunca** zero. */
  processScore: number | null;
  sufficient: boolean;
  insufficiencyReasons: string[];
  totalCriteria: number;
  applicableCriteria: number;
  conformCount: number;
  nonConformCount: number;
  notApplicableCount: number;
  notEvaluatedCount: number;
  plansByStatus: Record<string, number>;
  ruleVersions: { processScoreRule: string; reportFormatVersion: string };
}

export interface MonthlyReportEvidence {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MonthlyReportPlan {
  action: string;
  owner: string;
  dueDate: string;
  priority: string;
  status: string;
}

export interface MonthlyReportCriterion {
  themeCode: string;
  themeName: string;
  indicatorCode: string;
  indicatorName: string;
  criterionCode: string;
  question: string;
  description: string;
  guidance: string;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  answer: string;
  justification: string;
  observation: string;
  diagnosis: string;
  evidences: MonthlyReportEvidence[];
  plans: MonthlyReportPlan[];
}

export interface MonthlyReportIntegrityInput {
  formatVersion: string;
  ruleVersion: string;
  canonicalization: string;
  ordering: string;
}

export interface MonthlyAuditReportInput {
  identity: MonthlyReportIdentity;
  summary: MonthlyReportSummary;
  content: MonthlyReportCriterion[];
  integrity: MonthlyReportIntegrityInput;
  /** Fora do conteúdo assinado. Muda a cada geração, e só ele. */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

/** O vocabulário de quatro valores de `app.criterion_answer_status`. */
export const ANSWER_LABEL: Record<string, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_aplicavel: 'Não aplicável',
  nao_avaliado: 'Não avaliado',
};

export const INSUFFICIENCY_LABEL: Record<string, string> = {
  no_applicable_criteria: 'nenhum critério aplicável nesta auditoria',
};

/**
 * A nota do processo como texto. **Ausência não é zero**, e é aqui que a
 * distinção precisa sobreviver à última camada antes do papel.
 */
export function formatProcessScore(score: number | null): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'Dados insuficientes';
  return score.toFixed(2).replace('.', ',');
}

/** Por que não há nota, quando não há. */
export function insufficiencyText(summary: MonthlyReportSummary): string {
  if (summary.sufficient) return '';
  const motivos = summary.insufficiencyReasons.map((r) => INSUFFICIENCY_LABEL[r] ?? r);
  return motivos.length > 0 ? motivos.join('; ') : 'dados insuficientes';
}

// ---------------------------------------------------------------------------
// Ordenação determinística
// ---------------------------------------------------------------------------

/**
 * O servidor já ordena (0051). Reordenar aqui **não é redundância**: o modelo
 * precisa ser determinístico mesmo que a ordem chegue trocada por um proxy, um
 * cache ou uma reserialização. O código de integridade não pode depender de
 * quem entregou o JSON.
 */
export function sortCriteria(items: MonthlyReportCriterion[]): MonthlyReportCriterion[] {
  return [...items].sort((a, b) =>
    a.themeCode.localeCompare(b.themeCode, 'pt-BR')
    || a.indicatorCode.localeCompare(b.indicatorCode, 'pt-BR')
    || a.criterionCode.localeCompare(b.criterionCode, 'pt-BR'));
}

export function sortEvidences(items: MonthlyReportEvidence[]): MonthlyReportEvidence[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR') || a.mimeType.localeCompare(b.mimeType, 'pt-BR'));
}

export function sortPlans(items: MonthlyReportPlan[]): MonthlyReportPlan[] {
  return [...items].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate) || a.action.localeCompare(b.action, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// Conteúdo canônico e código de integridade
// ---------------------------------------------------------------------------

/**
 * A representação canônica do que é OFICIAL. É este texto — e só ele — que o
 * SHA-256 resume.
 *
 * Formato explícito, campo a campo, uma linha por fato. `JSON.stringify`
 * dependeria da ordem de inserção das chaves, que é propriedade do objeto que
 * veio da rede, não do conteúdo da auditoria.
 *
 * **A VERSÃO DO FORMATO PARTICIPA** — é a primeira linha. Dois documentos de
 * formatos diferentes descrevendo a mesma auditoria têm códigos diferentes, e
 * isso é intencional: o formato faz parte do que se está afirmando.
 *
 * **FICAM DE FORA**, por serem voláteis ou irrelevantes ao conteúdo oficial:
 * `generatedAt`, o nome do arquivo e qualquer URL, token ou caminho.
 *
 * **AUSÊNCIA ≠ ZERO, e `sem_dado` ≠ ZERO.** Nota nula entra como a palavra
 * `ausente`, jamais como `0.00` — se entrasse como zero, uma auditoria sem
 * critério aplicável teria o mesmo código de uma auditoria reprovada.
 */
export function buildMonthlyCanonicalContent(input: MonthlyAuditReportInput): string {
  const id = input.identity;
  const s = input.summary;
  const linhas: string[] = [];
  const campo = (chave: string, valor: unknown) =>
    linhas.push(`${chave}=${normalizeText(String(valor ?? ''))}`);

  campo('formato', MONTHLY_REPORT_FORMAT_VERSION);
  campo('canonicalizacao', MONTHLY_CANONICALIZATION);
  campo('regra', input.integrity.ruleVersion);
  campo('avaliacao', id.evaluationId);
  campo('snapshot', id.snapshotId);
  campo('operacao', id.operationId);
  campo('parceiro', id.partnerName);
  campo('competencia', id.competence);
  campo('periodoInicio', id.periodStart);
  campo('periodoFim', id.periodEnd);
  campo('situacao', id.status);
  campo('aprovadoPor', id.approvedBy);
  campo('aprovadoEm', id.approvedAt);

  // `ausente` e não `0.00`: sem isso, "nenhum critério aplicável" e "zero por
  // cento de conformidade" teriam o mesmo resumo criptográfico.
  campo('pontuacaoProcesso', s.processScore === null ? 'ausente' : s.processScore.toFixed(2));
  campo('suficiente', s.sufficient ? '1' : '0');
  campo('motivosInsuficiencia', [...s.insufficiencyReasons].sort().join(','));
  campo('criteriosTotal', s.totalCriteria);
  campo('criteriosAplicaveis', s.applicableCriteria);
  campo('conformes', s.conformCount);
  campo('naoConformes', s.nonConformCount);
  campo('naoAplicaveis', s.notApplicableCount);
  campo('naoAvaliados', s.notEvaluatedCount);

  for (const c of sortCriteria(input.content)) {
    linhas.push(
      `criterio|${c.themeCode}|${c.indicatorCode}|${c.criterionCode}|${c.answer}`
      + `|${normalizeText(c.question)}|${normalizeText(c.justification)}`
      + `|${normalizeText(c.observation)}|${normalizeText(c.diagnosis)}`
      + `|${c.required ? '1' : '0'}|${c.evidenceRequired ? '1' : '0'}|${c.allowsNa ? '1' : '0'}`,
    );
    for (const e of sortEvidences(c.evidences)) {
      linhas.push(`evidencia|${c.criterionCode}|${normalizeText(e.name)}|${e.mimeType}|${e.sizeBytes}`);
    }
    // O plano MATERIALIZADO entra no resumo, ao contrário do relatório 1.3.3 —
    // ver o cabeçalho deste arquivo.
    for (const p of sortPlans(c.plans)) {
      linhas.push(
        `plano|${c.criterionCode}|${normalizeText(p.action)}|${normalizeText(p.owner)}`
        + `|${p.dueDate}|${p.priority}|${p.status}`,
      );
    }
  }

  // Planos por estado, em ordem alfabética de estado — o objeto que vem do
  // servidor não tem ordem garantida.
  for (const estado of Object.keys(input.summary.plansByStatus).sort()) {
    linhas.push(`planosPorEstado|${estado}|${input.summary.plansByStatus[estado]}`);
  }

  return linhas.join('\n');
}

/**
 * Nome do arquivo, sem PII e sem caractere que o sistema de arquivos recuse.
 *
 * `sanitizeFileNamePart` tem fallback próprio — devolve `'Parceiro'` para
 * entrada vazia —, e por isso a competência **não** passa por ele quando está
 * vazia: um arquivo chamado `...-Parceiro-Parceiro-...` seria pior do que um
 * que admite não saber a competência.
 */
export function buildMonthlyReportFileName(
  partnerName: string, competence: string, integrityCode: string,
): string {
  const parceiro = String(partnerName ?? '').trim()
    ? sanitizeFileNamePart(partnerName) : 'parceiro';
  const comp = String(competence ?? '').trim()
    ? sanitizeFileNamePart(competence) : 'competencia';
  const curto = String(integrityCode ?? '').slice(0, 8) || 'semcodig';
  return `AAPEx-Auditoria-Mensal-${parceiro}-${comp}-${curto}.pdf`;
}

// ---------------------------------------------------------------------------
// O modelo desenhável
// ---------------------------------------------------------------------------

export interface MonthlyReportThemeGroup {
  themeCode: string;
  themeName: string;
  indicators: Array<{
    indicatorCode: string;
    indicatorName: string;
    criteria: Array<MonthlyReportCriterion & {
      answerLabel: string;
      dueDateLabels: string[];
    }>;
  }>;
}

export interface MonthlyAuditReportModel {
  cover: {
    partnerName: string;
    competenceLabel: string;
    periodLabel: string;
    scoreLabel: string;
    sufficient: boolean;
    insufficiencyLabel: string;
    approvedByLabel: string;
    approvedAtLabel: string;
  };
  identification: {
    partnerName: string;
    competence: string;
    periodLabel: string;
    statusLabel: string;
    approvedBy: string;
    approvedAtLabel: string;
    evaluationId: string;
    snapshotId: string;
  };
  summary: MonthlyReportSummary & { scoreLabel: string; insufficiencyLabel: string };
  /** Agrupado por tema e indicador, na ordem determinística. */
  groups: MonthlyReportThemeGroup[];
  /** Todos os planos materializados, achatados para a seção própria. */
  plans: Array<MonthlyReportPlan & { criterionCode: string; dueDateLabel: string }>;
  integrity: {
    formatVersion: string;
    ruleVersion: string;
    canonicalization: string;
    ordering: string;
    fullCode: string;
    displayCode: string;
    generatedAtLabel: string;
  };
  canonicalContent: string;
  fileName: string;
}

/**
 * Monta o modelo e calcula o código de integridade.
 *
 * `generatedAt` entra no modelo (para o rodapé) e **não** entra no canônico.
 * Duas chamadas com instantes diferentes produzem o MESMO código.
 */
export function buildMonthlyAuditReportModel(
  input: MonthlyAuditReportInput,
): MonthlyAuditReportModel {
  const id = input.identity;
  const s = input.summary;

  const canonicalContent = buildMonthlyCanonicalContent(input);
  const fullCode = sha256Hex(canonicalContent);
  const ordenados = sortCriteria(input.content);

  // Agrupamento por tema e, dentro dele, por indicador. A ordem dos grupos vem
  // da ordem já determinística das entradas — não de uma segunda classificação.
  const groups: MonthlyReportThemeGroup[] = [];
  for (const c of ordenados) {
    let tema = groups.find((g) => g.themeCode === c.themeCode);
    if (!tema) {
      tema = { themeCode: c.themeCode, themeName: c.themeName, indicators: [] };
      groups.push(tema);
    }
    let indicador = tema.indicators.find((i) => i.indicatorCode === c.indicatorCode);
    if (!indicador) {
      indicador = { indicatorCode: c.indicatorCode, indicatorName: c.indicatorName, criteria: [] };
      tema.indicators.push(indicador);
    }
    indicador.criteria.push({
      ...c,
      evidences: sortEvidences(c.evidences),
      plans: sortPlans(c.plans),
      answerLabel: ANSWER_LABEL[c.answer] ?? c.answer,
      dueDateLabels: sortPlans(c.plans).map((p) => formatDateBR(p.dueDate)),
    });
  }

  const plans = ordenados.flatMap((c) =>
    sortPlans(c.plans).map((p) => ({
      ...p, criterionCode: c.criterionCode, dueDateLabel: formatDateBR(p.dueDate),
    })));

  const scoreLabel = formatProcessScore(s.processScore);
  const insufficiencyLabel = insufficiencyText(s);

  return {
    cover: {
      partnerName: id.partnerName,
      competenceLabel: formatPeriodBR(id.competence),
      periodLabel: `${formatDateBR(id.periodStart)} a ${formatDateBR(id.periodEnd)}`,
      scoreLabel,
      sufficient: s.sufficient,
      insufficiencyLabel,
      approvedByLabel: id.approvedBy,
      approvedAtLabel: formatDateTimeBR(id.approvedAt),
    },
    identification: {
      partnerName: id.partnerName,
      competence: id.competence,
      periodLabel: `${formatDateBR(id.periodStart)} a ${formatDateBR(id.periodEnd)}`,
      statusLabel: 'Aprovada',
      approvedBy: id.approvedBy,
      approvedAtLabel: formatDateTimeBR(id.approvedAt),
      evaluationId: id.evaluationId,
      snapshotId: id.snapshotId,
    },
    summary: { ...s, scoreLabel, insufficiencyLabel },
    groups,
    plans,
    integrity: {
      formatVersion: MONTHLY_REPORT_FORMAT_VERSION,
      ruleVersion: input.integrity.ruleVersion,
      canonicalization: MONTHLY_CANONICALIZATION,
      ordering: input.integrity.ordering,
      fullCode,
      displayCode: formatIntegrityDisplay(fullCode),
      generatedAtLabel: formatDateTimeBR(input.generatedAt),
    },
    canonicalContent,
    fileName: buildMonthlyReportFileName(id.partnerName, id.competence, fullCode),
  };
}

export { INTEGRITY_CODE_DISPLAY_LENGTH };
