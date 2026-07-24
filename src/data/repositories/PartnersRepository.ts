/**
 * Repositório administrativo de Parceiros AACE (AAPEx v2).
 *
 * Um Parceiro AACE = uma linha de public.operations (escritório operacional).
 * Adapter Supabase: view ui_admin_partners + RPCs admin_* da migration 0009
 * (autorização real é a RLS/SECURITY DEFINER no servidor). Adapter Local
 * (modo demonstração): deriva a visão administrativa de data.operations —
 * fonte ÚNICA, sem coleção paralela (emenda E7) — espelhando as regras:
 * escritório único por unidade (chave normalizada), parceiro ativo exige GC
 * (E5), GC/coordenador resolvidos por e-mail com papel correto (E2) e
 * importação simular/confirmar idempotente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Operation, User } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { makeId } from '../../utils/ids';
import { LocalStore, localStore } from '../store/localStore';
import { collapseSpaces, normalizeEmail, normalizeKey } from '../../domain/partners/normalize';
import {
  ImportReport,
  ImportReportRow,
  ImportRow,
  MAX_IMPORT_ROWS,
} from '../../domain/partners/types';

/** Projeção administrativa de um Parceiro AACE (espelho de ui_admin_partners). */
export interface AdminPartner {
  id: string;
  partnerName: string;
  officeName: string;
  city: string;
  state: 'PR' | 'SC';
  active: boolean;
  unitId: string | null;
  unitName: string;
  regionName: string;
  coordinationId: string | null;
  coordinationName: string;
  coordinatorId: string | null;
  coordinatorName: string | null;
  managerId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  managerMissing: boolean;
  coordinatorMissing: boolean;
}

export interface PartnerInput {
  partnerName: string;
  officeName: string;
  city: string;
  state: 'PR' | 'SC';
  unitName?: string;
  unitId?: string;
  coordinationName?: string;
  coordinationId?: string;
  managerEmail?: string;
  active?: boolean;
}

export type PartnerPatch = Partial<PartnerInput>;

export interface CreatePartnerResult {
  partner: AdminPartner;
  warnings: string[];
}

export interface AdminPartnersRepository {
  listAll(): Promise<Result<AdminPartner[]>>;
  create(input: PartnerInput): Promise<Result<CreatePartnerResult>>;
  update(id: string, patch: PartnerPatch): Promise<Result<CreatePartnerResult>>;
  /** commit=false: simulação (não grava). commit=true: grava em transação. */
  importPartners(rows: ImportRow[], commit: boolean): Promise<Result<ImportReport>>;
}

// ---------------------------------------------------------------------------
// Local (modo demonstração) — deriva de data.operations (fonte única, E7)
// ---------------------------------------------------------------------------

const DEMO_REGION = 'PR/SC';
const DEMO_UNIT = 'Unidade Piloto';

function toAdminPartner(op: Operation, users: User[]): AdminPartner {
  const manager = users.find((u) => u.id === op.managerId) ?? null;
  const coordinator = users.find((u) => u.id === op.coordinatorId) ?? null;
  return {
    id: op.id,
    partnerName: op.partnerName,
    officeName: op.officeName,
    city: op.city,
    state: op.state,
    active: op.active,
    unitId: null,
    unitName: op.unitName ?? DEMO_UNIT,
    regionName: op.regionName ?? DEMO_REGION,
    coordinationId: null,
    coordinationName: op.coordinationName ?? coordinator?.region ?? '',
    coordinatorId: coordinator?.id ?? null,
    coordinatorName: coordinator?.name ?? null,
    managerId: manager?.id ?? null,
    managerName: manager?.name ?? null,
    managerEmail: manager?.email ?? null,
    managerMissing: !manager,
    coordinatorMissing: !coordinator,
  };
}

function isActiveUser(user: User): boolean {
  return user.active !== false;
}

