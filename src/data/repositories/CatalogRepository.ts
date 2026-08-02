/**
 * Adapters do catálogo com escopo (AAPEx 1.3.5, decisão A-08).
 *
 * Dois, e nenhum deles finge ser o outro:
 *
 *   `SupabaseCatalogRepository`    — REAL REMOTO. Leitura pelas tabelas sob RLS,
 *                                    escrita exclusivamente pelas RPCs
 *                                    `catalog_*` (0036–0038).
 *   `UnavailableCatalogRepository` — modo demonstração. Recusa TUDO, com uma
 *                                    frase que diz por quê.
 *
 * POR QUE O SEGUNDO RECUSA EM VEZ DE SIMULAR. O catálogo regional é
 * autorização, versionamento e vigência impostos por gatilho e por RLS. Uma
 * versão local em AsyncStorage aceitaria publicar `target_band` na Gestão
 * Assistida, aceitaria Auditoria Mensal sem critério e deixaria um regional
 * configurar a região do vizinho — e o operador só descobriria em produção.
 * Lista vazia seria pior ainda: pareceria "ainda não há temas".
 *
 * O escopo desta fase §15 é literal: "a implementação local deve ser honesta;
 * não fabricar persistência corporativa inexistente".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { CatalogRepository } from '../../domain/repositories/catalog';
import {
  AuditCriterion,
  AuditCriterionInput,
  CatalogIndicator,
  CatalogIndicatorVersion,
  RegionalConfig,
  RegionalConfigInput,
  IndicatorVersionInput,
  ScopeKind,
  Theme,
  ThemeVersion,
  ThemeVersionInput,
  scopeOf,
} from '../../domain/catalog/types';

// ---------------------------------------------------------------------------
// Formas cruas devolvidas pelo servidor
// ---------------------------------------------------------------------------

interface RawThemeVersion {
  id: string;
  versionNumber?: number; version_number?: number;
  name: string;
  description: string | null;
  sortOrder?: number; sort_order?: number;
  status: 'draft' | 'published';
  active: boolean;
  effectiveFrom?: string; effective_from?: string;
  effectiveTo?: string | null; effective_to?: string | null;
}

interface RawTheme {
  id: string;
  code: string;
  scopeKind?: ScopeKind; scope_kind?: ScopeKind;
  regionId?: string | null; region_id?: string | null;
  lifecycle: 'draft' | 'active' | 'inactive';
  versions?: RawThemeVersion[];
  theme_versions?: RawThemeVersion[];
}

interface RawIndicatorVersion {
  id: string;
  versionNumber?: number; version_number?: number;
  name: string | null;
  description: string | null;
  unit: string;
  direction: CatalogIndicatorVersion['direction'];
  status: 'draft' | 'published';
  effectiveFrom?: string; effective_from?: string;
  effectiveTo?: string | null; effective_to?: string | null;
}

interface RawIndicator {
  id: string;
  code: string;
  name: string;
  scopeKind?: ScopeKind; scope_kind?: ScopeKind;
  regionId?: string | null; region_id?: string | null;
  lifecycle: 'draft' | 'active' | 'inactive';
  versions?: RawIndicatorVersion[];
  indicator_versions?: RawIndicatorVersion[];
}

interface RawConfigVersion {
  id: string;
  versionNumber?: number; version_number?: number;
  indicatorVersionId?: string; indicator_version_id?: string;
  themeVersionId?: string; theme_version_id?: string;
  sortOrder?: number; sort_order?: number;
  target: number | string;
  tolerance: number | string;
  weight: number | string;
  active: boolean;
  includeInAssistedManagement?: boolean; include_in_assisted_management?: boolean;
  includeInMonthlyAudit?: boolean; include_in_monthly_audit?: boolean;
  status: 'draft' | 'published';
  effectiveFrom?: string; effective_from?: string;
  effectiveTo?: string | null; effective_to?: string | null;
}

interface RawCriterionVersion {
  id: string;
  versionNumber?: number; version_number?: number;
  question: string;
  description: string | null;
  guidance: string | null;
  sortOrder?: number; sort_order?: number;
  required: boolean;
  evidenceRequired?: boolean; evidence_required?: boolean;
  allowsNa?: boolean; allows_na?: boolean;
  requiresJustification?: boolean; requires_justification?: boolean;
  status: 'draft' | 'published';
  active: boolean;
  effectiveFrom?: string; effective_from?: string;
  effectiveTo?: string | null; effective_to?: string | null;
}

interface RawCriterion {
  id: string;
  configId?: string; config_id?: string;
  code: string;
  lifecycle: 'draft' | 'active' | 'inactive';
  versions?: RawCriterionVersion[];
  audit_criteria_versions?: RawCriterionVersion[];
}

interface RawConfig {
  id: string;
  regionId?: string; region_id?: string;
  indicatorDefinitionId?: string; indicator_definition_id?: string;
  indicatorCode?: string;
  versions?: RawConfigVersion[];
  indicator_regional_config_versions?: RawConfigVersion[];
  criteria?: RawCriterion[];
  audit_criteria?: RawCriterion[];
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------
// As RPCs devolvem jsonb em camelCase; a leitura direta das tabelas devolve as
// colunas em snake_case. Em vez de duas famílias de mapeadores, um par de
// ajudantes lê a que existir — o domínio nunca vê nenhuma das duas formas.

const pick = <T>(...values: (T | undefined)[]): T | undefined =>
  values.find((v) => v !== undefined);

const num = (v: number | string | undefined, fallback = 0): number =>
  v === undefined || v === null ? fallback : Number(v);

const validity = (from: string | undefined, to: string | null | undefined) => ({
  from: from ?? '',
  to: to ?? null,
});

const byVersion = <T extends { versionNumber: number }>(xs: T[]): T[] =>
  [...xs].sort((a, b) => a.versionNumber - b.versionNumber);

function toThemeVersion(raw: RawThemeVersion): ThemeVersion {
  return {
    id: raw.id,
    versionNumber: pick(raw.versionNumber, raw.version_number) ?? 0,
    name: raw.name,
    description: raw.description ?? null,
    sortOrder: pick(raw.sortOrder, raw.sort_order) ?? 0,
    status: raw.status,
    active: raw.active,
    validity: validity(pick(raw.effectiveFrom, raw.effective_from), pick(raw.effectiveTo, raw.effective_to)),
  };
}

function toTheme(raw: RawTheme): Theme {
  const versions = raw.versions ?? raw.theme_versions ?? [];
  return {
    id: raw.id,
    code: raw.code,
    scope: scopeOf(pick(raw.scopeKind, raw.scope_kind) ?? 'global', pick(raw.regionId, raw.region_id) ?? null),
    lifecycle: raw.lifecycle,
    versions: byVersion(versions.map(toThemeVersion)),
  };
}

function toIndicator(raw: RawIndicator): CatalogIndicator {
  const versions = raw.versions ?? raw.indicator_versions ?? [];
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    scope: scopeOf(pick(raw.scopeKind, raw.scope_kind) ?? 'global', pick(raw.regionId, raw.region_id) ?? null),
    lifecycle: raw.lifecycle,
    versions: byVersion(versions.map((v) => ({
      id: v.id,
      versionNumber: pick(v.versionNumber, v.version_number) ?? 0,
      // Versão sem nome próprio é catálogo legado: herda o rótulo da definição
      // (ADR-135-001, decisão D-C). O servidor já faz esse coalesce no DTO; aqui
      // ele existe para a leitura direta da tabela.
      name: v.name ?? raw.name,
      description: v.description ?? null,
      unit: v.unit,
      direction: v.direction,
      status: v.status,
      validity: validity(pick(v.effectiveFrom, v.effective_from), pick(v.effectiveTo, v.effective_to)),
    }))),
  };
}

function toCriterion(raw: RawCriterion): AuditCriterion {
  const versions = raw.versions ?? raw.audit_criteria_versions ?? [];
  return {
    id: raw.id,
    configId: pick(raw.configId, raw.config_id) ?? '',
    code: raw.code,
    lifecycle: raw.lifecycle,
    versions: byVersion(versions.map((v) => ({
      id: v.id,
      versionNumber: pick(v.versionNumber, v.version_number) ?? 0,
      question: v.question,
      description: v.description ?? null,
      guidance: v.guidance ?? null,
      sortOrder: pick(v.sortOrder, v.sort_order) ?? 0,
      required: v.required,
      evidenceRequired: pick(v.evidenceRequired, v.evidence_required) ?? false,
      allowsNa: pick(v.allowsNa, v.allows_na) ?? false,
      requiresJustification: pick(v.requiresJustification, v.requires_justification) ?? false,
      status: v.status,
      active: v.active,
      validity: validity(pick(v.effectiveFrom, v.effective_from), pick(v.effectiveTo, v.effective_to)),
    }))),
  };
}

function toConfig(raw: RawConfig): RegionalConfig {
  const versions = raw.versions ?? raw.indicator_regional_config_versions ?? [];
  const criteria = raw.criteria ?? raw.audit_criteria ?? [];
  return {
    id: raw.id,
    regionId: pick(raw.regionId, raw.region_id) ?? '',
    indicatorDefinitionId: pick(raw.indicatorDefinitionId, raw.indicator_definition_id) ?? '',
    indicatorCode: raw.indicatorCode ?? '',
    versions: byVersion(versions.map((v) => ({
      id: v.id,
      versionNumber: pick(v.versionNumber, v.version_number) ?? 0,
      indicatorVersionId: pick(v.indicatorVersionId, v.indicator_version_id) ?? '',
      themeVersionId: pick(v.themeVersionId, v.theme_version_id) ?? '',
      sortOrder: pick(v.sortOrder, v.sort_order) ?? 0,
      target: num(v.target),
      tolerance: num(v.tolerance),
      weight: num(v.weight, 1),
      active: v.active,
      includeInAssistedManagement:
        pick(v.includeInAssistedManagement, v.include_in_assisted_management) ?? true,
      includeInMonthlyAudit:
        pick(v.includeInMonthlyAudit, v.include_in_monthly_audit) ?? false,
      status: v.status,
      validity: validity(pick(v.effectiveFrom, v.effective_from), pick(v.effectiveTo, v.effective_to)),
    }))),
    criteria: criteria.map(toCriterion),
  };
}

/**
 * A mensagem do servidor é repassada CRUA quando existe.
 *
 * As recusas do catálogo são todas nominais e escritas para o operador ("já
 * existe um tema com o código X", "a auditoria mensal exige ao menos um
 * critério publicado"). Substituí-las por "Falha ao publicar" esconderia
 * exatamente o que resolve o problema.
 */
