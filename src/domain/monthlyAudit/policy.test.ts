/**
 * Regras de domínio da AUDITORIA MENSAL — puras, sem banco e sem React.
 *
 * O QUE ESTES TESTES SÃO. O espelho de domínio existe para que a interface não
 * ofereça o que o servidor recusaria. Se ele divergir do servidor, a tela mente
 * — habilita "Enviar" e o clique falha, ou desabilita e o operador não sabe por
 * quê. Cada caso aqui tem contraparte em
 * `src/db/monthly_audit.integration.test.ts`, e é a IGUALDADE entre os dois que
 * importa.
 *
 * Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import {
  canOperateMonthly,
  canSubmit,
  canValidateMonthly,
  competenceOf,
  countByAnswerStatus,
  currentCompetence,
  describeAnswerStatus,
  describeAuditStatus,
  describeCompetence,
  describeSubmitBlock,
  groupByIndicator,
  isApproved,
  isEditable,
  isProvisionalScore,
  isUsefulJustification,
  isValidCompetence,
  monthlyScore,
  SCORE_RULE_PENDING,
  shiftCompetence,
  submitBlocks,
  validateAnswer,
} from './policy';
import { CriterionAnswerStatus, MaterializedCriterion, MonthlyAudit } from './types';
import { AuthzSubject } from '../authz/policy';

// ---------------------------------------------------------------------------

/**
 * `answer` entra como PARCIAL de propósito: cada caso de teste só declara o que
 * é relevante para ele, e o resto vem do padrão. Declarar a resposta inteira em
 * quarenta lugares esconderia o que cada teste está de fato medindo.
 */
type CriterionOverride =
  Omit<Partial<MaterializedCriterion>, 'answer'>
  & { criterionCode: string; answer?: Partial<MaterializedCriterion['answer']> };

function criterion(over: CriterionOverride): MaterializedCriterion {
  const { answer, ...rest } = over;
  return {
    id: `c-${over.criterionCode}`,
    evaluationId: 'e-1',
    provenance: {
      regionalConfigId: 'rc-1', regionalConfigVersionId: 'rcv-1',
      indicatorDefinitionId: 'd-1', indicatorVersionId: 'iv-1',
      themeId: 't-1', themeVersionId: 'tv-1',
      criterionId: 'cr-1', criterionVersionId: 'crv-1',
    },
    indicatorCode: 'IND-1',
    indicatorName: 'Indicador',
    themeCode: 'TEMA-1',
    themeName: 'Tema 1',
    question: 'Existe rotina?',
    description: '',
    guidance: '',
    sortOrder: 1,
    required: true,
    evidenceRequired: false,
    allowsNa: false,
    requiresJustification: false,
    effectiveFrom: '2026-01-01T00:00:00Z',
    effectiveTo: null,
    ...rest,
    answer: {
      id: `a-${over.criterionCode}`,
      status: 'nao_avaliado',
      justification: '',
      observation: '',
      diagnosis: '',
      answeredBy: null,
      answeredAt: null,
      evidences: [],
      plans: [],
      ...answer,
    },
  };
}

function audit(criteria: MaterializedCriterion[], over: Partial<MonthlyAudit> = {}): MonthlyAudit {
  return {
    id: 'e-1',
    operationId: 'op-1',
    partnerName: 'Parceiro Fictício',
    evaluationModel: 'monthly_criteria',
    competence: '2026-03',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    cycleLabel: 'Março de 2026',
    status: 'draft',
    score: 0,
    authorUserId: 'u-gc',
    authorName: 'GC Fic',
    submittedAt: null,
    validatedAt: null,
    validatorId: null,
    validatorName: null,
    validatorNote: '',
    approvedAt: null,
    criteria,
    ...over,
  };
}

const planoOk = {
  id: 'p-1', action: 'Implantar rotina', owner: 'Gerente',
  dueDate: '2099-12-31', priority: 'high', status: 'not_started',
};

// ---------------------------------------------------------------------------

