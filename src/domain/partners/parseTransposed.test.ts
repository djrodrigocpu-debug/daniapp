/**
 * Parser transposto de Parceiros AACE — dados 100% SINTÉTICOS espelhando a
 * topologia da planilha real (14 registros, rótulos com dois-pontos e texto
 * de ajuda, espaço final, e-mails com maiúsculas). Nenhum dado real (§23).
 */
import { describe, it, expect } from 'vitest';
import { parsePartnersSheet } from './parseTransposed';
import { MAX_IMPORT_ROWS } from './types';

/**
 * Topologia REAL da planilha definitiva (aba tabular, dezesseis colunas):
 * origem do parceiro (Código Fonte, DDD) ao lado de colunas de controle que o
 * importador não consome. Valores sintéticos — só a forma é copiada.
 */
const CABECALHO_DEFINITIVA = [
  'Organização', 'Região', 'Unidade', 'Coordenação', 'Nome do parceiro',
  'CNPJ', 'Nome do escritório', 'Cidade', 'Estado', 'E-mail do Coordenador',
  'E-mail do GC', 'Ativo', 'Código Fonte', 'DDD', 'E-mail Gerente Regional', 'Linha Fonte',
];

const LINHA_DEFINITIVA = [
  'ORG SINTETICA', 'REGIAO SINTETICA', 'UNIDADE SINTETICA', 'PR CAPITAL', 'ALFA SINTETICA LTDA',
  '', 'PS - ALFA - 0001', '0', 'PR', 'coord.sint@sint.example',
  'gc.sint@sint.example', '1', 'FONTE0001', '41', 'regional.sint@sint.example', '2',
];

describe('parsePartnersSheet — planilha definitiva (dezesseis colunas)', () => {
  const grade = () => [[...CABECALHO_DEFINITIVA], [...LINHA_DEFINITIVA]];

  it('lê o registro sem recusar as colunas de controle', () => {
    const { rows, issues } = parsePartnersSheet(grade());
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('transporta Código Fonte e DDD — a origem do parceiro não se perde', () => {
    const { rows } = parsePartnersSheet(grade());
    expect(rows[0].sourceCode).toBe('FONTE0001');
    expect(rows[0].ddd).toBe('41');
  });

  it('CNPJ vazio continua ausente, nunca preenchido com valor artificial', () => {
    const { rows } = parsePartnersSheet(grade());
    expect(rows[0].cnpj).toBeUndefined();
  });

  it('"E-mail Gerente Regional" é ignorado sem engolir o E-mail do GC', () => {
    const { rows } = parsePartnersSheet(grade());
    expect(rows[0].managerEmail).toBe('gc.sint@sint.example');
    expect(rows[0].coordinatorEmail).toBe('coord.sint@sint.example');
  });

  it('coluna realmente desconhecida continua sendo recusada', () => {
    const g = grade();
    g[0][15] = 'Coluna Que Ninguem Conhece';
    const { rows, issues } = parsePartnersSheet(g);
    expect(rows).toHaveLength(0);
    expect(issues.some((i) => /Rótulo desconhecido/.test(i.message))).toBe(true);
  });
});

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
    const grid = buildGrid().filter((row) => !row[0].startsWith('Cidade'));
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => i.column === null && /Rótulo obrigatório ausente.*Cidade/.test(i.message))).toBe(true);
  });

  it('sem coluna Estado e sem como deduzir, cada registro vira issue (não inventa UF)', () => {
    // As coordenações sintéticas ("COORD NORTE"…) não carregam a UF.
    const grid = buildGrid(2).filter((row) => !row[0].startsWith('Estado'));
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(2);
    expect(issues[0].field).toBe('state');
    expect(issues[0].message).toMatch(/Estado ausente e não foi possível deduzir da coordenação "COORD NORTE"/);
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

  it('reconhece a orientação transposta', () => {
    expect(parsePartnersSheet(buildGrid(3)).layout).toBe('transposed');
  });
});

/**
 * Formato TABULAR do canal: rótulos na linha 1, um escritório por linha, e
 * SEM as colunas Organização, Região, Estado e E-mail do Coordenador — que a
 * planilha operacional real não traz.
 */
const TABULAR_HEADER = [
  'Empresa parceira / Razao Social',
  'Nome do escritorio',
  'Cidade',
  'Unidade',
  'Coordenação de vendas',
  'Email Gerentes de Canais',
];

function buildTabular(records = 3): string[][] {
  const grid: string[][] = [TABULAR_HEADER];
  for (let n = 1; n <= records; n += 1) {
    grid.push([
      'ALFA SINTETICA LTDA ', // espaço final proposital
      `PS - ESCRITORIO SINT - ${String(n).padStart(4, '0')}`,
      n % 2 === 0 ? 'Curitiba' : 'Joinville',
      'RPS',
      n === 1 ? 'PR CAPITAL' : n === 2 ? 'SANTA CATARINA' : 'PR INTERIOR',
      `GC${n}@Sint.Example`,
    ]);
  }
  return grid;
}

