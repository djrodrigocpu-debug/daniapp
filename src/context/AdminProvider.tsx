/**
 * Provider administrativo (Masterplan §10). Expõe usuários e indicadores
 * versionados + mutações, apenas para Administrador. As telas consomem
 * `useAdmin()`; a navegação impede o acesso de outros perfis.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AdminIndicator, AdminIndicatorVersion, User, UserRole } from '../types';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { CreateUserInput } from '../data/repositories/AdminRepository';
import { localStore } from '../data/store/localStore';
import { useOperationalUser } from './useOperationalUser';

export type AdminResult = { ok: true } | { ok: false; message: string };
type NewVersion = Omit<AdminIndicatorVersion, 'id' | 'versionNumber'>;

interface AdminContextValue {
  isAdmin: boolean;
  users: User[];
  indicators: AdminIndicator[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createUser: (input: CreateUserInput) => Promise<AdminResult>;
  setUserActive: (userId: string, active: boolean) => Promise<AdminResult>;
  updateUserRole: (userId: string, role: UserRole) => Promise<AdminResult>;
  createIndicator: (code: string, name: string, version: NewVersion) => Promise<AdminResult>;
  addIndicatorVersion: (indicatorId: string, version: NewVersion) => Promise<AdminResult>;
  deactivateIndicator: (indicatorId: string) => Promise<AdminResult>;
  removeIndicator: (indicatorId: string) => Promise<AdminResult>;
}

const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { adminUsers, adminIndicators, source } = useRepositories();
  const data = useSyncExternalStore(localStore.subscribe, localStore.getSnapshot);
  const currentUser = useOperationalUser();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<User[]>([]);
  const [indicators, setIndicators] = useState<AdminIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      setIndicators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [uRes, iRes] = await Promise.all([adminUsers.listAll(), adminIndicators.listAll()]);
    if (!uRes.ok) setError(uRes.error.message);
    else setUsers(uRes.value);
    if (iRes.ok) setIndicators(iRes.value);
    else if (!error) setError(iRes.error.message);
    setLoading(false);
  }, [isAdmin, adminUsers, adminIndicators, error]);

  useEffect(() => {
    void load();
  }, [isAdmin, adminUsers, adminIndicators]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (source !== 'local') return undefined;
    return localStore.subscribe(() => void load());
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const wrap = useCallback(async (op: Promise<{ ok: boolean; error?: { message: string } }>): Promise<AdminResult> => {
    const res = await op;
    return res.ok ? { ok: true } : { ok: false, message: res.error?.message ?? 'Falha na operação.' };
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      isAdmin,
      users: data.users,
      indicators: data.adminIndicators ?? indicators,
      loading,
      error,
      refresh: () => void load(),
      createUser: (input) => wrap(adminUsers.create(input)),
      setUserActive: (userId, active) => wrap(adminUsers.setActive(userId, active)),
      updateUserRole: (userId, role) => wrap(adminUsers.updateRole(userId, role)),
      createIndicator: (code, name, version) => wrap(adminIndicators.createDefinition(code, name, version)),
      addIndicatorVersion: (indicatorId, version) => wrap(adminIndicators.addVersion(indicatorId, version)),
      deactivateIndicator: (indicatorId) => wrap(adminIndicators.deactivate(indicatorId)),
      removeIndicator: (indicatorId) => wrap(adminIndicators.remove(indicatorId)),
    }),
    [isAdmin, data.users, data.adminIndicators, indicators, loading, error, load, wrap, adminUsers, adminIndicators],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin exige AdminProvider.');
  return ctx;
}
