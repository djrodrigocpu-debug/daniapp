/**
 * Adapters da Auditoria Mensal — por MOCK do SupabaseClient.
 *
 * Estes testes NÃO provam que o servidor obedece: isso está provado contra
 * Postgres real em `src/db/monthly_audit.integration.test.ts`. Aqui se prova o
 * CONTRATO que o cliente emite (qual RPC, com quais argumentos) e a tradução da
 * resposta — mais o compromisso do adapter de demonstração de não fingir.
 *
 * Dados 100% sintéticos (§23).
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MONTHLY_AUDIT_UNAVAILABLE_MESSAGE,
  SupabaseMonthlyAuditRepository,
  UnavailableMonthlyAuditRepository,
} from './MonthlyAuditRepository';
import type { SupabaseEvidenceRepository } from './EvidenceRepository';
import { isErr, isOk, ok, Result } from '../../domain/errors/result';

interface RpcCall { name: string; params: Record<string, unknown> }

function thenable(result: { data?: unknown; error?: unknown }) {
  return {
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: result.data ?? null, error: result.error ?? null }),
  };
}

function fakeClient(
  rpc: Record<string, (params: Record<string, unknown>) => { data?: unknown; error?: unknown }> = {},
) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpc(name: string, params: Record<string, unknown>) {
      rpcCalls.push({ name, params });
      const handler = rpc[name];
      return thenable(handler ? handler(params) : { error: { message: `RPC ${name} não mockada` } });
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

/** Dublê do repositório de evidência: registra a delegação e nada mais. */
function fakeEvidence() {
  const attaches: Array<{ evaluationId: string; themeId: string; input: Record<string, unknown> }> = [];
  const repo = {
    attach(evaluationId: string, themeId: string, input: Record<string, unknown>) {
      attaches.push({ evaluationId, themeId, input });
      return Promise.resolve(ok({ id: 'ev-1' }) as Result<unknown>);
    },
  };
  return { evidence: repo as unknown as SupabaseEvidenceRepository, attaches };
}

/** Resposta crua da RPC, com numéricos como STRING — é como o PostgREST entrega. */
const auditoriaCrua = {
  id: 'e-1',
  operationId: 'op-1',
  partnerName: 'Parceiro Fictício',
  evaluationModel: 'monthly_criteria',
  competence: '2026-03',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-31',
  cycleLabel: 'Março de 2026',
  status: 'draft',
  score: '66.67',
  authorUserId: 'u-gc',
  authorName: 'GC Fic',
  submittedAt: null,
  validatedAt: null,
  validatorId: null,
  validatorName: null,
  validatorNote: null,
  approvedAt: null,
  criteria: [
    {
      id: 'c-1',
      evaluationId: 'e-1',
      regionalConfigId: 'rc-1',
      regionalConfigVersionId: 'rcv-1',
      indicatorDefinitionId: 'd-1',
      indicatorVersionId: 'iv-1',
      themeId: 't-1',
      themeVersionId: 'tv-1',
      criterionId: 'cr-1',
      criterionVersionId: 'crv-1',
      criterionCode: 'CRIT-01',
      indicatorCode: 'IND-1',
      indicatorName: 'Conversão auditada',
      themeCode: 'TEMA-1',
      themeName: 'Processo comercial',
      question: 'Existe rotina documentada?',
      description: null,
      guidance: null,
      sortOrder: 1,
      required: true,
      evidenceRequired: true,
      allowsNa: false,
      requiresJustification: false,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: null,
      answer: {
        id: 'a-1',
        status: 'nao_conforme',
        justification: null,
        observation: null,
        diagnosis: 'Rotina inexistente',
        answeredBy: 'u-gc',
        answeredAt: '2026-03-10T12:00:00Z',
        evidences: [{
          id: 'ev-1', name: 'rotina.pdf', mimeType: 'application/pdf',
          sizeBytes: '2048', createdAt: '2026-03-10T12:00:00Z',
        }],
        plans: [{
          id: 'p-1', action: 'Implantar rotina', owner: 'Gerente',
          dueDate: '2099-12-31', priority: 'high', status: 'not_started',
        }],
      },
    },
    // Critério recém-materializado: o servidor devolve `answer` preenchido, mas
    // o adapter precisa aguentar a ausência sem quebrar a tela.
    {
      id: 'c-2',
      evaluationId: 'e-1',
      regionalConfigId: 'rc-1', regionalConfigVersionId: 'rcv-1',
      indicatorDefinitionId: 'd-1', indicatorVersionId: 'iv-1',
      themeId: 't-1', themeVersionId: 'tv-1',
      criterionId: 'cr-2', criterionVersionId: 'crv-2',
      criterionCode: 'CRIT-02', indicatorCode: 'IND-1', indicatorName: 'Conversão auditada',
      themeCode: 'TEMA-1', themeName: 'Processo comercial',
      question: 'Há reunião semanal?', description: null, guidance: null,
      sortOrder: 2, required: true, evidenceRequired: false,
      allowsNa: true, requiresJustification: true,
      effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null,
      answer: null,
    },
  ],
};

