/**
 * Espelho de domínio das regras da AUDITORIA MENSAL (migrations 0042–0044).
 *
 * ISTO NÃO É SEGURANÇA. A barreira é o servidor: `app.is_assisted_operator`,
 * os gatilhos de coerência e imutabilidade, os seis portões de
 * `submit_monthly_audit` e a RLS. Este módulo existe para que a interface não
 * OFEREÇA o que será recusado, e para que a regra possa ser lida e testada sem
 * subir um banco.
 *
 * Cada função tem contraparte nominal no servidor. Quando as duas discordarem,
 * quem está certo é o servidor.
 */
import { AuthzSubject, hasRole } from '../authz/policy';
import {
  CriterionAnswerStatus,
  MaterializedCriterion,
  MonthlyAudit,
  MonthlyAuditStatus,
} from './types';

// ---------------------------------------------------------------------------
// Competência
// ---------------------------------------------------------------------------

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Espelha a validação de `start_monthly_audit`. */
export function isValidCompetence(competence: string): boolean {
  return COMPETENCE_RE.test(competence);
}

/**
 * Competência do mês a que a data pertence. Opera sobre `AAAA-MM-DD` como
 * texto, sem construir `Date`: recortar a string não tem fuso, e é a operação
 * que o servidor faz com `to_char(period_start,'YYYY-MM')`.
 */
export function competenceOf(day: string): string {
  return day.slice(0, 7);
}

/** Competência corrente em `America/Sao_Paulo` — o mesmo fuso empresarial. */
export function currentCompetence(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(now).slice(0, 7);
}