describe('competência', () => {
  it('aceita AAAA-MM e recusa o resto', () => {
    for (const c of ['2026-01', '2026-12', '1999-07']) expect(isValidCompetence(c), c).toBe(true);
    for (const c of ['2026-13', '2026-00', '202601', '2026-1', 'marco', '']) {
      expect(isValidCompetence(c), c).toBe(false);
    }
  });

  it('a competência de um dia é o recorte da string, sem construir Date', () => {
    // Construir `Date` reintroduziria fuso onde não há: `AAAA-MM-DD` já é dia de
    // calendário, e é assim que o servidor faz com `to_char`.
    expect(competenceOf('2026-03-31')).toBe('2026-03');
    expect(competenceOf('2026-01-01')).toBe('2026-01');
  });

  it('"hoje" é lido em America/Sao_Paulo, não em UTC', () => {
    // 01/04 00:30 UTC ainda é 31/03 em São Paulo. Ler em UTC viraria a
    // competência um dia antes da hora para o país inteiro.
    expect(currentCompetence(new Date('2026-04-01T00:30:00Z'))).toBe('2026-03');
  });

  it('navega entre competências, virando o ano nos dois sentidos', () => {
    expect(shiftCompetence('2026-01', -1)).toBe('2025-12');
    expect(shiftCompetence('2026-12', 1)).toBe('2027-01');
    expect(shiftCompetence('2026-03', -14)).toBe('2025-01');
  });

  it('descreve em português', () => {
    expect(describeCompetence('2026-03')).toBe('Março de 2026');
    expect(describeCompetence('2026-12')).toBe('Dezembro de 2026');
    // Entrada inválida não vira "undefined de NaN".
    expect(describeCompetence('lixo')).toBe('lixo');
  });
});

describe('vocabulário', () => {
  it('cada status de resposta tem palavra própria — a tela nunca depende só de cor', () => {
    const palavras = (['conforme', 'nao_conforme', 'nao_aplicavel', 'nao_avaliado'] as const)
      .map(describeAnswerStatus);
    expect(palavras).toEqual(['Conforme', 'Não conforme', 'Não aplicável', 'Não avaliado']);
    expect(new Set(palavras).size).toBe(4);
  });

  it('NÃO existe estado intermediário: quatro valores, não cinco', () => {
    // A diferença para `traffic_light` é o amarelo, e é deliberada: auditoria de
    // processo pergunta se o processo existe e é executado.
    const todos: CriterionAnswerStatus[] = ['conforme', 'nao_conforme', 'nao_aplicavel', 'nao_avaliado'];
    expect(todos).toHaveLength(4);
    expect(todos as string[]).not.toContain('parcial');
  });

  it('devolvida REABRE para correção; enviada e aprovada não', () => {
    expect(isEditable(audit([], { status: 'draft' }))).toBe(true);
    expect(isEditable(audit([], { status: 'returned' }))).toBe(true);
    expect(isEditable(audit([], { status: 'submitted' }))).toBe(false);
    expect(isEditable(audit([], { status: 'approved' }))).toBe(false);
    expect(isApproved(audit([], { status: 'approved' }))).toBe(true);
    expect(describeAuditStatus('returned')).toBe('Devolvida para correção');
  });
});

describe('pontuação — provisória (A-10)', () => {
  it('é proporção simples de conformidade', () => {
    expect(monthlyScore([
      criterion({ criterionCode: 'A', answer: { status: 'conforme' } }),
      criterion({ criterionCode: 'B', answer: { status: 'conforme' } }),
      criterion({ criterionCode: 'C', answer: { status: 'nao_conforme' } }),
    ])).toBeCloseTo(66.67, 1);
  });

  it('nao_aplicavel fica fora do numerador E do denominador', () => {
    const comNa = monthlyScore([
      criterion({ criterionCode: 'A', answer: { status: 'conforme' } }),
      criterion({ criterionCode: 'B', answer: { status: 'nao_conforme' } }),
      criterion({ criterionCode: 'C', answer: { status: 'nao_aplicavel' } }),
    ]);
    // 1/2 = 50. Se o N/A entrasse no denominador seria 33,33.
    expect(comNa).toBe(50);
  });

  it('nao_avaliado também fica fora — rascunho não é nota zero', () => {
    expect(monthlyScore([
      criterion({ criterionCode: 'A', answer: { status: 'conforme' } }),
      criterion({ criterionCode: 'B', answer: { status: 'nao_avaliado' } }),
    ])).toBe(100);
  });

  it('sem nada avaliado, a nota é zero — e não divisão por zero', () => {
    expect(monthlyScore([criterion({ criterionCode: 'A' })])).toBe(0);
    expect(monthlyScore([])).toBe(0);
  });

  it('a regra se identifica como PROVISÓRIA', () => {
    expect(isProvisionalScore(SCORE_RULE_PENDING)).toBe(true);
    expect(SCORE_RULE_PENDING).toMatch(/A-10/);
    expect(isProvisionalScore('ponderada/1.4.0')).toBe(false);
  });
});

