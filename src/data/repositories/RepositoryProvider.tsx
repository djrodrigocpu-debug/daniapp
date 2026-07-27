/**
 * Seleção e injeção da camada de repositórios (Masterplan §8, §10.3).
 *
 * Escolhe a implementação conforme o ambiente, com o MESMO contrato:
 *   configurado (Supabase) → adapters REAL REMOTO;
 *   sem backend            → adapters REAL LOCAL (store persistente).
 *
 * Também dispara a hidratação do store local no boot. Os providers de tela
 * (`OperationsProvider`, …) consomem os repositórios daqui — nunca instanciam
 * diretamente, para que a troca Local↔Supabase seja transparente.
 */
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { runtimeConfig } from '../../config/runtime';
import { getSupabaseClient } from '../../services/supabase/client';
import { localStore } from '../store/localStore';
import { OperationsRepository } from './OperationsRepository';
import { LocalOperationsRepository } from './LocalOperationsRepository';
import { SupabaseOperationsRepository } from './SupabaseOperationsRepository';
import { EvaluationsRepository } from './EvaluationsRepository';
import { LocalEvaluationsRepository } from './LocalEvaluationsRepository';
import { SupabaseEvaluationsRepository } from './SupabaseEvaluationsRepository';
import { ActionsRepository, LocalActionsRepository, SupabaseActionsRepository } from './ActionsRepository';
import { ValidationsRepository, LocalValidationsRepository, SupabaseValidationsRepository } from './ValidationsRepository';
import {
  AdminUsersRepository,
  AdminIndicatorsRepository,
  LocalAdminUsersRepository,
  LocalAdminIndicatorsRepository,
  SupabaseAdminUsersRepository,
  SupabaseAdminIndicatorsRepository,
} from './AdminRepository';
import {
  AdminPartnersRepository,
  LocalAdminPartnersRepository,
  SupabaseAdminPartnersRepository,
} from './PartnersRepository';
import { PerformanceRepository, LocalPerformanceRepository, SupabasePerformanceRepository } from './PerformanceRepository';
import { EvidenceRepository, LocalEvidenceRepository, SupabaseEvidenceRepository } from './EvidenceRepository';

export interface Repositories {
  operations: OperationsRepository;
  evaluations: EvaluationsRepository;
  actions: ActionsRepository;
  validations: ValidationsRepository;
  adminUsers: AdminUsersRepository;
  adminIndicators: AdminIndicatorsRepository;
  adminPartners: AdminPartnersRepository;
  performance: PerformanceRepository;
  evidence: EvidenceRepository;
  /** Origem efetiva dos dados operacionais. */
  source: 'supabase' | 'local';
}

function buildRepositories(): Repositories {
  const client = runtimeConfig.isConfigured ? getSupabaseClient(runtimeConfig) : null;
  if (client) {
    return {
      operations: new SupabaseOperationsRepository(client),
      evaluations: new SupabaseEvaluationsRepository(client),
      actions: new SupabaseActionsRepository(client),
      validations: new SupabaseValidationsRepository(client),
      adminUsers: new SupabaseAdminUsersRepository(client),
      adminIndicators: new SupabaseAdminIndicatorsRepository(client),
      adminPartners: new SupabaseAdminPartnersRepository(client),
      performance: new SupabasePerformanceRepository(client),
      evidence: new SupabaseEvidenceRepository(client),
      source: 'supabase',
    };
  }
  const evidence = new LocalEvidenceRepository(localStore);
  return {
    operations: new LocalOperationsRepository(localStore),
    evaluations: new LocalEvaluationsRepository(localStore, evidence),
    actions: new LocalActionsRepository(localStore),
    validations: new LocalValidationsRepository(localStore),
    adminUsers: new LocalAdminUsersRepository(localStore),
    adminIndicators: new LocalAdminIndicatorsRepository(localStore),
    adminPartners: new LocalAdminPartnersRepository(localStore),
    performance: new LocalPerformanceRepository(localStore),
    evidence,
    source: 'local',
  };
}

const RepositoryContext = createContext<Repositories | undefined>(undefined);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repositories = useMemo(buildRepositories, []);

  useEffect(() => {
    void localStore.init();
  }, []);

  return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepositories deve ser usado dentro de RepositoryProvider.');
  return ctx;
}