const fail = (fallback: string, cause: { message?: string } | null): AppError =>
  new AppError('network/unavailable', cause?.message || fallback, { cause, severity: 'medium' });

// ---------------------------------------------------------------------------
// Adapter corporativo
// ---------------------------------------------------------------------------

const THEME_SELECT =
  'id, code, scope_kind, region_id, lifecycle, '
  + 'theme_versions(id, version_number, name, description, sort_order, status, active, effective_from, effective_to)';

const INDICATOR_SELECT =
  'id, code, name, scope_kind, region_id, lifecycle, '
  + 'indicator_versions(id, version_number, name, description, unit, direction, status, effective_from, effective_to)';

const CONFIG_SELECT =
  'id, region_id, indicator_definition_id, '
  + 'indicator_regional_config_versions(id, version_number, indicator_version_id, theme_version_id, '
  + 'sort_order, target, tolerance, weight, active, include_in_assisted_management, '
  + 'include_in_monthly_audit, status, effective_from, effective_to), '
  + 'audit_criteria(id, config_id, code, lifecycle, '
  + 'audit_criteria_versions(id, version_number, question, description, guidance, sort_order, required, '
  + 'evidence_required, allows_na, requires_justification, status, active, effective_from, effective_to))';

export class SupabaseCatalogRepository implements CatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listThemes(): Promise<Result<Theme[]>> {
    const { data, error } = await this.client.from('themes').select(THEME_SELECT).order('code');
    if (error) return err(fail('Falha ao carregar temas.', error));
    return ok((data ?? []).map((t) => toTheme(t as unknown as RawTheme)));
  }

  async listIndicators(): Promise<Result<CatalogIndicator[]>> {
    const { data, error } = await this.client
      .from('indicator_definitions').select(INDICATOR_SELECT).order('code');
    if (error) return err(fail('Falha ao carregar indicadores.', error));
    return ok((data ?? []).map((i) => toIndicator(i as unknown as RawIndicator)));
  }

  async listRegionalConfigs(regionId: string): Promise<Result<RegionalConfig[]>> {
    const { data, error } = await this.client
      .from('indicator_regional_configs').select(CONFIG_SELECT).eq('region_id', regionId);
    if (error) return err(fail('Falha ao carregar a configuração da região.', error));
    return ok((data ?? []).map((c) => toConfig(c as unknown as RawConfig)));
  }

  // -- temas ----------------------------------------------------------------

  async createTheme(scope: ScopeKind, regionId: string | null, code: string, input: ThemeVersionInput) {
    return this.themeRpc('catalog_create_theme', {
      p_scope: scope,
      p_region_id: scope === 'regional' ? regionId : null,
      p_code: code,
      p_payload: input,
    }, 'Falha ao criar tema.');
  }

  async addThemeVersion(themeId: string, input: ThemeVersionInput) {
    return this.themeRpc('catalog_add_theme_version',
      { p_theme_id: themeId, p_payload: input }, 'Falha ao criar versão do tema.');
  }

  async publishThemeVersion(versionId: string) {
    return this.themeRpc('catalog_publish_theme_version',
      { p_version_id: versionId }, 'Falha ao publicar a versão do tema.');
  }

  async setThemeLifecycle(themeId: string, lifecycle: 'active' | 'inactive') {
    return this.themeRpc('catalog_set_theme_lifecycle',
      { p_theme_id: themeId, p_lifecycle: lifecycle }, 'Falha ao alterar a situação do tema.');
  }

  // -- indicadores ----------------------------------------------------------

  async createIndicator(scope: ScopeKind, regionId: string | null, code: string, input: IndicatorVersionInput) {
    return this.indicatorRpc('catalog_create_indicator', {
      p_scope: scope,
      p_region_id: scope === 'regional' ? regionId : null,
      p_code: code,
      p_payload: input,
    }, 'Falha ao criar indicador.');
  }

  async addIndicatorVersion(indicatorId: string, input: IndicatorVersionInput) {
    return this.indicatorRpc('catalog_add_indicator_version',
      { p_indicator_id: indicatorId, p_payload: input }, 'Falha ao criar versão do indicador.');
  }

  async publishIndicatorVersion(versionId: string) {
    return this.indicatorRpc('catalog_publish_indicator_version',
      { p_version_id: versionId }, 'Falha ao publicar a versão do indicador.');
  }

  async setIndicatorLifecycle(indicatorId: string, lifecycle: 'active' | 'inactive') {
    return this.indicatorRpc('catalog_set_indicator_lifecycle',
      { p_indicator_id: indicatorId, p_lifecycle: lifecycle },
      'Falha ao alterar a situação do indicador.');
  }

  // -- configuração regional ------------------------------------------------

  async saveRegionalConfigDraft(regionId: string, indicatorId: string, input: RegionalConfigInput) {
    return this.configRpc('catalog_save_regional_config_draft',
      { p_region_id: regionId, p_indicator_id: indicatorId, p_payload: input },
      'Falha ao salvar a configuração regional.');
  }

  async publishRegionalConfigVersion(versionId: string) {
    return this.configRpc('catalog_publish_regional_config_version',
      { p_version_id: versionId }, 'Falha ao publicar a configuração regional.');
  }

  // -- critérios ------------------------------------------------------------

  async createCriterion(configId: string, code: string, input: AuditCriterionInput) {
    return this.criterionRpc('catalog_create_criterion',
      { p_config_id: configId, p_code: code, p_payload: input }, 'Falha ao criar critério.');
  }

  async addCriterionVersion(criterionId: string, input: AuditCriterionInput) {
    return this.criterionRpc('catalog_add_criterion_version',
      { p_criterion_id: criterionId, p_payload: input }, 'Falha ao criar versão do critério.');
  }

  async publishCriterionVersion(versionId: string) {
    return this.criterionRpc('catalog_publish_criterion_version',
      { p_version_id: versionId }, 'Falha ao publicar a versão do critério.');
  }

  async setCriterionLifecycle(criterionId: string, lifecycle: 'active' | 'inactive') {
    return this.criterionRpc('catalog_set_criterion_lifecycle',
      { p_criterion_id: criterionId, p_lifecycle: lifecycle },
      'Falha ao alterar a situação do critério.');
  }

  // -- despacho -------------------------------------------------------------

  private async themeRpc(fn: string, args: Record<string, unknown>, fallback: string): Promise<Result<Theme>> {
    const { data, error } = await this.client.rpc(fn, args);
    return error ? err(fail(fallback, error)) : ok(toTheme(data as RawTheme));
  }

  private async indicatorRpc(fn: string, args: Record<string, unknown>, fallback: string): Promise<Result<CatalogIndicator>> {
    const { data, error } = await this.client.rpc(fn, args);
    return error ? err(fail(fallback, error)) : ok(toIndicator(data as RawIndicator));
  }

  private async configRpc(fn: string, args: Record<string, unknown>, fallback: string): Promise<Result<RegionalConfig>> {
    const { data, error } = await this.client.rpc(fn, args);
    return error ? err(fail(fallback, error)) : ok(toConfig(data as RawConfig));
  }

  private async criterionRpc(fn: string, args: Record<string, unknown>, fallback: string): Promise<Result<AuditCriterion>> {
    const { data, error } = await this.client.rpc(fn, args);
    return error ? err(fail(fallback, error)) : ok(toCriterion(data as RawCriterion));
  }
}

