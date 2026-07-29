import { describe, it, expect } from 'vitest';
import {
  ACTION_VALIDATOR_ROLES,
  allowedNextActionStatuses,
  canTransitionActionPlanUi,
  dbToUiActionStatus,
  uiToDbActionStatus,
} from './actionPlanWorkflow';

const gc = { role: 'channel_manager' as const, isCreator: false, hasKnownCreator: true };
const coord = { role: 'coordinator' as const, isCreator: false, hasKnownCreator: true };

describe('tradução UI <-> banco (espelho da 0025)', () => {
  it('waiting_partner e validated têm valor próprio no banco', () => {
    expect(uiToDbActionStatus.waiting_partner).toBe('waiting_partner');
    expect(uiToDbActionStatus.validated).toBe('validated');
  });
  it('legado preservado: blocked = Aguardando área interna; done = Concluído', () => {
    expect(dbToUiActionStatus.blocked).toBe('waiting_internal');
    expect(dbToUiActionStatus.done).toBe('completed');
  });
  it('round-trip dos sete status da UI é fiel', () => {
    for (const ui of Object.keys(uiToDbActionStatus) as Array<keyof typeof uiToDbActionStatus>) {
      expect(dbToUiActionStatus[uiToDbActionStatus[ui]]).toBe(ui);
    }
  });
});

describe('opções ofertadas na tela (só transições permitidas)', () => {
  it('GC em Concluído: só reabertura — nunca Validado', () => {
    expect(allowedNextActionStatuses('completed', gc)).toEqual(['in_progress']);
  });
  it('validador em Concluído de plano alheio: reabertura e Validado', () => {
    expect(allowedNextActionStatuses('completed', coord)).toEqual(['in_progress', 'validated']);
  });
  it('criador (mesmo validador) não vê Validado no próprio plano', () => {
    expect(allowedNextActionStatuses('completed', { ...coord, isCreator: true })).toEqual(['in_progress']);
  });
  it('plano legado sem autoria não oferece Validado', () => {
    expect(allowedNextActionStatuses('completed', { ...coord, hasKnownCreator: false })).toEqual(['in_progress']);
  });
  it('Validado é terminal: nenhuma opção', () => {
    expect(allowedNextActionStatuses('validated', coord)).toEqual([]);
  });
  it('overdue nunca é ofertado como destino', () => {
    for (const from of ['not_started', 'in_progress', 'waiting_partner', 'waiting_internal', 'completed'] as const) {
      expect(allowedNextActionStatuses(from, coord)).not.toContain('overdue');
    }
  });
  it('Não iniciado oferece andamento e as duas esperas', () => {
    expect(allowedNextActionStatuses('not_started', gc)).toEqual(['in_progress', 'waiting_partner', 'waiting_internal']);
  });
});

describe('papéis validadores', () => {
  it('coordenação, regional e administração — GC fora', () => {
    expect(ACTION_VALIDATOR_ROLES).toEqual(['coordinator', 'regional', 'admin']);
    expect(ACTION_VALIDATOR_ROLES).not.toContain('channel_manager');
  });
  it('canTransitionActionPlanUi respeita a tabela no vocabulário da UI', () => {
    expect(canTransitionActionPlanUi('waiting_partner', 'waiting_internal')).toBe(true);
    expect(canTransitionActionPlanUi('not_started', 'completed')).toBe(false);
    expect(canTransitionActionPlanUi('completed', 'validated')).toBe(true);
  });
});