/** Resolve pessoa por e-mail com papel correto e ativa (espelho local da E2). */
function resolveByEmail(
  users: User[],
  email: string,
  role: User['role'],
  label: string,
): { user?: User; error?: string } {
  const normalized = normalizeEmail(email);
  const user = users.find((u) => normalizeEmail(u.email) === normalized);
  if (!user) return { error: `${label} nao encontrado: ${normalized}` };
  if (!isActiveUser(user)) return { error: `${label} nao esta ativo: ${normalized}` };
  if (user.role !== role) return { error: `E-mail nao tem papel de ${label} ativo: ${normalized}` };
  return { user };
}

function newOperation(input: PartnerInput, manager: User | null, coordinator: User | null): Operation {
  return {
    id: makeId('O'),
    partnerName: collapseSpaces(input.partnerName),
    officeName: collapseSpaces(input.officeName),
    city: collapseSpaces(input.city),
    state: input.state,
    coordinatorId: coordinator?.id ?? manager?.coordinatorId ?? '',
    managerId: manager?.id ?? '',
    active: manager ? input.active !== false : false, // E5: sem GC => inativo
    currentScore: 0,
    previousScore: 0,
    nextAudit: new Date().toISOString().slice(0, 10),
    status: 'not_evaluated',
    openActions: 0,
    regionName: DEMO_REGION,
    unitName: input.unitName ? collapseSpaces(input.unitName) : DEMO_UNIT,
    coordinationName: input.coordinationName ? collapseSpaces(input.coordinationName) : undefined,
  };
}

export class LocalAdminPartnersRepository implements AdminPartnersRepository {
  constructor(private readonly store: LocalStore = localStore) {}

  private snapshot() {
    return this.store.getSnapshot();
  }

  private officeTaken(officeName: string, unitName: string, exceptId?: string): boolean {
    const officeKey = normalizeKey(officeName);
    const unitKey = normalizeKey(unitName);
    return this.snapshot().operations.some((op) =>
      op.id !== exceptId
      && normalizeKey(op.unitName ?? DEMO_UNIT) === unitKey
      && normalizeKey(op.officeName) === officeKey);
  }

  async listAll(): Promise<Result<AdminPartner[]>> {
    const { operations, users } = this.snapshot();
    return ok(operations.map((op) => toAdminPartner(op, users)));
  }

  async create(input: PartnerInput): Promise<Result<CreatePartnerResult>> {
    const partnerName = collapseSpaces(input.partnerName ?? '');
    const officeName = collapseSpaces(input.officeName ?? '');
    const city = collapseSpaces(input.city ?? '');
    if (!partnerName || !officeName || !city) {
      return err('validation/invalid-input', 'Empresa parceira, escritório e cidade são obrigatórios.');
    }
    if (input.state !== 'PR' && input.state !== 'SC') {
      return err('validation/invalid-input', 'Estado inválido (esperado PR ou SC).');
    }
    if (this.officeTaken(officeName, input.unitName ?? DEMO_UNIT)) {
      return err('validation/invalid-input', 'Escritório já cadastrado nesta unidade.');
    }

    const users = this.snapshot().users;
    let manager: User | null = null;
    const warnings: string[] = [];
    if (input.managerEmail && collapseSpaces(input.managerEmail) !== '') {
      const resolved = resolveByEmail(users, input.managerEmail, 'channel_manager', 'GC');
      if (resolved.error) return err('validation/invalid-input', resolved.error);
      manager = resolved.user ?? null;
    }
    if (!manager) warnings.push('Sem GC vinculado: parceiro salvo como inativo');

    const op = newOperation({ ...input, partnerName, officeName, city }, manager, null);
    this.store.update((prev) => ({ ...prev, operations: [...prev.operations, op] }));
    return ok({ partner: toAdminPartner(op, users), warnings });
  }