describe('autorização', () => {
  const gc = (ops: string[]): AuthzSubject => ({
    userId: 'u-gc', roles: ['channel_manager'], regionIds: [], coordinationIds: [],
    assignedOperationIds: ops,
  });
  const coord: AuthzSubject = {
    userId: 'u-coord', roles: ['coordinator'], regionIds: [], coordinationIds: ['c-1'],
    assignedOperationIds: [],
  };

  it('o GC responsável opera; o de outro parceiro, não', () => {
    expect(canOperateMonthly(gc(['op-1']), 'op-1')).toBe(true);
    expect(canOperateMonthly(gc(['op-2']), 'op-1')).toBe(false);
  });

  it('ADMIN, REGIONAL e COORDENADOR não respondem em nome do GC', () => {
    for (const roles of [['admin'], ['regional'], ['coordinator']] as const) {
      const s: AuthzSubject = {
        userId: 'u', roles: [...roles], regionIds: ['r-1'], coordinationIds: ['c-1'],
        assignedOperationIds: ['op-1'],
      };
      expect(canOperateMonthly(s, 'op-1'), roles[0]).toBe(false);
    }
  });

  it('quem valida NÃO é o autor, e só valida o que está aguardando validação', () => {
    const enviada = audit([], { status: 'submitted', authorUserId: 'u-gc' });
    expect(canValidateMonthly(coord, enviada)).toBe(true);
    expect(canValidateMonthly({ ...coord, userId: 'u-gc' }, enviada)).toBe(false);
    expect(canValidateMonthly(coord, audit([], { status: 'draft' }))).toBe(false);
    expect(canValidateMonthly(coord, audit([], { status: 'approved' }))).toBe(false);
  });

  it('o GC não valida — nem a de outro', () => {
    const enviada = audit([], { status: 'submitted', authorUserId: 'outro' });
    expect(canValidateMonthly(gc(['op-1']), enviada)).toBe(false);
  });
});