describe('SupabaseMonthlyAuditRepository — contrato emitido', () => {
  const build = (rpc: Parameters<typeof fakeClient>[0] = {}) => {
    const { client, rpcCalls } = fakeClient(rpc);
    const { evidence, attaches } = fakeEvidence();
    return { repo: new SupabaseMonthlyAuditRepository(client, evidence), rpcCalls, attaches };
  };

  it('iniciar manda operação e competência, sem inventar data', async () => {
    const { repo, rpcCalls } = build({ start_monthly_audit: () => ({ data: auditoriaCrua }) });
    await repo.startAudit('op-1', '2026-03');
    expect(rpcCalls[0]).toEqual({
      name: 'start_monthly_audit',
      params: { p_operation_id: 'op-1', p_competence: '2026-03' },
    });
  });

  it('numéricos vindos como string viram número no domínio', async () => {
    const { repo } = build({ start_monthly_audit: () => ({ data: auditoriaCrua }) });
    const res = await repo.startAudit('op-1', '2026-03');
    if (!isOk(res)) throw new Error('esperava sucesso');
    expect(res.value.score).toBeCloseTo(66.67, 2);
    expect(res.value.criteria[0].answer.evidences[0].sizeBytes).toBe(2048);
  });

  it('resposta ausente vira `nao_avaliado` com listas vazias, não `null`', async () => {
    // Inventar `null` aqui obrigaria toda a tela a tratar dois casos onde há um.
    const { repo } = build({ start_monthly_audit: () => ({ data: auditoriaCrua }) });
    const res = await repo.startAudit('op-1', '2026-03');
    if (!isOk(res)) throw new Error('esperava sucesso');
    const c2 = res.value.criteria[1];
    expect(c2.answer.status).toBe('nao_avaliado');
    expect(c2.answer.evidences).toEqual([]);
    expect(c2.answer.plans).toEqual([]);
    expect(c2.answer.justification).toBe('');
  });

  it('a proveniência das oito FKs chega inteira ao domínio', async () => {
    const { repo } = build({ start_monthly_audit: () => ({ data: auditoriaCrua }) });
    const res = await repo.startAudit('op-1', '2026-03');
    if (!isOk(res)) throw new Error('esperava sucesso');
    expect(res.value.criteria[0].provenance).toEqual({
      regionalConfigId: 'rc-1', regionalConfigVersionId: 'rcv-1',
      indicatorDefinitionId: 'd-1', indicatorVersionId: 'iv-1',
      themeId: 't-1', themeVersionId: 'tv-1',
      criterionId: 'cr-1', criterionVersionId: 'crv-1',
    });
  });

  it('competência ainda não iniciada chega como NULO de sucesso, não como erro', async () => {
    const { repo } = build({ get_monthly_audit: () => ({ data: null }) });
    const res = await repo.getAudit('op-1', '2031-12');
    expect(isOk(res) && res.value).toBeNull();
  });

  it('o patch da resposta NÃO carrega score nem status da auditoria', async () => {
    const { repo, rpcCalls } = build({
      save_criterion_answer: () => ({ data: auditoriaCrua.criteria[0] }),
    });
    await repo.saveAnswer('a-1', { status: 'conforme', diagnosis: '' });
    const patch = rpcCalls[0].params.p_patch as Record<string, unknown>;
    expect(Object.keys(patch)).not.toContain('score');
    expect(Object.keys(patch)).not.toContain('question');
    expect(patch.status).toBe('conforme');
  });

  it('o plano vai pelo MOTOR ÚNICO: save_action_plan com monthlyCriterionAnswerId', async () => {
    const { repo, rpcCalls } = build({ save_action_plan: () => ({ data: { id: 'p-1' } }) });
    await repo.savePlan('op-1', 'e-1', 'a-1', {
      action: 'Implantar', owner: 'Gerente', dueDate: '2099-12-31',
    });
    expect(rpcCalls[0].name).toBe('save_action_plan');
    const input = rpcCalls[0].params.p_input as Record<string, unknown>;
    expect(input.monthlyCriterionAnswerId).toBe('a-1');
    expect(input.evaluationId).toBe('e-1');
    expect(input.operationId).toBe('op-1');
    // Nenhuma RPC própria de plano mensal foi inventada.
    expect(rpcCalls.map((c) => c.name)).not.toContain('save_monthly_action_plan');
    // E nenhuma origem cruzada foi enviada junto.
    expect(Object.keys(input)).not.toContain('assistedEntryId');
  });

  it('a evidência DELEGA ao repositório existente — nenhuma cópia do caminho físico', async () => {
    const { repo, attaches, rpcCalls } = build();
    await repo.attachEvidence('e-1', 'CRIT-01', {
      name: 'rotina.pdf', mimeType: 'application/pdf', sizeBytes: 2048, uri: 'file:///x',
    });
    expect(attaches).toHaveLength(1);
    expect(attaches[0].evaluationId).toBe('e-1');
    // O código do CRITÉRIO ocupa o lugar do `themeId`: é o servidor que despacha
    // pelo modelo da avaliação.
    expect(attaches[0].themeId).toBe('CRIT-01');
    expect(attaches[0].input.type).toBe('document');
    // Nenhuma reserva foi emitida direto pelo adapter mensal.
    expect(rpcCalls.map((c) => c.name)).not.toContain('reserve_evidence_upload');
  });

  it('imagem é classificada como foto; o resto, como documento', async () => {
    const { repo, attaches } = build();
    await repo.attachEvidence('e-1', 'CRIT-01', {
      name: 'painel.png', mimeType: 'image/png', sizeBytes: 100, uri: 'file:///y',
    });
    expect(attaches[0].input.type).toBe('photo');
  });

  it('a validação usa validate_evaluation — nenhum fluxo de aprovação paralelo', async () => {
    const { repo, rpcCalls } = build({ validate_evaluation: () => ({ data: auditoriaCrua }) });
    await repo.validateAudit('e-1', 'approved', 'Aprovada');
    expect(rpcCalls[0]).toEqual({
      name: 'validate_evaluation',
      params: { p_evaluation_id: 'e-1', p_decision: 'approved', p_note: 'Aprovada' },
    });
  });

  it('o snapshot preserva a regra de pontuação declarada pelo servidor', async () => {
    const { repo } = build({
      get_monthly_audit_snapshot: () => ({
        data: {
          snapshotId: 's-1', evaluationId: 'e-1', period: '2026-03', score: '66.67',
          approvedBy: 'Coord Fic', approvedAt: '2026-04-01T12:00:00Z',
          scoreRule: 'proporcao-simples/A-10-pendente', official: auditoriaCrua,
        },
      }),
    });
    const res = await repo.getSnapshot('e-1');
    if (!isOk(res)) throw new Error('esperava sucesso');
    expect(res.value.scoreRule).toBe('proporcao-simples/A-10-pendente');
    expect(res.value.score).toBeCloseTo(66.67, 2);
    expect(res.value.official.criteria).toHaveLength(2);
  });

  it('a mensagem do servidor é repassada CRUA — é ela que resolve o problema', async () => {
    const literal = 'envio bloqueado: CRIT-03 em nao conformidade sem plano de acao';
    const { repo } = build({ submit_monthly_audit: () => ({ error: { message: literal } }) });
    const res = await repo.submitAudit('e-1');
    expect(isErr(res) && res.error.message).toBe(literal);
  });

  it('sem mensagem do servidor, cai num texto que ainda diz o que falhou', async () => {
    const { repo } = build({ submit_monthly_audit: () => ({ error: {} }) });
    const res = await repo.submitAudit('e-1');
    expect(isErr(res) && res.error.message).toBe('Falha ao enviar a auditoria.');
  });
});