  async update(id: string, patch: PartnerPatch): Promise<Result<CreatePartnerResult>> {
    const { operations, users } = this.snapshot();
    const current = operations.find((op) => op.id === id);
    if (!current) return err('validation/invalid-input', 'Parceiro não encontrado.');

    const next: Operation = { ...current };
    if (patch.partnerName !== undefined) next.partnerName = collapseSpaces(patch.partnerName);
    if (patch.officeName !== undefined) next.officeName = collapseSpaces(patch.officeName);
    if (patch.city !== undefined) next.city = collapseSpaces(patch.city);
    if (patch.state !== undefined) next.state = patch.state;
    if (patch.unitName !== undefined) next.unitName = collapseSpaces(patch.unitName);
    if (patch.coordinationName !== undefined) next.coordinationName = collapseSpaces(patch.coordinationName);
    if (!next.partnerName || !next.officeName || !next.city) {
      return err('validation/invalid-input', 'Empresa parceira, escritório e cidade são obrigatórios.');
    }
    if (this.officeTaken(next.officeName, next.unitName ?? DEMO_UNIT, id)) {
      return err('validation/invalid-input', 'Escritório já cadastrado nesta unidade.');
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'managerEmail')) {
      const email = patch.managerEmail ? collapseSpaces(patch.managerEmail) : '';
      if (email === '') {
        next.managerId = '';
      } else {
        const resolved = resolveByEmail(users, email, 'channel_manager', 'GC');
        if (resolved.error) return err('validation/invalid-input', resolved.error);
        next.managerId = resolved.user!.id;
        if (!next.coordinatorId) next.coordinatorId = resolved.user!.coordinatorId ?? '';
      }
    }

    if (patch.active !== undefined) next.active = patch.active;
    if (next.active && !next.managerId) {
      return err('validation/invalid-input', 'Parceiro ativo exige GC vinculado.');
    }

    this.store.update((prev) => ({
      ...prev,
      operations: prev.operations.map((op) => (op.id === id ? next : op)),
    }));
    return ok({ partner: toAdminPartner(next, users), warnings: [] });
  }

  async importPartners(rows: ImportRow[], commit: boolean): Promise<Result<ImportReport>> {
    if (rows.length > MAX_IMPORT_ROWS) {
      return err('validation/invalid-input', `Lote excede o limite de ${MAX_IMPORT_ROWS} linhas.`);
    }
    const { operations, users } = this.snapshot();
    const reportRows: ImportReportRow[] = [];
    const seen = new Set<string>();
    const toCreateCoordinations = new Map<string, string>();
    const pendingInserts: Operation[] = [];
    const pendingUpdates = new Map<string, Operation>();
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    const existingCoordinations = new Set(
      operations.map((op) => normalizeKey(op.coordinationName ?? '')).filter((k) => k !== ''),
    );

    for (const row of rows) {
      const messages: string[] = [];
      const partnerName = collapseSpaces(row.partnerName ?? '');
      const officeName = collapseSpaces(row.officeName ?? '');
      const city = collapseSpaces(row.city ?? '');
      const unitName = collapseSpaces(row.unitName ?? '') || DEMO_UNIT;
      const coordinationName = collapseSpaces(row.coordinationName ?? '');
      let status: ImportReportRow['status'] = 'ok';
      let action: ImportReportRow['action'] = 'insert';
      let operationId: string | null = null;

      if (!partnerName || !officeName || !city || (row.state !== 'PR' && row.state !== 'SC')) {
        messages.push('Linha inválida: campos obrigatórios ausentes ou estado fora de PR/SC');
      }

      const coordinator = row.coordinatorEmail
        ? resolveByEmail(users, row.coordinatorEmail, 'coordinator', 'Coordenador')
        : { error: 'Campo obrigatorio ausente: e-mail do coordenador' };
      if (coordinator.error) messages.push(coordinator.error);

      const manager = row.managerEmail
        ? resolveByEmail(users, row.managerEmail, 'channel_manager', 'GC')
        : { error: 'Campo obrigatorio ausente: e-mail do GC' };
      if (manager.error) messages.push(manager.error);

      const dupKey = `${normalizeKey(unitName)}#${normalizeKey(officeName)}`;
      if (messages.length === 0) {
        if (seen.has(dupKey)) {
          messages.push(`Escritorio duplicado na planilha: ${officeName} (unidade ${unitName})`);
        } else {
          seen.add(dupKey);
        }
      }

      if (messages.length === 0) {
        const existing = operations.find((op) =>
          normalizeKey(op.unitName ?? DEMO_UNIT) === normalizeKey(unitName)
          && normalizeKey(op.officeName) === normalizeKey(officeName));

        const coordinationKey = normalizeKey(coordinationName);
        if (coordinationKey !== '' && !existingCoordinations.has(coordinationKey)) {
          toCreateCoordinations.set(coordinationKey, coordinationName);
        }

        if (existing) {
          status = 'duplicate';
          action = 'update';
          operationId = existing.id;
          updated += 1;
          if (commit) {
            pendingUpdates.set(existing.id, {
              ...existing,
              partnerName,
              officeName,
              city,
              state: row.state,
              managerId: manager.user!.id,
              coordinatorId: coordinator.user!.id,
              coordinationName,
              unitName,
            });
          }
        } else {
          inserted += 1;
          const op = newOperation(
            { partnerName, officeName, city, state: row.state, unitName, coordinationName },
            manager.user!,
            coordinator.user!,
          );
          op.coordinatorId = coordinator.user!.id;
          operationId = commit ? op.id : null;
          if (commit) pendingInserts.push(op);
        }
      } else {
        status = 'error';
        action = 'none';
        errors += 1;
      }

      reportRows.push({
        index: row.index,
        officeName,
        partnerName,
        status,
        action,
        operationId,
        messages,
        warnings: [],
      });
    }

    if (commit && (pendingInserts.length > 0 || pendingUpdates.size > 0)) {
      this.store.update((prev) => ({
        ...prev,
        operations: [
          ...prev.operations.map((op) => pendingUpdates.get(op.id) ?? op),
          ...pendingInserts,
        ],
      }));
    }

    return ok({
      mode: commit ? 'commit' : 'simulate',
      counters: {
        total: rows.length,
        inserted,
        updated,
        errors,
        createdEntities: toCreateCoordinations.size,
      },
      toCreate: {
        organizations: [],
        regions: [],
        units: [],
        coordinations: [...toCreateCoordinations.values()].sort(),
      },
      rows: reportRows,
    });
  }
}

