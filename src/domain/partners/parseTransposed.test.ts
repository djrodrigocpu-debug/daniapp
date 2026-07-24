/**
 * Parser transposto de Parceiros AACE — dados 100% SINTÉTICOS espelhando a
 * topologia da planilha real (14 registros, rótulos com dois-pontos e texto
 * de ajuda, espaço final, e-mails com maiúsculas). Nenhum dado real (§23).
 */
import { describe, it, expect } from 'vitest';
import { parsePartnersSheet } from './parseTransposed';
import { MAX_IMPORT_ROWS } from './types';

const LABELS = [
  'Organização:',
  'Região:',
  'Unidade piloto:',
  'Coordenação:',
  'Nome do parceiro/operação:',
  'Nome do escritório:',
  'Cidade:',
  'Estado: PR ou SC', // rótulo com texto de ajuda embutido (formato real)
  'E-mail do Coordenador:',
  'E-mail do GC:',
];

/** Grade sintética 10×(1+N): rótulos + N registros. */
function buildGrid(records = 14): string[][] {
  const grid: string[][] = LABELS.map((label) => [label]);
  for (let n = 1; n <= records; n += 1) {
    const values = [
      'ORG SINTETICA',
      'REGIAO SINTETICA',
      'UNIDADE SINTETICA',
      n <= 4 ? 'COORD NORTE' : n <= 8 ? 'COORD SUL' : 'COORD OESTE',
      n === 4 ? 'BETA SINTETICA LTDA ' : 'ALFA SINTETICA LTDA', // espaço final proposital
      n === 7 ? 'PS - ALIANÇA SINTÉTICA - 0007' : `PS - ESCRITORIO SINT - ${String(n).padStart(4, '0')}`,
      n % 2 === 0 ? 'Curitiba' : 'Joinville',
      n <= 10 ? 'pr' : 'SC', // caixa baixa proposital
      n === 1 ? 'CoordN@Sint.Example' : 'coordn@sint.example',
      n === 5 ? 'GC5.Maiusculo@Sint.Example' : `gc${((n - 1) % 9) + 1}@sint.example`,
    ];
    values.forEach((v, i) => { grid[i].push(v); });
  }
  return grid;
}

describe('parsePartnersSheet — formato transposto', () => {
  it('reconhece os 14 registros com normalizações aplicadas (testes 9 e 11)', () => {
    const { rows, issues } = parsePartnersSheet(buildGrid());
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(14);

    expect(rows[0].index).toBe(1);
    expect(rows[0].organizationName).toBe('ORG SINTETICA');
    expect(rows[0].coordinatorEmail).toBe('coordn@sint.example'); // lowercase
    expect(rows[0].state).toBe('PR'); // uppercase a partir de 'pr'

    expect(rows[3].partnerName).toBe('BETA SINTETICA LTDA'); // espaço final removido
    expect(rows[4].managerEmail).toBe('gc5.maiusculo@sint.example');
    expect(rows[6].officeName).toBe('PS - ALIANÇA SINTÉTICA - 0007'); // acentos preservados
  });

  it('ignora colunas totalmente vazias', () => {
    const grid = buildGrid();
    grid.forEach((row) => row.push('')); // coluna extra vazia
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toHaveLength(14);
    expect(issues).toEqual([]);
  });

  it('rótulo obrigatório ausente é erro GLOBAL sem linhas (E9)', () => {
    const grid = buildGrid().filter((row) => row[0] !== 'Estado: PR ou SC');
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => i.column === null && /Rótulo obrigatório ausente.*Estado/.test(i.message))).toBe(true);
  });

  it('rótulo desconhecido é erro GLOBAL — nunca interpreta planilha estranha (E9)', () => {
    const grid = buildGrid();
    grid.push(['Faturamento anual:', '1000', '2000']);
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => /Rótulo desconhecido.*Faturamento anual/.test(i.message))).toBe(true);
  });

  it('rótulo duplicado é erro GLOBAL (E9)', () => {
    const grid = buildGrid();
    grid.push(['Cidade:', 'Outra', 'Outra']);
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => /Rótulo duplicado.*Cidade/.test(i.message))).toBe(true);
  });

  it('coluna inválida vira issue com coluna identificada e fica fora de rows (teste 15)', () => {
    const grid = buildGrid();
    const stateRow = grid.find((row) => row[0].startsWith('Estado'))!;
    const emailRow = grid.find((row) => row[0].startsWith('E-mail do GC'))!;
    const cityRow = grid.find((row) => row[0].startsWith('Cidade'))!;
    stateRow[2] = 'SP'; // índice 2 do array = coluna C da planilha (registro 2)
    emailRow[3] = 'sem-arroba'; // coluna D (registro 3)
    cityRow[4] = '   '; // coluna E (registro 4): obrigatório vazio

    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toHaveLength(11); // 14 - 3 colunas inválidas
    expect(issues).toEqual([
      { column: 3, field: 'state', message: 'Estado inválido: SP (esperado PR ou SC)' },
      { column: 4, field: 'managerEmail', message: 'E-mail do GC inválido: sem-arroba' },
      { column: 5, field: 'city', message: 'Campo obrigatório ausente: Cidade' },
    ]);
  });

  it('campo acima do limite de tamanho vira issue (E8)', () => {
    const grid = buildGrid(1);
    const officeRow = grid.find((row) => row[0].startsWith('Nome do escritório'))!;
    officeRow[1] = 'X'.repeat(301);
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => /excede o limite de 300/.test(i.message))).toBe(true);
  });

  it(`mais de ${MAX_IMPORT_ROWS} registros é erro GLOBAL (E8)`, () => {
    const { rows, issues } = parsePartnersSheet(buildGrid(MAX_IMPORT_ROWS + 1));
    expect(rows).toEqual([]);
    expect(issues.some((i) => new RegExp(`limite por importação é ${MAX_IMPORT_ROWS}`).test(i.message))).toBe(true);
  });

  it('planilha só com rótulos (sem registros) é erro claro', () => {
    const { rows, issues } = parsePartnersSheet(buildGrid(0));
    expect(rows).toEqual([]);
    expect(issues.some((i) => /Nenhum registro encontrado/.test(i.message))).toBe(true);
  });
});