describe('guardas de submissão', () => {
  it('auditoria sem critério nenhum não é enviável', () => {
    expect(submitBlocks(audit([]))).toEqual([{ reason: 'sem-criterios' }]);
  });

  it('critério obrigatório sem resposta bloqueia, nomeando o critério', () => {
    expect(submitBlocks(audit([criterion({ criterionCode: 'CRIT-01' })])))
      .toEqual([{ reason: 'obrigatorio-sem-avaliacao', criterionCode: 'CRIT-01' }]);
  });

  it('critério NÃO obrigatório sem resposta não bloqueia', () => {
    expect(submitBlocks(audit([criterion({ criterionCode: 'CRIT-01', required: false })])))
      .toEqual([]);
  });

  it('evidência obrigatória ausente bloqueia', () => {
    const blocks = submitBlocks(audit([
      criterion({ criterionCode: 'CRIT-01', evidenceRequired: true, answer: { status: 'conforme' } }),
    ]));
    expect(blocks).toEqual([{ reason: 'evidencia-ausente', criterionCode: 'CRIT-01' }]);
  });

  it('N/A dispensa a evidência obrigatória — como o legado já faz', () => {
    const blocks = submitBlocks(audit([
      criterion({
        criterionCode: 'CRIT-01', evidenceRequired: true, allowsNa: true,
        answer: { status: 'nao_aplicavel' },
      }),
    ]));
    expect(blocks).toEqual([]);
  });

  it('não conformidade sem diagnóstico, sem plano e com plano incompleto bloqueiam', () => {
    expect(submitBlocks(audit([
      criterion({ criterionCode: 'CRIT-01', answer: { status: 'nao_conforme' } }),
    ])).map((b) => b.reason))
      .toEqual(['nao-conforme-sem-diagnostico', 'nao-conforme-sem-plano']);

    expect(submitBlocks(audit([
      criterion({ criterionCode: 'CRIT-01', answer: { status: 'nao_conforme', diagnosis: 'x' } }),
    ]))).toEqual([{ reason: 'nao-conforme-sem-plano', criterionCode: 'CRIT-01' }]);

    expect(submitBlocks(audit([
      criterion({
        criterionCode: 'CRIT-01',
        answer: { status: 'nao_conforme', diagnosis: 'x', plans: [{ ...planoOk, owner: '  ' }] },
      }),
    ]))).toEqual([{ reason: 'plano-sem-responsavel-ou-prazo', criterionCode: 'CRIT-01' }]);
  });

  it('MAIS DE UM plano é permitido, e basta que todos tenham responsável e prazo', () => {
    expect(submitBlocks(audit([
      criterion({
        criterionCode: 'CRIT-01',
        answer: {
          status: 'nao_conforme', diagnosis: 'x',
          plans: [planoOk, { ...planoOk, id: 'p-2', owner: 'Outro' }],
        },
      }),
    ]))).toEqual([]);
  });

  it('N/A sem justificativa útil bloqueia — "n/a" e "---" não passam', () => {
    for (const j of ['', 'n/a', '---', '  .  ']) {
      const blocks = submitBlocks(audit([
        criterion({
          criterionCode: 'CRIT-01', allowsNa: true, requiresJustification: true,
          answer: { status: 'nao_aplicavel', justification: j },
        }),
      ]));
      expect(blocks, `justificativa "${j}"`)
        .toEqual([{ reason: 'na-sem-justificativa', criterionCode: 'CRIT-01' }]);
    }
  });

  it('os bloqueios saem na ordem em que o servidor recusaria', () => {
    const blocks = submitBlocks(audit([
      criterion({
        criterionCode: 'CRIT-02', sortOrder: 2, evidenceRequired: true,
        answer: { status: 'conforme' },
      }),
      criterion({ criterionCode: 'CRIT-01', sortOrder: 1 }),
    ]));
    expect(blocks.map((b) => b.reason)).toEqual(['obrigatorio-sem-avaliacao', 'evidencia-ausente']);
  });

  it('auditoria completa é enviável; enviada já não é', () => {
    const completa = audit([
      criterion({ criterionCode: 'CRIT-01', answer: { status: 'conforme' } }),
      criterion({
        criterionCode: 'CRIT-02',
        answer: { status: 'nao_conforme', diagnosis: 'Causa', plans: [planoOk] },
      }),
    ]);
    expect(submitBlocks(completa)).toEqual([]);
    expect(canSubmit(completa)).toBe(true);
    expect(canSubmit({ ...completa, status: 'submitted' })).toBe(false);
  });

  it('cada bloqueio tem texto para o operador, sem jargão de banco', () => {
    const textos = [
      describeSubmitBlock({ reason: 'sem-criterios' }),
      describeSubmitBlock({ reason: 'obrigatorio-sem-avaliacao', criterionCode: 'C1' }),
      describeSubmitBlock({ reason: 'evidencia-ausente', criterionCode: 'C1' }),
      describeSubmitBlock({ reason: 'nao-conforme-sem-diagnostico', criterionCode: 'C1' }),
      describeSubmitBlock({ reason: 'nao-conforme-sem-plano', criterionCode: 'C1' }),
      describeSubmitBlock({ reason: 'plano-sem-responsavel-ou-prazo', criterionCode: 'C1' }),
      describeSubmitBlock({ reason: 'na-sem-justificativa', criterionCode: 'C1' }),
    ];
    for (const t of textos) {
      expect(t.length).toBeGreaterThan(20);
      expect(t).not.toMatch(/errcode|constraint|trigger|null|uuid|jsonb/i);
    }
  });
});