// ---------------------------------------------------------------------------
// Supabase (REAL REMOTO) — view ui_admin_partners + RPCs da migration 0009
// ---------------------------------------------------------------------------

function net(message: string, cause?: unknown): AppError {
  return new AppError('network/unavailable', message, { severity: 'high', cause });
}

type PartnerDto = AdminPartner & { warnings?: string[] };

function splitDto(dto: PartnerDto): CreatePartnerResult {
  const { warnings, ...partner } = dto;
  return { partner: partner as AdminPartner, warnings: warnings ?? [] };
}

export class SupabaseAdminPartnersRepository implements AdminPartnersRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listAll(): Promise<Result<AdminPartner[]>> {
    const { data, error } = await this.client.from('ui_admin_partners').select('*').order('officeName');
    return error ? err(net('Falha ao carregar Parceiros AACE.', error)) : ok((data ?? []) as AdminPartner[]);
  }

  async create(input: PartnerInput): Promise<Result<CreatePartnerResult>> {
    const { data, error } = await this.client.rpc('admin_create_operation', { p_input: input });
    return error
      ? err(net(error.message || 'Falha ao criar Parceiro AACE.', error))
      : ok(splitDto(data as PartnerDto));
  }

  async update(id: string, patch: PartnerPatch): Promise<Result<CreatePartnerResult>> {
    const { data, error } = await this.client.rpc('admin_update_operation', { p_id: id, p_patch: patch });
    return error
      ? err(net(error.message || 'Falha ao atualizar Parceiro AACE.', error))
      : ok(splitDto(data as PartnerDto));
  }

  async importPartners(rows: ImportRow[], commit: boolean): Promise<Result<ImportReport>> {
    const { data, error } = await this.client.rpc('admin_import_partners', { p_rows: rows, p_commit: commit });
    return error
      ? err(net(error.message || 'Falha na importação de Parceiros AACE.', error))
      : ok(data as ImportReport);
  }
}