describe('parsePartnersSheet — formato tabular do canal', () => {
  it('reconhece a orientação e os registros linha a linha', () => {
    const { rows, issues, layout } = parsePartnersSheet(buildTabular());
    expect(issues).toEqual([]);
    expect(layout).toBe('tabular');
    expect(rows).toHaveLength(3);
    expect(rows[0].index).toBe(1);
    expect(rows[0].partnerName).toBe('ALFA SINTETICA LTDA'); // espaço final removido
    expect(rows[0].officeName).toBe('PS - ESCRITORIO SINT - 0001');
    expect(rows[0].unitName).toBe('RPS');
    expect(rows[0].managerEmail).toBe('gc1@sint.example'); // lowercase
  });

  it('deduz a UF pela coordenação e informa a dedução em warnings', () => {
    const { rows, warnings } = parsePartnersSheet(buildTabular());
    expect(rows.map((r) => r.state)).toEqual(['PR', 'SC', 'PR']);
    expect(warnings).toHaveLength(3);
    expect(warnings[0].message).toMatch(/Estado PR deduzido da coordenação "PR CAPITAL"/);
  });

  it('deixa Organização, Região e e-mail do Coordenador ausentes para o repositório resolver', () => {
    const { rows } = parsePartnersSheet(buildTabular(1));
    expect(rows[0].organizationName).toBeUndefined();
    expect(rows[0].regionName).toBeUndefined();
    expect(rows[0].coordinatorEmail).toBeUndefined();
  });

  it('a issue aponta a LINHA da planilha (linha 3 = segundo registro)', () => {
    const grid = buildTabular();
    grid[2][5] = 'sem-arroba'; // e-mail do GC do segundo registro
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toHaveLength(2);
    expect(issues).toEqual([
      { column: 3, field: 'managerEmail', message: 'E-mail do GC inválido: sem-arroba' },
    ]);
  });

  it('coluna com rótulo desconhecido é erro GLOBAL também no formato tabular (E9)', () => {
    const grid = buildTabular();
    grid[0] = [...TABULAR_HEADER, 'Faturamento anual'];
    grid.slice(1).forEach((row) => row.push('1000'));
    const { rows, issues } = parsePartnersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => /Rótulo desconhecido na coluna 7.*Faturamento anual/.test(i.message))).toBe(true);
  });

  it('planilha sem nenhum rótulo conhecido é recusada com mensagem clara', () => {
    const { rows, issues } = parsePartnersSheet([['a', 'b'], ['1', '2']]);
    expect(rows).toEqual([]);
    expect(issues[0].message).toMatch(/não está no formato esperado/);
  });
});

/**
 * Coluna CNPJ (migration 0014/0015). CNPJs SINTÉTICOS: nenhum documento real.
 */
describe('parseTransposed — coluna CNPJ', () => {
  function cnpjFixture(base12: string): string {
    const dv = (digits: string, pesos: number[]) => {
      let soma = 0;
      for (let i = 0; i < pesos.length; i += 1) soma += Number(digits[i]) * pesos[i];
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = dv(`${base12}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return `${base12}${d1}${d2}`;
  }
  const CNPJ = cnpjFixture('770000010001');
  const FORMATADO = `${CNPJ.slice(0, 2)}.${CNPJ.slice(2, 5)}.${CNPJ.slice(5, 8)}/${CNPJ.slice(8, 12)}-${CNPJ.slice(12)}`;

  const HEADER = ['Unidade', 'Coordenação', 'Empresa Parceira', 'CNPJ', 'Escritório', 'Cidade', 'Estado', 'E-mail do GC'];
  const LINHA = ['UN 1', 'COORD 1', 'Empresa Sintetica', CNPJ, 'ESC 1', 'Curitiba', 'PR', 'gc@sint.example'];
  const grade = (linhas: string[][]) => [[...HEADER], ...linhas.map((l) => [...l])];

  it('aceita CNPJ somente com dígitos', () => {
    const { rows, issues } = parsePartnersSheet(grade([LINHA]));
    expect(issues).toEqual([]);
    expect(rows[0].cnpj).toBe(CNPJ);
  });

  it('aceita CNPJ formatado e normaliza para 14 dígitos', () => {
    const linha = [...LINHA];
    linha[3] = FORMATADO;
    const { rows, issues } = parsePartnersSheet(grade([linha]));
    expect(issues).toEqual([]);
    expect(rows[0].cnpj).toBe(CNPJ);
    expect(rows[0].cnpj).toHaveLength(14);
  });

  it('recusa dígitos verificadores inválidos sem ecoar o valor', () => {
    const ruim = '12345678000100';
    const linha = [...LINHA];
    linha[3] = ruim;
    const { rows, issues } = parsePartnersSheet(grade([linha]));
    expect(rows).toHaveLength(0);
    expect(issues[0].field).toBe('cnpj');
    expect(issues[0].message).toBe('CNPJ inválido');
    expect(JSON.stringify(issues)).not.toContain(ruim);
  });

  it('recusa sequência repetida', () => {
    const linha = [...LINHA];
    linha[3] = '11111111111111';
    const { rows, issues } = parsePartnersSheet(grade([linha]));
    expect(rows).toHaveLength(0);
    expect(issues[0].field).toBe('cnpj');
  });

  it('célula de CNPJ vazia NÃO bloqueia a linha — quem decide é o servidor', () => {
    const linha = [...LINHA];
    linha[3] = '';
    const { rows, issues } = parsePartnersSheet(grade([linha]));
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].cnpj).toBeUndefined();
  });

  it('planilha ANTIGA sem a coluna CNPJ continua parseável', () => {
    const semCnpj = HEADER.filter((h) => h !== 'CNPJ');
    const linhaSem = LINHA.filter((_, i) => i !== 3);
    const { rows, issues } = parsePartnersSheet([semCnpj, linhaSem]);
    expect(issues).toEqual([]);
    expect(rows[0].cnpj).toBeUndefined();
    expect(rows[0].officeName).toBe('ESC 1');
  });
});
