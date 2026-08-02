/**
 * Contrato do repositório de CATÁLOGO COM ESCOPO (AAPEx 1.3.5, decisão A-08).
 *
 * Fica no domínio, separado das duas implementações (`src/data/repositories/
 * CatalogRepository.ts`), porque o escopo desta fase §15 pede exatamente essa
 * separação: modelo puro · interface · adapter Supabase · adapter local.
 *
 * Toda operação devolve `Result` — recusa de regra e recusa de autorização são
 * VALORES, não exceções (§16.2). Em particular, "sem permissão" é resposta
 * legítima do servidor e chega aqui como `Err`, nunca como throw.
 */
import { Result } from '../errors/result';
import {
  AuditCriterion,
  AuditCriterionInput,
  CatalogIndicator,
  RegionalConfig,
  RegionalConfigInput,
  IndicatorVersionInput,
  ScopeKind,
  Theme,
  ThemeVersionInput,
} from '../catalog/types';

/** Região, no mínimo necessário para escolher onde configurar. */
export interface CatalogRegion {
  id: string;
  name: string;
}

export interface CatalogRepository {
  // -------------------------------------------------------------------------
  // Leitura — o servidor já devolve apenas o que o papel alcança (RLS)
  // -------------------------------------------------------------------------

  /**
   * Regiões existentes. `public.regions` é legível por qualquer autenticado
   * desde 0002 — quem pode ADMINISTRAR cada uma é outra pergunta, respondida
   * por `canManageCatalog` na interface e por `app.can_manage_catalog` no
   * servidor.
   */
  listRegions(): Promise<Result<CatalogRegion[]>>;

  /** Temas globais mais os regionais que o usuário alcança. */
  listThemes(): Promise<Result<Theme[]>>;

  /** Indicadores globais mais os regionais que o usuário alcança. */
  listIndicators(): Promise<Result<CatalogIndicator[]>>;

  /** Configurações operacionais de uma região. */
  listRegionalConfigs(regionId: string): Promise<Result<RegionalConfig[]>>;

  // -------------------------------------------------------------------------
  // Temas
  // -------------------------------------------------------------------------

  createTheme(
    scope: ScopeKind,
    regionId: string | null,
    code: string,
    input: ThemeVersionInput,
  ): Promise<Result<Theme>>;
  addThemeVersion(themeId: string, input: ThemeVersionInput): Promise<Result<Theme>>;
  /** Idempotente: publicar duas vezes devolve o mesmo estado. */
  publishThemeVersion(versionId: string): Promise<Result<Theme>>;
  setThemeLifecycle(themeId: string, lifecycle: 'active' | 'inactive'): Promise<Result<Theme>>;

  // -------------------------------------------------------------------------
  // Indicadores
  // -------------------------------------------------------------------------

  createIndicator(
    scope: ScopeKind,
    regionId: string | null,
    code: string,
    input: IndicatorVersionInput,
  ): Promise<Result<CatalogIndicator>>;
  addIndicatorVersion(indicatorId: string, input: IndicatorVersionInput): Promise<Result<CatalogIndicator>>;
  publishIndicatorVersion(versionId: string): Promise<Result<CatalogIndicator>>;
  setIndicatorLifecycle(indicatorId: string, lifecycle: 'active' | 'inactive'): Promise<Result<CatalogIndicator>>;

  // -------------------------------------------------------------------------
  // Configuração operacional regional
  // -------------------------------------------------------------------------

  /** Grava uma versão em RASCUNHO; cria a adoção se ela ainda não existir. */
  saveRegionalConfigDraft(
    regionId: string,
    indicatorId: string,
    input: RegionalConfigInput,
  ): Promise<Result<RegionalConfig>>;
  publishRegionalConfigVersion(versionId: string): Promise<Result<RegionalConfig>>;

  // -------------------------------------------------------------------------
  // Critérios de processo
  // -------------------------------------------------------------------------

  createCriterion(configId: string, code: string, input: AuditCriterionInput): Promise<Result<AuditCriterion>>;
  addCriterionVersion(criterionId: string, input: AuditCriterionInput): Promise<Result<AuditCriterion>>;
  publishCriterionVersion(versionId: string): Promise<Result<AuditCriterion>>;
  setCriterionLifecycle(criterionId: string, lifecycle: 'active' | 'inactive'): Promise<Result<AuditCriterion>>;
}
