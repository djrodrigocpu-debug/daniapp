/**
 * Usuários AACE — tipos do importador de planilha.
 *
 * Espelha o contrato do importador de Parceiros AACE (simular → confirmar,
 * idempotente por e-mail), para que as duas telas de importação se comportem
 * igual e o operador não precise aprender dois fluxos.
 */
import { UserRole } from '../../types';
import { SheetIssue, SheetLayout } from '../sheets/reader';

/** Limite de linhas por lote (mesma ordem de grandeza do lote de parceiros). */
export const MAX_USER_IMPORT_ROWS = 200;

export interface UserImportRow {
  /** Posição 1-based do registro na planilha. */
  index: number;
  name: string;
  email: string;
  role: UserRole;
  /** Área de atuação: coordenação do GC/coordenador, região do regional. */
  region: string;
  /**
   * Senha inicial da identidade Auth. Só é EXIGIDA para e-mail que ainda não
   * tem identidade — o parser não sabe quais são, então aceita ausente e a
   * Edge Function decide.
   *
   * CICLO DE VIDA: existe apenas em memória, do parse até a chamada de
   * provisionamento. Nunca é gravada em banco, relatório, log ou storage — por
   * isso NÃO aparece em `UserImportReportRow`.
   */
  initialPassword?: string;
  /** Coluna "ativo" da planilha. Ausente ⇒ true. */
  active?: boolean;
}

export type UserIssue = SheetIssue<keyof Omit<UserImportRow, 'index'>>;

export interface UserParseResult {
  rows: UserImportRow[];
  issues: UserIssue[];
  layout: SheetLayout;
}

/**
 * `pending_auth` é do caminho REMOTO: a RPC `admin_import_users` marca assim a
 * linha cujo e-mail ainda não tem identidade no Supabase Auth. Não é erro — é o
 * estado normal de todo usuário novo antes do provisionamento, que é
 * justamente quem cria a identidade. Numa carga inicial, TODAS as linhas
 * chegam neste estado.
 */
export type UserImportRowStatus = 'ok' | 'duplicate' | 'error' | 'pending_auth';
export type UserImportRowAction = 'insert' | 'update' | 'none';

export interface UserImportReportRow {
  index: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserImportRowStatus;
  action: UserImportRowAction;
  userId: string | null;
  messages: string[];
  warnings: string[];
}

export interface UserImportReport {
  mode: 'simulate' | 'commit';
  counters: {
    total: number;
    inserted: number;
    updated: number;
    errors: number;
    /** Only remoto: e-mails que ainda não têm identidade no Supabase Auth. */
    pendingAuth?: number;
  };
  /** Coordenações citadas na planilha que ficaram sem coordenador ativo. */
  coordinationsWithoutCoordinator: string[];
  rows: UserImportReportRow[];
  /**
   * Somente remoto: `false` quando o lote foi recusado por inteiro. A gravação
   * é tudo-ou-nada, então `mode='commit'` com `applied=false` significa que
   * NADA foi escrito — o oposto de uma aplicação parcial silenciosa.
   */
  applied?: boolean;
  /** Somente remoto: e-mails que precisam de convite antes de confirmar. */
  pendingAuth?: string[];
}