// ---------------------------------------------------------------------------
// Adapter honesto do modo demonstração
// ---------------------------------------------------------------------------

export const CATALOG_UNAVAILABLE_MESSAGE =
  'O catálogo regional existe apenas no ambiente corporativo. '
  + 'Escopo, autorização por região, versionamento e vigência são impostos pelo servidor, '
  + 'e não têm equivalente no modo demonstração.';

/**
 * Recusa toda operação — leitura inclusive.
 *
 * Devolver lista vazia seria pior que recusar: a tela diria "nenhum tema
 * cadastrado" onde a verdade é "não há catálogo aqui".
 */
export class UnavailableCatalogRepository implements CatalogRepository {
  private refuse<T>(): Promise<Result<T>> {
    return Promise.resolve(err(new AppError('config/missing-env', CATALOG_UNAVAILABLE_MESSAGE, {
      severity: 'low',
    })));
  }

  listThemes() { return this.refuse<Theme[]>(); }
  listIndicators() { return this.refuse<CatalogIndicator[]>(); }
  listRegionalConfigs(_regionId: string) { return this.refuse<RegionalConfig[]>(); }

  createTheme(_s: ScopeKind, _r: string | null, _c: string, _i: ThemeVersionInput) { return this.refuse<Theme>(); }
  addThemeVersion(_id: string, _i: ThemeVersionInput) { return this.refuse<Theme>(); }
  publishThemeVersion(_id: string) { return this.refuse<Theme>(); }
  setThemeLifecycle(_id: string, _l: 'active' | 'inactive') { return this.refuse<Theme>(); }

  createIndicator(_s: ScopeKind, _r: string | null, _c: string, _i: IndicatorVersionInput) { return this.refuse<CatalogIndicator>(); }
  addIndicatorVersion(_id: string, _i: IndicatorVersionInput) { return this.refuse<CatalogIndicator>(); }
  publishIndicatorVersion(_id: string) { return this.refuse<CatalogIndicator>(); }
  setIndicatorLifecycle(_id: string, _l: 'active' | 'inactive') { return this.refuse<CatalogIndicator>(); }

  saveRegionalConfigDraft(_r: string, _i: string, _in: RegionalConfigInput) { return this.refuse<RegionalConfig>(); }
  publishRegionalConfigVersion(_id: string) { return this.refuse<RegionalConfig>(); }

  createCriterion(_c: string, _code: string, _i: AuditCriterionInput) { return this.refuse<AuditCriterion>(); }
  addCriterionVersion(_id: string, _i: AuditCriterionInput) { return this.refuse<AuditCriterion>(); }
  publishCriterionVersion(_id: string) { return this.refuse<AuditCriterion>(); }
  setCriterionLifecycle(_id: string, _l: 'active' | 'inactive') { return this.refuse<AuditCriterion>(); }
}
