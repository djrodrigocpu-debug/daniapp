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

describe('parseUsersSheet — formato tabular do canal', () => {
  it('lê os registros e normaliza nome, e-mail e perfil', () => {
    const { rows, issues, layout } = parseUsersSheet(tabular());
    expect(issues).toEqual([]);
    expect(layout).toBe('tabular');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      index: 1, name: 'Ana Sintetica', email: 'ana.sintetica@sint.example', role: 'regional', region: 'RPS',
    });
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
