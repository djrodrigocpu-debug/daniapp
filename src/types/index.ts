export type UserRole = 'regional' | 'coordinator' | 'channel_manager';
export type TrafficLight = 'green' | 'yellow' | 'red' | 'not_evaluated' | 'not_applicable';
export type EvaluationStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export type ActionStatus = 'not_started' | 'in_progress' | 'waiting_partner' | 'waiting_internal' | 'completed' | 'validated' | 'overdue';
export type Frequency = 'weekly' | 'monthly';
export type IndicatorDirection = 'higher_better' | 'lower_better';
export type IndicatorUnit = '%' | 'R$' | 'qtd' | 'p.p.' | 'x';

export interface User { id: string; name: string; email: string; role: UserRole; coordinatorId?: string; region: string; avatarInitials: string; }
export interface Operation { id: string; partnerName: string; officeName: string; city: string; state: 'PR' | 'SC'; coordinatorId: string; managerId: string; active: boolean; currentScore: number; previousScore: number; lastAudit?: string; nextAudit: string; status: TrafficLight; openActions: number; }
export interface Theme { id: string; pillar: string; title: string; kpi: string; target: string; frequency: Frequency; evidenceRequired: boolean; evidenceHint: string; validationMethod: string; weight: number; strategic: boolean; }
export interface Evidence { id: string; themeId: string; name: string; uri: string; mimeType?: string; type: 'photo' | 'document'; createdAt: string; }
export interface AssessmentAnswer { themeId: string; status: TrafficLight; measuredValue: string; observation: string; evidenceIds: string[]; }
export interface Evaluation { id: string; operationId: string; cycleLabel: string; periodStart: string; periodEnd: string; frequency: Frequency; evaluatorId: string; submittedAt?: string; validatedAt?: string; validatorId?: string; validatorNote?: string; status: EvaluationStatus; score: number; answers: AssessmentAnswer[]; createdAt: string; updatedAt: string; }
export interface ActionPlan { id: string; operationId: string; evaluationId: string; themeId: string; problem: string; rootCause: string; action: string; owner: string; dueDate: string; priority: 'high' | 'medium' | 'low'; expectedEvidence: string; status: ActionStatus; completionNote?: string; createdAt: string; updatedAt: string; }

export interface IndicatorDefinition {
  id: string;
  title: string;
  category: 'Resultado' | 'Qualidade' | 'Processo';
  unit: IndicatorUnit;
  direction: IndicatorDirection;
  defaultTarget: number;
  yellowTolerance: number;
  weight: number;
  diagnosticOptions: string[];
}

export interface IndicatorResult {
  id: string;
  operationId: string;
  indicatorId: string;
  period: string;
  target: number;
  actual: number;
  previousActual: number;
  diagnosis?: string;
  observation?: string;
  updatedAt: string;
}

export interface VisitReport {
  id: string;
  operationId: string;
  createdAt: string;
  createdBy: string;
  objective: string;
  summary: string;
  criticalIndicators: string[];
  actionPlanIds: string[];
  nextReviewDate: string;
}

export interface AppData { users: User[]; operations: Operation[]; evaluations: Evaluation[]; actionPlans: ActionPlan[]; evidences: Evidence[]; indicatorDefinitions: IndicatorDefinition[]; indicatorResults: IndicatorResult[]; visitReports: VisitReport[]; }

export type RootStackParamList = {
  Main: undefined;
  OperationDetail: { operationId: string };
  Evaluation: { operationId: string; evaluationId?: string };
  Performance: { operationId: string };
};
