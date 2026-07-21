import { ActionStatus, TrafficLight, UserRole } from '../types';
import { colors } from '../theme';

export const trafficLightLabel: Record<TrafficLight, string> = {
  green: 'Conforme',
  yellow: 'Em atenção',
  red: 'Não conforme',
  not_evaluated: 'Não avaliado',
  not_applicable: 'Não aplicável',
};

export const trafficLightColor: Record<TrafficLight, string> = {
  green: colors.success,
  yellow: colors.warning,
  red: colors.danger,
  not_evaluated: colors.neutral,
  not_applicable: colors.info,
};

export const trafficLightSoftColor: Record<TrafficLight, string> = {
  green: colors.successSoft,
  yellow: colors.warningSoft,
  red: colors.dangerSoft,
  not_evaluated: '#F0F1F3',
  not_applicable: colors.infoSoft,
};

export const actionStatusLabel: Record<ActionStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  waiting_partner: 'Aguardando parceiro',
  waiting_internal: 'Aguardando área interna',
  completed: 'Concluído',
  validated: 'Validado',
  overdue: 'Vencido',
};

export const roleLabel: Record<UserRole, string> = {
  regional: 'Gerência Regional',
  coordinator: 'Coordenação',
  channel_manager: 'Gerente de Canal',
};

export function formatDate(value?: string): string {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export function formatDateTime(value?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function getScoreStatus(score: number): TrafficLight {
  if (score >= 80) return 'green';
  if (score >= 70) return 'yellow';
  return 'red';
}

export function getMaturity(score: number): string {
  if (score >= 90) return 'Excelência';
  if (score >= 80) return 'Alta performance';
  if (score >= 70) return 'Em desenvolvimento';
  if (score >= 60) return 'Atenção';
  return 'Crítico';
}
