/**
 * Parser da planilha de Usuários — dados 100% SINTÉTICOS espelhando a topologia
 * da planilha real do canal (perfis por extenso, e-mails com maiúsculas, área
 * de atuação nomeando a coordenação). Nenhum dado real (§23).
 */
import { describe, it, expect } from 'vitest';
import { parseUsersSheet, parseUserRole } from './parseUsersSheet';
import { MAX_USER_IMPORT_ROWS } from './types';

const HEADER = ['Nome', 'email', 'Area de Atuação', 'Perfil'];

const BASE_ROWS = [
  ['Ana Sintetica', 'Ana.Sintetica@sint.example', 'RPS', 'Gerencia Regional'],
  ['Bruno Sintetico', 'bruno.sintetico@sint.example', 'RPS', 'Administrador'],
  ['Carla Sintetica', 'carla.sintetica@sint.example', 'COORD NORTE', 'Coordenação'],
  ['Diego Sintetico', 'diego.sintetico@sint.example', 'COORD NORTE', 'Gerente de Canal'],
];

/** Cópia profunda: os testes mutam a grade, e HEADER/BASE_ROWS são compartilhados. */
const tabular = (rows = BASE_ROWS) => [[...HEADER], ...rows.map((r) => [...r])];

/**
 * Topologia REAL da planilha definitiva: nove colunas, com o perfil DUAS vezes
 * (texto humano + código canônico) e duas colunas de controle. Valores 100%
 * sintéticos — só a forma é copiada.
 */
const HEADER_DEFINITIVA = [
  'Nome', 'E-mail', 'Área de Atuação', 'Perfil Original', 'Perfil Sistema',
  'Senha Temporária', 'Ativo', 'Troca Obrigatória', 'Linha Fonte',
];

const ROWS_DEFINITIVA = [
  ['Ana Sintetica',   'Ana.Sintetica@sint.example',   'RPS',         'Gerência Regional', 'regional',        'SenhaSint123', 'Sim', 'Sim', '2'],
  ['Bruno Sintetico', 'bruno.sintetico@sint.example', 'RPS',         'Administrador',     'admin',           'SenhaSint456', 'Sim', 'Sim', '3'],
  ['Carla Sintetica', 'carla.sintetica@sint.example', 'COORD NORTE', 'Coordenação',       'coordinator',     'SenhaSint789', 'Sim', 'Sim', '4'],
  ['Diego Sintetico', 'diego.sintetico@sint.example', 'COORD NORTE', 'Gerente de Canal',  'channel_manager', 'SenhaSint321', 'Sim', 'Sim', '5'],
];

describe('parseUsersSheet — planilha definitiva do canal (nove colunas)', () => {
  const grade = () => [[...HEADER_DEFINITIVA], ...ROWS_DEFINITIVA.map((r) => [...r])];

  it('lê as 4 linhas sem recusar as colunas de controle', () => {
    const { rows, issues } = parseUsersSheet(grade());
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(4);
  });

  it('usa "Perfil Sistema" (código canônico), não "Perfil Original"', () => {
    const { rows } = parseUsersSheet(grade());
    expect(rows.map((r) => r.role)).toEqual(['regional', 'admin', 'coordinator', 'channel_manager']);
  });

  it('"Perfil Original" divergente NÃO altera o papel — quem manda é a coluna Sistema', () => {
    const g = grade();
    g[1][3] = 'Administrador';  // texto humano contradiz o código
    g[1][4] = 'channel_manager';
    const { rows, issues } = parseUsersSheet(g);
    expect(issues).toEqual([]);
    expect(rows[0].role).toBe('channel_manager');
  });

  it('lê senha temporária e ativo das colunas da planilha definitiva', () => {
    const { rows } = parseUsersSheet(grade());
    expect(rows[0].initialPassword).toBe('SenhaSint123');
    expect(rows.every((r) => r.active === true)).toBe(true);
  });

  it('uma coluna realmente desconhecida continua sendo recusada', () => {
    const g = grade();
    g[0][8] = 'Coluna Que Ninguem Conhece';
    const { rows, issues } = parseUsersSheet(g);
    expect(rows).toHaveLength(0);
    expect(issues.some((i) => /Rótulo desconhecido/.test(i.message))).toBe(true);
  });

  it('aceita a mesma planilha definitiva transposta', () => {
    const g = HEADER_DEFINITIVA.map((label, i) => [label, ...ROWS_DEFINITIVA.map((r) => r[i] ?? '')]);
    const { rows, issues, layout } = parseUsersSheet(g);
    expect(issues).toEqual([]);
    expect(layout).toBe('transposed');
    expect(rows.map((r) => r.role)).toEqual(['regional', 'admin', 'coordinator', 'channel_manager']);
  });
});

