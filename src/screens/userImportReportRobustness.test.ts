/**
 * PROVA ESTÁTICA — o relatório de importação de usuários não pode quebrar a
 * tela por causa de um status que o servidor devolva.
 *
 * Defeito que originou este teste: a RPC `admin_import_users` marca como
 * `pending_auth` toda linha cujo e-mail ainda não tem identidade no Auth — o
 * estado NORMAL de todo usuário novo. O mapa de estilos só previa
 * `ok | duplicate | error`, e `ROW_STYLE[row.status]` vinha `undefined`; ler
 * `.border` dele derrubava a árvore React inteira. Numa carga inicial TODAS as
 * linhas chegam nesse estado, então a tela branca era certa — foi exatamente o
 * que aconteceu ao simular a carga real em produção.
 *
 * O contrato agora tem duas defesas independentes: `satisfies` obriga o mapa a
 * cobrir todo `UserImportRowStatus` (erro de typecheck se faltar), e a leitura
 * tem fallback (nenhum status futuro derruba a tela).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const tela = ler('src/screens/admin/UserImportFlow.tsx');
const tipos = ler('src/domain/users/types.ts');

describe('relatório de importação de usuários — robustez de status', () => {
  it('o contrato de status inclui pending_auth', () => {
    expect(tipos).toMatch(/UserImportRowStatus[^;]*'pending_auth'/s);
  });

  it('o mapa de estilos tem entrada para pending_auth', () => {
    expect(tela).toMatch(/pending_auth:\s*\{[^}]*label:/);
  });

  it('o mapa é travado por satisfies contra todo UserImportRowStatus', () => {
    expect(tela).toMatch(/satisfies\s+Record<UserImportRowStatus,/);
  });

  it('a leitura do estilo tem fallback — nunca indexa direto', () => {
    expect(tela).toMatch(/ROW_STYLE\[row\.status\]\s*\?\?/);
    // Nenhuma indexação sem fallback sobreviveu.
    const semFallback = /ROW_STYLE\[row\.status\](?!\s*\?\?)/.test(tela);
    expect(semFallback).toBe(false);
  });

  it('listas do relatório toleram ausência em vez de estourar', () => {
    expect(tela).toMatch(/\(row\.messages \?\? \[\]\)\.map/);
    expect(tela).toMatch(/\(row\.warnings \?\? \[\]\)\.map/);
    expect(tela).toMatch(/\(coordinationsWithoutCoordinator \?\? \[\]\)/);
  });
});
