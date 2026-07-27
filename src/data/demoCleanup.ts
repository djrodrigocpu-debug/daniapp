/**
 * Remoção dos dados de DEMONSTRAÇÃO antes da carga real (§23).
 *
 * O seed de desenvolvimento (`mock.ts`) traz coordenadores fictícios cujas áreas
 * coincidem com as reais do canal ("PR Capital", "Santa Catarina"). Com os dois
 * conjuntos no mesmo store, cada área passa a ter DOIS coordenadores ativos, a
 * resolução por coordenação vira ambígua — e, por segurança, nenhum GC é
 * vinculado. Na prática isso trava a importação de Parceiros AACE.
 *
 * A limpeza é CIRÚRGICA: só remove um registro se ele ainda for idêntico ao do
 * seed (mesmo id E mesma identidade). Qualquer registro importado ou editado
 * pelo Administrador é preservado, mesmo que reuse um id.
 */
import { AppData, Evaluation, Operation, User } from '../types';
import { initialData } from './mock';
import { linkManagersToCoordinators } from './repositories/AdminRepository';

const seedUsers = new Map(initialData.users.map((u) => [u.id, u.email.toLowerCase()]));
const seedOperations = new Map(initialData.operations.map((o) => [o.id, o.officeName]));

/** true se o usuário ainda é exatamente um perfil de demonstração do seed. */
export function isDemoSeedUser(user: User): boolean {
  return seedUsers.get(user.id) === user.email.toLowerCase();
}

/** true se a operação ainda é exatamente um Parceiro AACE fictício do seed. */
export function isDemoSeedOperation(operation: Operation): boolean {
  return seedOperations.get(operation.id) === operation.officeName;
}

/** Quantos registros de demonstração ainda existem (0 ⇒ base já limpa). */
export function countDemoSeedData(data: AppData): number {
  return data.users.filter(isDemoSeedUser).length + data.operations.filter(isDemoSeedOperation).length;
}

/**
 * Guarda contra AUTO-BLOQUEIO: remover o seed apaga também o administrador de
 * demonstração. Sem um Administrador real e ativo na base, ninguém mais entra
 * na aba Admin — e não há como desfazer. Por isso a ordem correta é importar a
 * planilha de usuários ANTES de limpar.
 */
export function canRemoveDemoSeedData(data: AppData): { ok: true } | { ok: false; reason: string } {
  const realAdmin = data.users.some(
    (u) => u.role === 'admin' && u.active !== false && !isDemoSeedUser(u),
  );
  if (realAdmin) return { ok: true };
  return {
    ok: false,
    reason:
      'Importe primeiro a planilha de Usuários (ela precisa conter alguém com perfil Administrador). '
      + 'Sem um Administrador real cadastrado, remover os dados de demonstração deixaria a base sem '
      + 'ninguém com acesso à Administração.',
  };
}

/**
 * Remove os registros de demonstração e tudo que dependia deles (avaliações,
 * planos, indicadores e relatórios das operações fictícias), para não deixar
 * referência órfã. O catálogo de indicadores versionados NÃO é tocado: ele é
 * gerido pelo Administrador e não colide com os dados do canal.
 *
 * Revincula os GCs ao final: enquanto os coordenadores fictícios existiam, as
 * áreas ficavam ambíguas e os GCs importados ficaram sem coordenador. Sumindo a
 * ambiguidade, o vínculo correto passa a existir — sem exigir reimportação.
 */
export function removeDemoSeedData(data: AppData): AppData {
  const users = linkManagersToCoordinators(data.users.filter((u) => !isDemoSeedUser(u))).users;
  const operations = data.operations.filter((o) => !isDemoSeedOperation(o));
  const keptOperationIds = new Set(operations.map((o) => o.id));

  const evaluations = data.evaluations.filter((e: Evaluation) => keptOperationIds.has(e.operationId));
  const keptEvaluationIds = new Set(evaluations.map((e) => e.id));

  return {
    ...data,
    users,
    operations,
    evaluations,
    actionPlans: data.actionPlans.filter(
      (a) => keptOperationIds.has(a.operationId) && keptEvaluationIds.has(a.evaluationId),
    ),
    indicatorResults: data.indicatorResults.filter((r) => keptOperationIds.has(r.operationId)),
    visitReports: data.visitReports.filter((v) => keptOperationIds.has(v.operationId)),
  };
}