describe('parseUserRole — códigos canônicos além do texto humano', () => {
  it('traduz os quatro códigos da coluna Perfil Sistema', () => {
    expect(parseUserRole('admin')).toBe('admin');
    expect(parseUserRole('regional')).toBe('regional');
    expect(parseUserRole('coordinator')).toBe('coordinator');
    expect(parseUserRole('channel_manager')).toBe('channel_manager');
  });

  it('mantém o texto humano das planilhas antigas', () => {
    expect(parseUserRole('Administrador')).toBe('admin');
    expect(parseUserRole('Gerência Regional')).toBe('regional');
    expect(parseUserRole('Coordenação')).toBe('coordinator');
    expect(parseUserRole('Gerente de Canal')).toBe('channel_manager');
  });

  it('continua recusando perfil desconhecido em vez de assumir default', () => {
    expect(parseUserRole('Diretor')).toBeNull();
    expect(parseUserRole('')).toBeNull();
  });
});

describe('parseUsersSheet — formato tabular do canal', () => {
  it('lê os registros e normaliza nome, e-mail e perfil', () => {
    const { rows, issues, layout } = parseUsersSheet(tabular());
    expect(issues).toEqual([]);
    expect(layout).toBe('tabular');
    expect(rows).toHaveLength(4);
    // Planilha antiga (sem as colunas Senha inicial/Ativo) continua válida:
    // `active` assume true e `initialPassword` fica ausente.
    expect(rows[0]).toEqual({
      index: 1, name: 'Ana Sintetica', email: 'ana.sintetica@sint.example', role: 'regional', region: 'RPS',
      active: true,
    });
    expect(rows[0].initialPassword).toBeUndefined();
    expect(rows.map((r) => r.role)).toEqual(['regional', 'admin', 'coordinator', 'channel_manager']);
  });

  it('aceita a mesma planilha transposta', () => {
    const grid = HEADER.map((label, i) => [label, ...BASE_ROWS.map((r) => r[i])]);
    const { rows, issues, layout } = parseUsersSheet(grid);
    expect(issues).toEqual([]);
    expect(layout).toBe('transposed');
    expect(rows).toHaveLength(4);
    expect(rows[3].role).toBe('channel_manager');
  });

  it('perfil não reconhecido é erro da linha — nunca vira papel default', () => {
    const grid = tabular();
    grid[1][3] = 'Estagiário';
    const { rows, issues } = parseUsersSheet(grid);
    expect(rows).toHaveLength(3);
    expect(issues).toEqual([
      { column: 2, field: 'role', message: expect.stringContaining('Perfil não reconhecido: "Estagiário"') },
    ]);
  });

  it('e-mail inválido e campo obrigatório vazio apontam a linha da planilha', () => {
    const grid = tabular();
    grid[2][1] = 'sem-arroba';
    grid[3][0] = '   ';
    const { rows, issues } = parseUsersSheet(grid);
    expect(rows).toHaveLength(2);
    expect(issues).toEqual([
      { column: 3, field: 'email', message: 'E-mail inválido: sem-arroba' },
      { column: 4, field: 'name', message: 'Campo obrigatório ausente: Nome' },
    ]);
  });

  it('e-mail repetido na planilha vira erro na segunda ocorrência', () => {
    const grid = tabular([...BASE_ROWS, ['Duplicada', 'ANA.sintetica@sint.example', 'RPS', 'Coordenação']]);
    const { rows, issues } = parseUsersSheet(grid);
    expect(rows).toHaveLength(4);
    expect(issues[0].message).toMatch(/E-mail repetido na planilha.*já usado no registro 1/);
  });

  it('rótulo obrigatório ausente é erro GLOBAL sem linhas (E9)', () => {
    const grid = tabular().map((row) => [row[0], row[1], row[2]]); // sem a coluna Perfil
    const { rows, issues } = parseUsersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => i.column === null && /Rótulo obrigatório ausente.*Perfil/.test(i.message))).toBe(true);
  });

  it('coluna desconhecida é erro GLOBAL (E9)', () => {
    const grid = tabular();
    grid[0].push('Salário');
    grid.slice(1).forEach((row) => row.push('1000'));
    const { rows, issues } = parseUsersSheet(grid);
    expect(rows).toEqual([]);
    expect(issues.some((i) => /Rótulo desconhecido.*Salário/.test(i.message))).toBe(true);
  });

  it('planilha fora do formato é recusada com mensagem clara', () => {
    const { rows, issues } = parseUsersSheet([['a', 'b'], ['1', '2']]);
    expect(rows).toEqual([]);
    expect(issues[0].message).toMatch(/Usuários não está no formato esperado/);
  });

  it(`mais de ${MAX_USER_IMPORT_ROWS} registros é erro GLOBAL`, () => {
    const many = Array.from({ length: MAX_USER_IMPORT_ROWS + 1 }, (_, i) => [
      `Pessoa ${i}`, `p${i}@sint.example`, 'RPS', 'Gerente de Canal',
    ]);
    const { rows, issues } = parseUsersSheet(tabular(many));
    expect(rows).toEqual([]);
    expect(issues.some((i) => new RegExp(`limite por importação é ${MAX_USER_IMPORT_ROWS}`).test(i.message))).toBe(true);
  });
});

