/**
 * Modelo de domínio do CATÁLOGO COM ESCOPO (AAPEx 1.3.5, decisão A-08).
 *
 * Tipos puros, sem React, sem Supabase e sem SQL. Existem para que nenhuma tela
 * e nenhum repositório precise escrever `'global'`, `'published'` ou
 * `'regional'` como string solta espalhada pelo código — o escopo desta fase
 * §15 é explícito nisso.
 *
 * A fonte da verdade continua sendo o servidor (migrations 0036–0038). Nada aqui
 * autoriza coisa nenhuma: espelha, para a interface não oferecer o que será
 * recusado. Ver `policy.ts`, que diz isso com todas as letras.
 *
 * Referência canônica: docs/architecture/ADR-135-001-ESCOPO-GLOBAL-REGIONAL.md
 */
import { IndicatorDirection, IndicatorLifecycle } from '../model';

/**
 * Os dois escopos de A-08.
 *
 * `global`   — catálogo comum, região nula, administrado somente pelo ADMIN;
 * `regional` — pertence a uma região, administrado pelo ADMIN ou pelo Gerente
 *              Regional daquela região, invisível para as demais.
 */
export type ScopeKind = 'global' | 'regional';

/** Estado editorial. Só o publicado é operável; rascunho não sustenta operação. */
export type CatalogStatus = 'draft' | 'published';

/**
 * Escopo resolvido de um objeto de catálogo.
 *
 * Um tipo-união em vez de `{ scopeKind, regionId }` solto: assim é impossível
 * construir em TypeScript o híbrido que o CHECK do banco recusa — global com
 * região, ou regional sem ela.
 */
export type CatalogScope =
  | { kind: 'global' }
  | { kind: 'regional'; regionId: string };

export function scopeOf(scopeKind: ScopeKind, regionId: string | null): CatalogScope {
  return scopeKind === 'regional' && regionId
    ? { kind: 'regional', regionId }
    : { kind: 'global' };
}

/** Região do objeto, ou `null` quando global — a forma que o servidor espera. */
export function scopeRegionId(scope: CatalogScope): string | null {
  return scope.kind === 'regional' ? scope.regionId : null;
}

/**
 * Intervalo de vigência meio-aberto `[from, to)`.
 *
 * Meio-aberto de propósito: é assim que o `tstzrange(from, to, '[)')` dos
 * gatilhos 0036–0038 compara. Se o domínio usasse intervalo fechado, a
 * interface aceitaria combinações que o banco recusa.
 */
export interface ValidityInterval {
  from: string;
  /** `null` = vigente por prazo indeterminado. */
  to: string | null;
}

// ---------------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------------

export interface ThemeVersion {
  id: string;
  versionNumber: number;
  /** O nome mora na VERSÃO: renomear não reescreve a leitura do histórico. */
  name: string;
  description: string | null;
  sortOrder: number;
  status: CatalogStatus;
  active: boolean;
  validity: ValidityInterval;
}

export interface Theme {
  id: string;
  code: string;
  scope: CatalogScope;
  lifecycle: IndicatorLifecycle;
  versions: ThemeVersion[];
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

/**
 * Semântica versionada. NÃO contém meta, tolerância nem peso: esses são
 * operação da região e vivem em `RegionalConfigVersion` (ADR §4, decisão D-B).
 */
export interface CatalogIndicatorVersion {
  id: string;
  versionNumber: number;
  name: string;
  description: string | null;
  unit: string;
  direction: IndicatorDirection;
  status: CatalogStatus;
  validity: ValidityInterval;
}

export interface CatalogIndicator {
  id: string;
  code: string;
  /** Rótulo da definição. Cada versão pode ter o seu (decisão D-C). */
  name: string;
  scope: CatalogScope;
  lifecycle: IndicatorLifecycle;
  versions: CatalogIndicatorVersion[];
}

// ---------------------------------------------------------------------------
// Configuração operacional regional
// ---------------------------------------------------------------------------

export interface RegionalConfigVersion {
  id: string;
  versionNumber: number;
  indicatorVersionId: string;
  themeVersionId: string;
  sortOrder: number;
  target: number;
  tolerance: number;
  weight: number;
  active: boolean;
  includeInAssistedManagement: boolean;
  includeInMonthlyAudit: boolean;
  status: CatalogStatus;
  validity: ValidityInterval;
}

export interface AuditCriterionVersion {
  id: string;
  versionNumber: number;
  question: string;
  description: string | null;
  guidance: string | null;
  sortOrder: number;
  required: boolean;
  evidenceRequired: boolean;
  allowsNa: boolean;
  requiresJustification: boolean;
  status: CatalogStatus;
  active: boolean;
  validity: ValidityInterval;
}

export interface AuditCriterion {
  id: string;
  configId: string;
  code: string;
  lifecycle: IndicatorLifecycle;
  versions: AuditCriterionVersion[];
}

/** A adoção de um indicador por uma região. Uma por par (região, indicador). */
export interface RegionalConfig {
  id: string;
  regionId: string;
  indicatorDefinitionId: string;
  indicatorCode: string;
  versions: RegionalConfigVersion[];
  criteria: AuditCriterion[];
}

// ---------------------------------------------------------------------------
// Entradas de escrita
// ---------------------------------------------------------------------------

export interface ThemeVersionInput {
  name: string;
  description?: string;
  sortOrder?: number;
  effectiveFrom?: string;
}

export interface IndicatorVersionInput {
  name: string;
  description?: string;
  unit?: string;
  direction?: IndicatorDirection;
  effectiveFrom?: string;
}

export interface RegionalConfigInput {
  indicatorVersionId: string;
  themeVersionId: string;
  sortOrder?: number;
  target: number;
  tolerance?: number;
  weight?: number;
  active?: boolean;
  includeInAssistedManagement?: boolean;
  includeInMonthlyAudit?: boolean;
  effectiveFrom?: string;
}

export interface AuditCriterionInput {
  question: string;
  description?: string;
  guidance?: string;
  sortOrder?: number;
  required?: boolean;
  evidenceRequired?: boolean;
  allowsNa?: boolean;
  requiresJustification?: boolean;
  active?: boolean;
  effectiveFrom?: string;
}

/**
 * Padrões empresariais de D3, num lugar só.
 *
 * Estão aqui E no default da coluna. A duplicação é deliberada: o banco é a
 * autoridade, e a interface precisa mostrar o mesmo valor ANTES de gravar —
 * um formulário que exibisse outra coisa mentiria até o primeiro salvamento.
 */
export const REGIONAL_CONFIG_DEFAULTS = {
  includeInAssistedManagement: true,
  includeInMonthlyAudit: false,
  active: true,
  tolerance: 0,
  weight: 1,
  sortOrder: 0,
} as const;
