/**
 * Contrato do repositório do DASHBOARD, da MATRIZ e da PONDERAÇÃO
 * (AAPEx 1.3.5, decisão D10).
 *
 * Fica no domínio, separado das implementações, pelo mesmo motivo do catálogo e
 * da Gestão Assistida: modelo puro · interface · adapter Supabase · adapter
 * honesto de demonstração.
 *
 * Toda operação devolve `Result`: recusa de escopo e recusa de regra são
 * VALORES, não exceções.
 */
import { Result } from '../errors/result';
import {
  DashboardAggregates,
  DashboardFilters,
  MatrixDataset,
  RegionWeightingInput,
  RegionWeightingVersion,
  WeightingStatus,
} from '../dashboard/types135';

export interface DashboardRepository {
  /**
   * Agregações do período e do escopo. Os filtros são resolvidos NO SERVIDOR:
   * omitir um filtro significa "todo o escopo autorizado", e pedir apenas o que
   * não se alcança é recusado com a mesma frase de um objeto inexistente.
   */
  getAggregates(filters?: DashboardFilters): Promise<Result<DashboardAggregates>>;

  /** Os dois eixos, o quadrante e — quando legalmente calculável — o índice. */
  getMatrix(filters?: DashboardFilters): Promise<Result<MatrixDataset>>;

  /** Estado da ponderação por região alcançável. Sem região, todas as do escopo. */
  getWeightingStatus(regionId?: string): Promise<Result<WeightingStatus>>;

  /**
   * Cria ou edita o RASCUNHO de ponderação da região. Um rascunho por região:
   * salvar de novo edita o mesmo objeto. Os pesos precisam somar 100, e quem
   * recusa é o banco.
   */
  saveWeightingDraft(
    regionId: string, input: RegionWeightingInput,
  ): Promise<Result<RegionWeightingVersion>>;

  /**
   * Publica o rascunho. Fecha a vigência da versão anterior sem reescrever seus
   * pesos — versão publicada é imutável.
   */
  publishWeighting(weightingId: string): Promise<Result<RegionWeightingVersion>>;
}
