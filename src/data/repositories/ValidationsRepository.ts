/**
 * Repositório de Validações (Masterplan §7.8, §14; Anexo D — T02).
 *
 * Regras impostas (espelho da RLS/servidor): sem autoaprovação (validador ≠ autor),
 * dentro do escopo, e apenas perfis validadores (coordenador/regional/admin — GC
 * não valida). Aprovação atualiza a nota oficial da operação e o histórico.
 * Adapters Local (REAL LOCAL) e Supabase (REAL REMOTO, pronto para conexão).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Evaluation } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { getScoreStatus } from '../../utils/format';
import { LocalStore, localStore } from '../store/localStore';
import { OperationScope, isOperationVisible } from './OperationsRepository';

export type ValidationDecision = 'approved' | 'returned';

export interface Validator {
  userId: string;
  role: OperationScope['role'];
}

export interface ValidationsRepository {
  /** Avaliações submetidas dentro do escopo do validador. */
  listPending(scope: OperationScope): Promise<Result<Evaluation[]>>;
  validate(
    evaluationId: string,
    validator: Validator,
    decision: ValidationDecision,
    note: string,
  ): Promise<Result<Evaluation>>;
}

const VALIDATOR_ROLES: OperationScope['role'][] = ['coordinator', 'regional', 'admin'];

export class LocalValidationsRepository implements ValidationsRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  async listPending(scope: OperationScope): Promise<Result<Evaluation[]>> {
    const data = this.store.getSnapshot();
    const visibleOpIds = new Set(
      data.operations.filter((op) => isOperationVisible(scope, op)).map((op) => op.id),
    );
    const pending = data.evaluations
      .filter((ev) => ev.status === 'submitted' && visibleOpIds.has(ev.operationId))
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
    return ok(pending);
  }

  async validate(
    evaluationId: string,
    validator: Validator,
    decision: ValidationDecision,
    note: string,
  ): Promise<Result<Evaluation>> {
    const data = this.store.getSnapshot();
    const evaluation = data.evaluations.find((ev) => ev.id === evaluationId);
    if (!evaluation) return err('validation/invalid-input', 'Avaliação não encontrada.');

    // Só valida o que está submetido (imutável após aprovação — §11.4).
    if (evaluation.status !== 'submitted') {
      return err('integrity/immutable-record', 'Esta avaliação não está aguardando validação.');
    }
    // Perfil validador.
    if (!VALIDATOR_ROLES.includes(validator.role)) {
      return err('authz/forbidden', 'Seu perfil não pode validar avaliações.');
    }
    // Sem autoaprovação (T02): quem enviou não pode validar.
    if (evaluation.evaluatorId === validator.userId) {
      return err('authz/self-approval', 'Você não pode validar a sua própria avaliação.');
    }
    // Dentro do escopo.
    const operation = data.operations.find((op) => op.id === evaluation.operationId);
    if (!operation || !isOperationVisible({ userId: validator.userId, role: validator.role }, operation)) {
      return err('authz/out-of-scope', 'Avaliação fora do seu escopo de acesso.');
    }

    const now = new Date().toISOString();
    let saved: Evaluation | null = null;
    this.store.update((previous) => {
      const evaluations = previous.evaluations.map((item) => {
        if (item.id !== evaluationId) return item;
        saved = { ...item, status: decision, validatorId: validator.userId, validatorNote: note, validatedAt: now, updatedAt: now };
        return saved;
      });
      let operations = previous.operations;
      if (decision === 'approved') {
        operations = previous.operations.map((op) =>
          op.id !== evaluation.operationId
            ? op
            : {
                ...op,
                previousScore: op.currentScore,
                currentScore: evaluation.score,
                status: getScoreStatus(evaluation.score),
                lastAudit: now.slice(0, 10),
              },
        );
      }
      return { ...previous, evaluations, operations };
    });
    return saved ? ok(saved) : err('validation/invalid-input', 'Falha ao registrar a decisão.');
  }
}

export class SupabaseValidationsRepository implements ValidationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listPending(_scope: OperationScope): Promise<Result<Evaluation[]>> {
    const { data, error } = await this.client
      .from('ui_evaluations')
      .select('*')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false });
    if (error) return err(new AppError('network/unavailable', 'Falha ao carregar a fila.', { cause: error }));
    return ok((data ?? []) as Evaluation[]);
  }

  async validate(
    evaluationId: string,
    _validator: Validator,
    decision: ValidationDecision,
    note: string,
  ): Promise<Result<Evaluation>> {
    // Autoridade das travas (autoaprovação/escopo/imutabilidade) no servidor (RLS + RPC).
    const { data, error } = await this.client.rpc('validate_evaluation', {
      p_evaluation_id: evaluationId,
      p_decision: decision,
      p_note: note,
    });
    if (error) return err(new AppError('network/unavailable', 'Falha ao registrar a decisão.', { cause: error }));
    return ok(data as Evaluation);
  }
}
