/**
 * Contrato do repositório de EXPORTAÇÃO (AAPEx 1.3.5, decisão D9).
 *
 * Uma operação só: buscar o dataset já recortado pelo servidor. A geração do
 * arquivo é do domínio (`csv.ts`, `xlsx.ts`), e ela **não pode ampliar** o
 * conjunto devolvido — quem recorta é a RPC.
 */
import { Result } from '../errors/result';
import { DashboardFilters } from '../dashboard/types135';
import { ExportDataset, ExportModule } from '../exporting/dataset';

export interface ExportRepository {
  /**
   * O dataset do módulo, dentro do escopo do ator e com os filtros aplicados no
   * servidor. Módulo desconhecido, filtro desconhecido e alvo fora do escopo
   * voltam como `Err` com a frase do servidor — nunca como arquivo vazio que
   * pareça um recorte legítimo.
   */
  getDataset(module: ExportModule, filters?: DashboardFilters): Promise<Result<ExportDataset>>;
}
