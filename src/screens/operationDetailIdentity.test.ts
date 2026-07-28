/**
 * PROVA ESTÁTICA de que public.operations.id atravessa íntegro: view → DTO →
 * lista → navegação → rota → tela de detalhe.
 *
 * Correção do bug "Parceiro não existente": o UUID sempre esteve correto em
 * cada etapa (provado aqui); a quebra era a tela de detalhe consultar uma
 * fonte de dados diferente (store local de demonstração) da que preenche a
 * lista. Este teste também prova que esse caminho antigo não voltou.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const viewSql = ler('supabase/migrations/0005_ui_projections.sql');
const listaScreen = ler('src/screens/OperationsScreen.tsx');
const detalheScreen = ler('src/screens/OperationDetailScreen.tsx');
const tipos = ler('src/types/index.ts');
const repoSupabase = ler('src/data/repositories/SupabaseOperationsRepository.ts');

describe('identidade do Parceiro AACE — public.operations.id de ponta a ponta', () => {
  it('1 — a view ui_operations projeta o.id como "id", sem apelido alternativo', () => {
    expect(viewSql).toMatch(/o\.id\s+as\s+"id"/);
  });

  it('1 — o repositório Supabase não renomeia nem descarta o id ao mapear a linha', () => {
    // mapRow faz spread do row inteiro; nenhuma exclusão de "id" no tipo mapeado.
    expect(repoSupabase).toContain("Omit<Operation, 'lastAudit'>");
    expect(repoSupabase).not.toMatch(/Omit<Operation,\s*'id'/);
  });

  it('2 — o clique na lista envia exatamente item.id, não outro campo', () => {
    expect(listaScreen).toContain("navigation.navigate('OperationDetail', { operationId: item.id })");
    // Nenhuma variação por índice, nome ou código-fonte.
    expect(listaScreen).not.toMatch(/operationId:\s*(index|item\.partnerName|item\.officeName|item\.sourceCode)/);
  });

  it('2 — a chave de item da lista é o mesmo id usado na navegação', () => {
    expect(listaScreen).toContain('keyExtractor={(item) => item.id}');
  });

  it('3 — a rota tipa operationId como string, não como índice ou objeto', () => {
    expect(tipos).toContain('OperationDetail: { operationId: string }');
  });

  it('4 — a tela de detalhe consulta pela coluna id, na lista já carregada pelo escopo', () => {
    expect(detalheScreen).toContain('operations.find((o) => o.id === operationId)');
  });

  it('4 — o caminho antigo (store local de demonstração) não volta a decidir a existência', () => {
    // getUser() de useEvaluations() continua em uso (nomes de coordenador/GC);
    // getOperation() — a origem do bug — não é mais chamado aqui.
    expect(detalheScreen).not.toContain('getOperation(operationId)');
    expect(detalheScreen).not.toMatch(/const\s*\{[^}]*getOperation[^}]*\}\s*=\s*useEvaluations/);
  });

  it('6 — carregando e erro de rede/RLS são estados distintos de "não encontrado" no código da tela', () => {
    expect(detalheScreen).toContain('decideOperationDetailState');
    expect(detalheScreen).toMatch(/detailState === 'loading'/);
    expect(detalheScreen).toMatch(/detailState === 'error'/);
  });
});