describe('parseUserRole', () => {
  it('traduz os perfis escritos como o canal escreve', () => {
    expect(parseUserRole('Administrador')).toBe('admin');
    expect(parseUserRole('Gerencia Regional')).toBe('regional');
    expect(parseUserRole('Gerência Regional')).toBe('regional');
    expect(parseUserRole('Coordenação')).toBe('coordinator');
    expect(parseUserRole('Gerente de Canal')).toBe('channel_manager');
    expect(parseUserRole('GC')).toBe('channel_manager');
  });

  it('devolve null para perfil desconhecido ou vazio', () => {
    expect(parseUserRole('Diretor')).toBeNull();
    expect(parseUserRole('   ')).toBeNull();
  });
});

/**
 * Formato novo do provisionamento por senha:
 *   Nome | email | Senha inicial | Perfil | Area de Atuação | Ativo
 */
describe('parseUsersSheet — planilha com senha inicial e ativo', () => {
  const HEADER_NOVO = ['Nome', 'email', 'Senha inicial', 'Perfil', 'Area de Atuação', 'Ativo'];
  const LINHA_OK = ['Ana Sintetica', 'Ana.Sintetica@sint.example', 'Aacex2026Prov', 'Gerencia Regional', 'RPS', 'Sim'];
  const novo = (linhas = [LINHA_OK]) => [[...HEADER_NOVO], ...linhas.map((l) => [...l])];

  it('lê as seis colunas e devolve a senha inicial na linha', () => {
    const { rows, issues } = parseUsersSheet(novo());
    expect(issues).toEqual([]);
    expect(rows[0]).toEqual({
      index: 1,
      name: 'Ana Sintetica',
      email: 'ana.sintetica@sint.example',
      role: 'regional',
      region: 'RPS',
      initialPassword: 'Aacex2026Prov',
      active: true,
    });
  });

  it('interpreta os rótulos de Ativo', () => {
    const linhas = [
      [...LINHA_OK.slice(0, 5), 'Sim'],
      ['B Sintetico', 'b@sint.example', 'Aacex2026Prov', 'Administrador', 'RPS', 'Não'],
      ['C Sintetico', 'c@sint.example', 'Aacex2026Prov', 'Administrador', 'RPS', ''],
    ];
    const { rows, issues } = parseUsersSheet(novo(linhas));
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.active)).toEqual([true, false, true]);
  });

  it('rótulo desconhecido em Ativo é erro da linha', () => {
    const { rows, issues } = parseUsersSheet(novo([[...LINHA_OK.slice(0, 5), 'talvez']]));
    expect(rows).toHaveLength(0);
    expect(issues[0].field).toBe('active');
  });

  it('senha inicial fraca é erro da linha, e a senha NÃO aparece na mensagem', () => {
    const fracas = ['curta1', '1234567890', 'SomenteLetras', 'ana.sintetica@sint.example'];
    for (const senha of fracas) {
      const linha = [...LINHA_OK];
      linha[2] = senha;
      const { rows, issues } = parseUsersSheet(novo([linha]));
      expect(rows).toHaveLength(0);
      expect(issues[0].field).toBe('initialPassword');
      expect(issues[0].message).not.toContain(senha);
    }
  });

  it('senha inicial em branco é aceita no parse — quem exige é o servidor', () => {
    const linha = [...LINHA_OK];
    linha[2] = '';
    const { rows, issues } = parseUsersSheet(novo([linha]));
    expect(issues).toEqual([]);
    expect(rows[0].initialPassword).toBeUndefined();
  });

  it('a senha inicial nunca é ecoada em nenhuma issue do lote', () => {
    const linhas = [
      [...LINHA_OK],
      ['B Sintetico', 'email-invalido', 'Aacex2026Prov', 'Administrador', 'RPS', 'Sim'],
    ];
    const { issues } = parseUsersSheet(novo(linhas));
    expect(issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(issues)).not.toContain('Aacex2026Prov');
  });
});
