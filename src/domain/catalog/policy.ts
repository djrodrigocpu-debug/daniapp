/**
 * Espelho de domínio da autorização e das guardas do catálogo com escopo
 * (AAPEx 1.3.5, decisão A-08).
 *
 * ISTO NÃO É SEGURANÇA. A barreira é o servidor: `app.can_manage_catalog`,
 * `app.reaches_region`, os gatilhos das migrations 0036–0038 e a RLS. Este
 * módulo existe para que a interface não OFEREÇA o que será recusado, e para
 * que a regra possa ser lida e testada sem subir um banco.
 *
 * Cada função abaixo tem uma contraparte nominal no servidor. Quando as duas
 * discordarem, quem está certo é o servidor.
 */
import { AuthzSubject, hasRole, isAdmin } from '../authz/policy';
import { IndicatorDirection } from '../model';
import {
  AuditCriterion,
  CatalogScope,
  RegionalConfigVersion,
  ValidityInterval,
} from './types';

/**
 * Espelha `app.can_manage_catalog(region_id)`.
 *
 * Catálogo global (`region === null`) é só do ADMIN. Catálogo regional é do
 * ADMIN ou do Gerente Regional daquela região. Coordenador e Gerente de Canal
 * nunca administram catálogo — nem no próprio escopo: eles consultam e utilizam.
 */
export function canManageCatalog(subject: AuthzSubject, regionId: string | null): boolean {
  if (isAdmin(subject)) return true;
  if (regionId === null) return false;
  return hasRole(subject, 'regional') && subject.regionIds.includes(regionId);
}

/** A mesma decisão, a partir do escopo já resolvido de um objeto. */
export function canManageScope(subject: AuthzSubject, scope: CatalogScope): boolean {
  return canManageCatalog(subject, scope.kind === 'regional' ? scope.regionId : null);
}

/**
 * Espelha `app.reaches_region(region_id)` — alcance de LEITURA.
 *
 * Diferente de `canManageCatalog`: um coordenador alcança a região da sua
 * coordenadoria e um GC alcança a dos seus parceiros, mas nenhum dos dois
 * administra nada. Por isso o chamador informa as regiões alcançadas — elas
 * dependem de dados que só o servidor tem.
 */
export function reachesRegion(reachableRegionIds: string[], regionId: string | null): boolean {
  return regionId !== null && reachableRegionIds.includes(regionId);
}

/** Objeto global é visível a todos; regional, só a quem alcança a região. */
export function canSeeScope(reachableRegionIds: string[], scope: CatalogScope): boolean {
  return scope.kind === 'global' || reachesRegion(reachableRegionIds, scope.regionId);
}

// ---------------------------------------------------------------------------
// Guardas de publicação — espelhos dos gatilhos
// ---------------------------------------------------------------------------

/** Motivo pelo qual uma versão de configuração ainda não pode ser publicada. */
export type PublishBlock =
  | { reason: 'target-band-sem-regra' }
  | { reason: 'auditoria-mensal-sem-criterio' }
  | { reason: 'indicador-nao-publicado' }
  | { reason: 'tema-nao-publicado' };

export interface PublishContext {
  direction: IndicatorDirection;
  indicatorVersionPublished: boolean;
  themeVersionPublished: boolean;
  criteria: AuditCriterion[];
}

/**
 * Tem ao menos um critério publicado E ativo, de um critério não inativado?
 * Espelha `app.guard_monthly_audit_requires_criteria`.
 */
export function hasPublishedActiveCriterion(criteria: AuditCriterion[]): boolean {
  return criteria.some(
    (c) => c.lifecycle !== 'inactive'
      && c.versions.some((v) => v.status === 'published' && v.active),
  );
}

/**
 * Tudo que impede publicar esta versão de configuração, na ordem em que o
 * servidor recusaria. Lista vazia = o servidor deve aceitar.
 *
 * `target_band` é o item que NÃO pode desaparecer daqui em silêncio: a pendência
 * **A-01** segue aberta, o enum tem três direções e D2 define regra de status
 * para duas. Enquanto isso, publicar na Gestão Assistida é recusado — não se
 * converte para higher_better nem lower_better, e não se inventa faixa.
 */
export function publishBlocks(
  version: Pick<RegionalConfigVersion, 'includeInAssistedManagement' | 'includeInMonthlyAudit'>,
  context: PublishContext,
): PublishBlock[] {
  const blocks: PublishBlock[] = [];
  if (!context.indicatorVersionPublished) blocks.push({ reason: 'indicador-nao-publicado' });
  if (!context.themeVersionPublished) blocks.push({ reason: 'tema-nao-publicado' });
  if (version.includeInAssistedManagement && context.direction === 'target_band') {
    blocks.push({ reason: 'target-band-sem-regra' });
  }
  if (version.includeInMonthlyAudit && !hasPublishedActiveCriterion(context.criteria)) {
    blocks.push({ reason: 'auditoria-mensal-sem-criterio' });
  }
  return blocks;
}

/** Texto apresentável de cada bloqueio. Sem jargão de banco, sem código SQL. */
export function describePublishBlock(block: PublishBlock): string {
  switch (block.reason) {
    case 'target-band-sem-regra':
      return 'Direção "faixa alvo" ainda não tem regra de status definida (pendência A-01). '
        + 'Não é possível publicar este indicador na Gestão Assistida.';
    case 'auditoria-mensal-sem-criterio':
      return 'A Auditoria Mensal exige ao menos um critério publicado e ativo para este '
        + 'indicador nesta região.';
    case 'indicador-nao-publicado':
      return 'A versão do indicador escolhida ainda está em rascunho. Publique-a primeiro.';
    case 'tema-nao-publicado':
      return 'A versão do tema escolhida ainda está em rascunho ou foi inativada.';
  }
}

// ---------------------------------------------------------------------------
// Vigência
// ---------------------------------------------------------------------------

/**
 * Sobreposição de intervalos meio-abertos `[from, to)` — a mesma comparação que
 * o `tstzrange(..., '[)')` dos gatilhos faz. Tocar-se pelo extremo NÃO é
 * sobrepor: fechar a versão anterior exatamente no início da nova é o caminho
 * normal de publicação.
 */
export function overlaps(a: ValidityInterval, b: ValidityInterval): boolean {
  const aEnd = a.to ?? null;
  const bEnd = b.to ?? null;
  const aStartsBeforeBEnds = bEnd === null || a.from < bEnd;
  const bStartsBeforeAEnds = aEnd === null || b.from < aEnd;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/** Vigente na data informada. */
export function isInForce(validity: ValidityInterval, at: string): boolean {
  return validity.from <= at && (validity.to === null || at < validity.to);
}

/**
 * A versão publicada vigente numa data. `null` quando não há — que é o estado
 * normal de um indicador que a região ainda não adotou (decisão D-G).
 */
export function versionInForce<T extends { status: string; validity: ValidityInterval }>(
  versions: T[],
  at: string,
): T | null {
  return versions.find((v) => v.status === 'published' && isInForce(v.validity, at)) ?? null;
}