/** Competência anterior ou seguinte. `delta` em meses. */
export function shiftCompetence(competence: string, delta: number): string {
  const [y, m] = competence.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Rótulo humano: `Março de 2026`. */
export function describeCompetence(competence: string): string {
  if (!isValidCompetence(competence)) return competence;
  const [y, m] = competence.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

// ---------------------------------------------------------------------------
// Vocabulário
// ---------------------------------------------------------------------------

/** Texto do status. Nunca só cor — a tela precisa dizer a palavra. */
export function describeAnswerStatus(status: CriterionAnswerStatus): string {
  switch (status) {
    case 'conforme': return 'Conforme';
    case 'nao_conforme': return 'Não conforme';
    case 'nao_aplicavel': return 'Não aplicável';
    case 'nao_avaliado': return 'Não avaliado';
  }
}

export function describeAuditStatus(status: MonthlyAuditStatus): string {
  switch (status) {
    case 'draft': return 'Em preenchimento';
    case 'submitted': return 'Aguardando validação';
    case 'returned': return 'Devolvida para correção';
    case 'approved': return 'Aprovada';
    case 'superseded': return 'Substituída';
  }
}

/** A auditoria aceita edição? Devolvida reabre — é o que devolver significa. */
export function isEditable(audit: MonthlyAudit): boolean {
  return audit.status === 'draft' || audit.status === 'returned';
}

/** Aprovada é somente leitura, e tem snapshot oficial. */
export function isApproved(audit: MonthlyAudit): boolean {
  return audit.status === 'approved';
}

// ---------------------------------------------------------------------------
// Pontuação — PROVISÓRIA (pendência A-10)
// ---------------------------------------------------------------------------

/**
 * Espelha `app.monthly_audit_score`: proporção simples de conformidade, com
 * `nao_aplicavel` fora do numerador E do denominador.
 *
 * **Não é ponderação e não é o Índice de Excelência.** Critérios não têm peso —
 * os dez campos de D4 não incluem um — e inventar um seria regra empresarial que
 * ninguém declarou. Enquanto A-10 estiver aberta, a tela deve dizer que o número
 * é provisório.
 */
export function monthlyScore(criteria: MaterializedCriterion[]): number {
  const avaliados = criteria.filter(
    (c) => c.answer.status === 'conforme' || c.answer.status === 'nao_conforme',
  );
  if (avaliados.length === 0) return 0;
  const conformes = avaliados.filter((c) => c.answer.status === 'conforme').length;
  return Math.round((conformes / avaliados.length) * 10000) / 100;
}

export const SCORE_RULE_PENDING = 'proporcao-simples/A-10-pendente';

/** A nota exibida ainda é provisória? */
export function isProvisionalScore(scoreRule: string): boolean {
  return scoreRule.includes('A-10-pendente');
}

// ---------------------------------------------------------------------------
// Autorização — espelho de `app.is_assisted_operator` e da Matriz §4
// ---------------------------------------------------------------------------

/**
 * Quem CRIA, RESPONDE e ENVIA: o Gerente de Canal responsável pelo parceiro.
 *
 * Permissão administrativa NÃO é atalho (Matriz §4, nota ¹): ADMIN, REGIONAL e
 * COORDENADOR consultam e VALIDAM, mas não respondem em nome do GC.
 */
export function canOperateMonthly(subject: AuthzSubject, operationId: string): boolean {
  return hasRole(subject, 'channel_manager') && subject.assignedOperationIds.includes(operationId);
}

/**
 * Quem VALIDA: admin, regional ou coordenador — e nunca o autor.
 * Espelha `validate_evaluation` (0031), incluindo a ordem: a segregação de
 * funções vem antes do papel.
 */
export function canValidateMonthly(subject: AuthzSubject, audit: MonthlyAudit): boolean {
  if (audit.authorUserId === subject.userId) return false;
  if (audit.status !== 'submitted') return false;
  return hasRole(subject, 'admin') || hasRole(subject, 'regional') || hasRole(subject, 'coordinator');
}

// ---------------------------------------------------------------------------
// Guardas de submissão — espelho dos seis portões
// ---------------------------------------------------------------------------

export type SubmitBlock =
  | { reason: 'sem-criterios' }
  | { reason: 'obrigatorio-sem-avaliacao'; criterionCode: string }
  | { reason: 'evidencia-ausente'; criterionCode: string }
  | { reason: 'nao-conforme-sem-diagnostico'; criterionCode: string }
  | { reason: 'nao-conforme-sem-plano'; criterionCode: string }
  | { reason: 'plano-sem-responsavel-ou-prazo'; criterionCode: string }
  | { reason: 'na-sem-justificativa'; criterionCode: string };

/**
 * Espelha `app.na_reason_is_valid`: dez caracteres úteis depois de remover
 * espaço, ponto, hífen, travessão e sublinhado. É o que impede "n/a" e "---" de
 * passarem por justificativa.
 */
export function isUsefulJustification(text: string): boolean {
  return (text ?? '').replace(/[\s.\-–—_]/g, '').length >= 10;
}

/**
 * Tudo que impede enviar esta auditoria, **na ordem em que o servidor
 * recusaria**. Lista vazia = o servidor deve aceitar.
 *
 * A ordem importa: quem corrigir o primeiro item e tentar de novo deve encontrar
 * o segundo, e não uma recusa diferente da que a interface previu.
 */
export function submitBlocks(audit: MonthlyAudit): SubmitBlock[] {
  if (audit.criteria.length === 0) return [{ reason: 'sem-criterios' }];

  const ordered = [...audit.criteria].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.criterionCode.localeCompare(b.criterionCode),
  );
  const blocks: SubmitBlock[] = [];

  for (const c of ordered) {
    if (c.required && c.answer.status === 'nao_avaliado') {
      blocks.push({ reason: 'obrigatorio-sem-avaliacao', criterionCode: c.criterionCode });
    }
  }
  for (const c of ordered) {
    if (c.evidenceRequired && c.answer.status !== 'nao_aplicavel' && c.answer.evidences.length === 0) {
      blocks.push({ reason: 'evidencia-ausente', criterionCode: c.criterionCode });
    }
  }
  for (const c of ordered) {
    if (c.answer.status === 'nao_conforme' && c.answer.diagnosis.trim() === '') {
      blocks.push({ reason: 'nao-conforme-sem-diagnostico', criterionCode: c.criterionCode });
    }
  }
  for (const c of ordered) {
    if (c.answer.status === 'nao_conforme' && c.answer.plans.length === 0) {
      blocks.push({ reason: 'nao-conforme-sem-plano', criterionCode: c.criterionCode });
    }
  }
  for (const c of ordered) {
    if (c.answer.status === 'nao_conforme'
        && c.answer.plans.some((p) => p.owner.trim() === '' || !p.dueDate)) {
      blocks.push({ reason: 'plano-sem-responsavel-ou-prazo', criterionCode: c.criterionCode });
    }
  }
  for (const c of ordered) {
    if (c.answer.status === 'nao_aplicavel' && c.requiresJustification
        && !isUsefulJustification(c.answer.justification)) {
      blocks.push({ reason: 'na-sem-justificativa', criterionCode: c.criterionCode });
    }
  }
  return blocks;
}

/** Texto apresentável de cada bloqueio. Sem jargão de banco. */
export function describeSubmitBlock(block: SubmitBlock): string {
  switch (block.reason) {
    case 'sem-criterios':
      return 'A região deste parceiro ainda não publicou nenhum critério de processo para a '
        + 'Auditoria Mensal.';
    case 'obrigatorio-sem-avaliacao':
      return `${block.criterionCode}: critério obrigatório ainda sem resposta.`;
    case 'evidencia-ausente':
      return `${block.criterionCode}: este critério exige evidência anexada.`;
    case 'nao-conforme-sem-diagnostico':
      return `${block.criterionCode}: a não conformidade exige diagnóstico.`;
    case 'nao-conforme-sem-plano':
      return `${block.criterionCode}: a não conformidade exige ao menos um plano de ação.`;
    case 'plano-sem-responsavel-ou-prazo':
      return `${block.criterionCode}: o plano precisa de responsável e prazo.`;
    case 'na-sem-justificativa':
      return `${block.criterionCode}: "não aplicável" exige justificativa neste critério.`;
  }
}

export function canSubmit(audit: MonthlyAudit): boolean {
  return isEditable(audit) && submitBlocks(audit).length === 0;
}

// ---------------------------------------------------------------------------
// Validação de uma resposta, antes de bater no servidor
// ---------------------------------------------------------------------------

export type AnswerFieldError =
  | { field: 'status'; message: string }
  | { field: 'justification'; message: string }
  | { field: 'diagnosis'; message: string };

/**
 * Espelha `app.guard_criterion_answer_coherence` (0042) e o portão (3) de
 * `submit_monthly_audit`.
 *
 * O diagnóstico NÃO é validado na gravação — o rascunho pode ficar incompleto —,
 * mas a interface o exibe como obrigatório para que o operador não descubra só
 * no envio.
 */
export function validateAnswer(
  criterion: Pick<MaterializedCriterion, 'allowsNa' | 'requiresJustification'>,
  input: { status: CriterionAnswerStatus; justification: string },
): AnswerFieldError[] {
  const errors: AnswerFieldError[] = [];
  if (input.status === 'nao_aplicavel') {
    if (!criterion.allowsNa) {
      errors.push({ field: 'status', message: 'Este critério não admite "não aplicável".' });
      return errors;
    }
    if (criterion.requiresJustification && !isUsefulJustification(input.justification)) {
      errors.push({
        field: 'justification',
        message: 'Justifique em pelo menos 10 caracteres úteis.',
      });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Agrupamento e resumo
// ---------------------------------------------------------------------------

export interface MonthlyThemeGroup {
  themeId: string;
  themeCode: string;
  themeName: string;
  indicatorCode: string;
  indicatorName: string;
  criteria: MaterializedCriterion[];
}

/**
 * Critérios agrupados por INDICADOR dentro do tema, na ordem que a região
 * configurou.
 *
 * O agrupamento é por indicador, e não só por tema, porque é o indicador que
 * carrega o questionário: um tema pode ter vários indicadores auditáveis, e
 * misturar seus critérios numa lista só perderia a pergunta *"o processo de
 * qual indicador?"*.
 *
 * Os nomes vêm da CÓPIA congelada, não do catálogo atual: renomear amanhã não
 * pode reescrever a leitura de uma auditoria aprovada.
 */
export function groupByIndicator(criteria: MaterializedCriterion[]): MonthlyThemeGroup[] {
  const groups = new Map<string, MonthlyThemeGroup>();
  const ordered = [...criteria].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.criterionCode.localeCompare(b.criterionCode),
  );
  for (const c of ordered) {
    const key = `${c.provenance.themeId}:${c.provenance.indicatorDefinitionId}`;
    const g = groups.get(key);
    if (g) g.criteria.push(c);
    else groups.set(key, {
      themeId: c.provenance.themeId,
      themeCode: c.themeCode,
      themeName: c.themeName,
      indicatorCode: c.indicatorCode,
      indicatorName: c.indicatorName,
      criteria: [c],
    });
  }
  return [...groups.values()];
}

/** Contagem por status, para o resumo do cabeçalho. */
export function countByAnswerStatus(
  criteria: MaterializedCriterion[],
): Record<CriterionAnswerStatus, number> {
  const counts: Record<CriterionAnswerStatus, number> = {
    conforme: 0, nao_conforme: 0, nao_aplicavel: 0, nao_avaliado: 0,
  };
  for (const c of criteria) counts[c.answer.status] += 1;
  return counts;
}
