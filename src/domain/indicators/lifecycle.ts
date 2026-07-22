/**
 * Ciclo de vida e versionamento de indicadores (Masterplan §8.1, §11.3;
 * D-05; Anexo D — T05).
 *
 * Regras:
 *  - "Excluir" um indicador JÁ USADO significa inativar para novas avaliações,
 *    preservando definições e medições passadas (nunca delete físico).
 *  - Alteração substantiva (fórmula/unidade/direção/peso/meta/faixa) cria NOVA
 *    versão; a versão anterior permanece para comparabilidade histórica.
 */
import { IndicatorDefinition, IndicatorVersion } from '../model';
import { Result, ok, err } from '../errors/result';
import { AppError } from '../errors/AppError';

/**
 * Tenta EXCLUIR fisicamente um indicador. Se já foi usado (há medições),
 * bloqueia e orienta a inativar (T05). Espelha o gatilho SQL guard_indicator_delete.
 */
export function assertCanPhysicallyDelete(
  definition: IndicatorDefinition,
  measurementCount: number,
): Result<true> {
  if (measurementCount > 0) {
    return err(
      new AppError('integrity/indicator-in-use', `Indicador ${definition.code} já utilizado: inative-o para novas avaliações, não exclua.`, {
        severity: 'high',
        details: { code: definition.code, measurementCount },
      }),
    );
  }
  return ok(true);
}

/** Inativa (não deleta): impede uso em novas avaliações, preserva histórico. */
export function deactivate(definition: IndicatorDefinition): IndicatorDefinition {
  return { ...definition, lifecycle: 'inactive' };
}

/** Um indicador inativo não pode ser medido em novas avaliações. */
export function canMeasure(definition: IndicatorDefinition): boolean {
  return definition.lifecycle === 'active';
}

/** Campos cuja mudança é substantiva e exige nova versão (§8.1). */
export function requiresNewVersion(
  current: Pick<IndicatorVersion, 'unit' | 'direction' | 'target' | 'yellowTolerance' | 'weight'>,
  proposed: Pick<IndicatorVersion, 'unit' | 'direction' | 'target' | 'yellowTolerance' | 'weight'>,
): boolean {
  return (
    current.unit !== proposed.unit ||
    current.direction !== proposed.direction ||
    current.target !== proposed.target ||
    current.yellowTolerance !== proposed.yellowTolerance ||
    current.weight !== proposed.weight
  );
}

/** Próximo número de versão. */
export function nextVersionNumber(existing: IndicatorVersion[]): number {
  return existing.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
}
