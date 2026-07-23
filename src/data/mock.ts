import { AppData, AssessmentAnswer, Evaluation, Operation, TrafficLight, User } from '../types';
import { themes } from './catalog';
import { indicatorDefinitions, indicatorResults } from './performance';

// AAPEX V2 (Masterplan §9.2, §9.3; Anexo D — T30):
// A senha única de demonstração foi REMOVIDA do bundle. Estes dados são seeds
// exclusivos do modo demonstração de DESENVOLVIMENTO (gated por
// `featureFlags.demoMode`) e não representam autenticação real. O build
// corporativo usa Supabase Auth (ver `src/domain/repositories/AuthRepository`).

export const users: User[] = [
  { id: 'U00', name: 'Administrador AACE', email: 'admin@aace.app', role: 'admin', region: 'AACE Brasil', avatarInitials: 'AD' },
  { id: 'U01', name: 'Gerência Regional AACE', email: 'regional@aace.app', role: 'regional', region: 'PR/SC', avatarInitials: 'GR' },
  { id: 'U02', name: 'Coordenação PR Capital', email: 'coordenador@aace.app', role: 'coordinator', region: 'PR Capital', avatarInitials: 'CP' },
  { id: 'U03', name: 'Gerente de Canal Curitiba', email: 'gerente@aace.app', role: 'channel_manager', coordinatorId: 'U02', region: 'Curitiba', avatarInitials: 'GC' },
  { id: 'U04', name: 'Gerente de Canal Região Metropolitana', email: 'gerente2@aace.app', role: 'channel_manager', coordinatorId: 'U02', region: 'RMC', avatarInitials: 'GM' },
  { id: 'U05', name: 'Coordenação SC', email: 'coordenador.sc@aace.app', role: 'coordinator', region: 'Santa Catarina', avatarInitials: 'CS' },
  { id: 'U06', name: 'Gerente de Canal Florianópolis', email: 'gerente.sc@aace.app', role: 'channel_manager', coordinatorId: 'U05', region: 'Florianópolis', avatarInitials: 'GF' },
];

export const operations: Operation[] = [
  { id: 'O01', partnerName: 'Parceiro Alpha', officeName: 'Curitiba Centro', city: 'Curitiba', state: 'PR', coordinatorId: 'U02', managerId: 'U03', active: true, currentScore: 88, previousScore: 82, lastAudit: '2026-07-03', nextAudit: '2026-07-10', status: 'green', openActions: 2 },
  { id: 'O02', partnerName: 'Parceiro Beta', officeName: 'Curitiba Norte', city: 'Curitiba', state: 'PR', coordinatorId: 'U02', managerId: 'U03', active: true, currentScore: 71, previousScore: 75, lastAudit: '2026-07-02', nextAudit: '2026-07-09', status: 'yellow', openActions: 4 },
  { id: 'O03', partnerName: 'Parceiro Gama', officeName: 'São José dos Pinhais', city: 'São José dos Pinhais', state: 'PR', coordinatorId: 'U02', managerId: 'U04', active: true, currentScore: 59, previousScore: 66, lastAudit: '2026-06-30', nextAudit: '2026-07-08', status: 'red', openActions: 7 },
  { id: 'O04', partnerName: 'Parceiro Delta', officeName: 'Florianópolis', city: 'Florianópolis', state: 'SC', coordinatorId: 'U05', managerId: 'U06', active: true, currentScore: 92, previousScore: 89, lastAudit: '2026-07-04', nextAudit: '2026-07-11', status: 'green', openActions: 1 },
  { id: 'O05', partnerName: 'Parceiro Épsilon', officeName: 'São José', city: 'São José', state: 'SC', coordinatorId: 'U05', managerId: 'U06', active: true, currentScore: 77, previousScore: 70, lastAudit: '2026-07-01', nextAudit: '2026-07-10', status: 'yellow', openActions: 3 },
  { id: 'O06', partnerName: 'Parceiro Zeta', officeName: 'Palhoça', city: 'Palhoça', state: 'SC', coordinatorId: 'U05', managerId: 'U06', active: true, currentScore: 64, previousScore: 61, lastAudit: '2026-06-28', nextAudit: '2026-07-09', status: 'red', openActions: 5 },
];

const statusPattern: TrafficLight[] = ['green', 'green', 'yellow', 'green', 'red', 'green', 'yellow', 'green'];

const makeAnswers = (): AssessmentAnswer[] => themes.map((theme, index) => ({
  themeId: theme.id,
  status: statusPattern[index % statusPattern.length],
  measuredValue: index % 3 === 0 ? 'Meta atingida' : index % 3 === 1 ? 'Em evolução' : 'Abaixo da meta',
  observation: index % 5 === 0 ? 'Necessário reforçar a rotina e acompanhar o plano semanal.' : 'Evidência conferida na operação.',
  evidenceIds: [],
}));

export const seedEvaluation: Evaluation = {
  id: 'E01', operationId: 'O02', cycleLabel: 'Semana 27/2026', periodStart: '2026-06-29', periodEnd: '2026-07-05',
  frequency: 'weekly', evaluatorId: 'U03', submittedAt: '2026-07-05T18:00:00.000Z', status: 'submitted', score: 71,
  answers: makeAnswers(), createdAt: '2026-07-05T14:00:00.000Z', updatedAt: '2026-07-05T18:00:00.000Z',
};

export const initialData: AppData = {
  users,
  operations,
  evaluations: [seedEvaluation],
  actionPlans: [
    { id: 'A01', operationId: 'O02', evaluationId: 'E01', themeId: 'T05', problem: 'Produtividade BCC abaixo do esperado.', rootCause: 'Baixa cobertura de agenda e pouca cadência de coaching.', action: 'Implantar puxada diária e coaching de campo duas vezes por semana.', owner: 'Liderança da operação', dueDate: '2026-07-15', priority: 'high', expectedEvidence: 'Agenda, ata e relatório nominal de produtividade.', status: 'in_progress', createdAt: '2026-07-05T18:00:00.000Z', updatedAt: '2026-07-07T12:00:00.000Z' },
    { id: 'A02', operationId: 'O03', evaluationId: 'E01', themeId: 'T17', problem: 'Rotina de prospecção sem aderência.', rootCause: 'Ausência de blocos protegidos e acompanhamento diário.', action: 'Implantar golden hour e registrar contatos, reuniões e conversão.', owner: 'Gerente comercial do parceiro', dueDate: '2026-07-12', priority: 'high', expectedEvidence: 'Agenda e funil atualizado.', status: 'overdue', createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-08T10:00:00.000Z' },
  ],
  evidences: [],
  indicatorDefinitions,
  indicatorResults,
  visitReports: [],
};