describe('UnavailableMonthlyAuditRepository — honesto em vez de vazio', () => {
  const repo = new UnavailableMonthlyAuditRepository();

  it('recusa TODA operação, leitura inclusive', async () => {
    const resultados: Result<unknown>[] = await Promise.all([
      repo.startAudit('op-1', '2026-03'),
      repo.getAudit('op-1', '2026-03'),
      repo.listAudits('op-1'),
      repo.saveAnswer('a-1', {}),
      repo.attachEvidence('e-1', 'CRIT-01', { name: 'x', mimeType: 'application/pdf', sizeBytes: 1, uri: 'x' }),
      repo.removeEvidence('e-1', 'ev-1'),
      repo.savePlan('op-1', 'e-1', 'a-1', { action: 'a', owner: 'o', dueDate: '2099-01-01' }),
      repo.submitAudit('e-1'),
      repo.validateAudit('e-1', 'approved', ''),
      repo.getSnapshot('e-1'),
    ]);
    for (const r of resultados) {
      expect(isErr(r)).toBe(true);
      expect(isErr(r) && r.error.message).toBe(MONTHLY_AUDIT_UNAVAILABLE_MESSAGE);
    }
  });

  it('NUNCA devolve lista vazia — isso seria pior que recusar', async () => {
    // "Nenhuma competência iniciada" e "não há Auditoria Mensal aqui" são coisas
    // diferentes, e a segunda não pode se disfarçar da primeira.
    expect(isOk(await repo.listAudits('op-1'))).toBe(false);
  });

  it('a frase diz POR QUE, não só que falhou', () => {
    expect(MONTHLY_AUDIT_UNAVAILABLE_MESSAGE).toMatch(/ambiente corporativo/);
    expect(MONTHLY_AUDIT_UNAVAILABLE_MESSAGE).toMatch(/servidor/);
    expect(MONTHLY_AUDIT_UNAVAILABLE_MESSAGE).toMatch(/competência/);
  });
});