describe('justificativa útil — espelho de app.na_reason_is_valid', () => {
  it('exige dez caracteres úteis depois de remover pontuação e espaço', () => {
    expect(isUsefulJustification('Sem equipe propria nesta operacao')).toBe(true);
    expect(isUsefulJustification('1234567890')).toBe(true);
    expect(isUsefulJustification('123456789')).toBe(false);
    expect(isUsefulJustification('. . . . . . . . . . . .')).toBe(false);
    expect(isUsefulJustification('n/a')).toBe(false);
    expect(isUsefulJustification('')).toBe(false);
  });
});

describe('validação de uma resposta', () => {
  it('N/A é recusado onde o critério não o permite', () => {
    const erros = validateAnswer(
      { allowsNa: false, requiresJustification: false },
      { status: 'nao_aplicavel', justification: 'qualquer coisa longa' },
    );
    expect(erros).toEqual([{ field: 'status', message: 'Este critério não admite "não aplicável".' }]);
  });

  it('N/A permitido com justificativa exigida cobra a justificativa', () => {
    const erros = validateAnswer(
      { allowsNa: true, requiresJustification: true },
      { status: 'nao_aplicavel', justification: 'n/a' },
    );
    expect(erros.map((e) => e.field)).toEqual(['justification']);
  });

  it('conforme e não conforme não cobram justificativa', () => {
    for (const status of ['conforme', 'nao_conforme'] as const) {
      expect(validateAnswer(
        { allowsNa: true, requiresJustification: true },
        { status, justification: '' },
      )).toEqual([]);
    }
  });
});

describe('agrupamento e resumo', () => {
  it('agrupa por INDICADOR dentro do tema, na ordem configurada', () => {
    const grupos = groupByIndicator([
      criterion({ criterionCode: 'B', sortOrder: 2 }),
      criterion({
        criterionCode: 'C', sortOrder: 3, indicatorCode: 'IND-2', indicatorName: 'Outro',
        provenance: { ...criterion({ criterionCode: 'x' }).provenance, indicatorDefinitionId: 'd-2' },
      }),
      criterion({ criterionCode: 'A', sortOrder: 1 }),
    ]);
    expect(grupos.map((g) => g.indicatorCode)).toEqual(['IND-1', 'IND-2']);
    expect(grupos[0].criteria.map((c) => c.criterionCode)).toEqual(['A', 'B']);
  });

  it('dois indicadores do MESMO tema não viram um grupo só', () => {
    // Misturar seus critérios perderia a pergunta "o processo de qual indicador?".
    const grupos = groupByIndicator([
      criterion({ criterionCode: 'A' }),
      criterion({
        criterionCode: 'B', indicatorCode: 'IND-2',
        provenance: { ...criterion({ criterionCode: 'x' }).provenance, indicatorDefinitionId: 'd-2' },
      }),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.themeId === 't-1')).toBe(true);
  });

  it('usa os nomes COPIADOS no critério, não os do catálogo atual', () => {
    const grupos = groupByIndicator([
      criterion({ criterionCode: 'A', themeName: 'Nome à época', indicatorName: 'Indicador à época' }),
    ]);
    expect(grupos[0].themeName).toBe('Nome à época');
    expect(grupos[0].indicatorName).toBe('Indicador à época');
  });

  it('conta por status, incluindo os que estão em zero', () => {
    expect(countByAnswerStatus([
      criterion({ criterionCode: 'A', answer: { status: 'conforme' } }),
      criterion({ criterionCode: 'B', answer: { status: 'conforme' } }),
      criterion({ criterionCode: 'C', answer: { status: 'nao_aplicavel' } }),
    ])).toEqual({ conforme: 2, nao_conforme: 0, nao_aplicavel: 1, nao_avaliado: 0 });
  });
});
