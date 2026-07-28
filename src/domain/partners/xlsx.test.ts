/**
 * Leitor OOXML estrito — testes com .xlsx SINTÉTICO montado em memória
 * (fflate zipSync). Nenhum binário commitado, nenhum dado real (§23).
 */
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseWorkbookGrid, XlsxParseError } from './xlsx';

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Plan1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

function buildXlsx(
  sheetXml: string,
  sharedXml?: string,
  overrides?: { workbook?: string; rels?: string },
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(overrides?.workbook ?? WORKBOOK),
    'xl/_rels/workbook.xml.rels': strToU8(overrides?.rels ?? RELS),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
  };
  if (sharedXml) files['xl/sharedStrings.xml'] = strToU8(sharedXml);
  return zipSync(files);
}

describe('parseWorkbookGrid', () => {
  it('lê shared strings (com acentos e rich runs), inlineStr e números', () => {
    const shared = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Organização:</t></si>
  <si><t>ALIANÇA &amp; CIA</t></si>
  <si><r><t>PS - </t></r><r><t>ALIANÇA SINTÉTICA</t></r></si>
</sst>`;
    const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="D1" t="s"/>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Cidade:</t></is></c>
      <c r="B2"><v>42</v></c>
      <c r="C2" t="s"><v>2</v></c>
    </row>
  </sheetData>
</worksheet>`;
    const grid = parseWorkbookGrid(buildXlsx(sheet, shared));
    expect(grid[0][0]).toBe('Organização:');
    expect(grid[0][1]).toBe('ALIANÇA & CIA'); // entidade XML decodificada
    expect(grid[0][2]).toBe(''); // lacuna vira string vazia
    expect(grid[0][3]).toBe(''); // célula self-closing sem valor
    expect(grid[1][0]).toBe('Cidade:');
    expect(grid[1][1]).toBe('42');
    expect(grid[1][2]).toBe('PS - ALIANÇA SINTÉTICA'); // rich runs concatenados
  });

  it('lê workbook com TODO elemento sob namespace prefixado (ex.: <x:c>, <x:v>)', () => {
    // Algumas ferramentas exportam OOXML válido prefixando cada elemento com um
    // namespace explícito em vez do padrão sem prefixo — a carga real de 2026-07
    // veio assim e o leitor via zero abas: `<sheet>` nunca casava `<x:sheet>`.
    const workbook = `<?xml version="1.0" encoding="utf-8"?>
<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <x:sheets><x:sheet name="Plan1" sheetId="1" r:id="R1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets>
</x:workbook>`;
    const rels = `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="R1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" />
</Relationships>`;
    // t="str" com valor literal em <x:v> (não é shared string nem inlineStr) —
    // exatamente como a ferramenta que gerou a carga real grava texto simples.
    const sheet = `<?xml version="1.0" encoding="utf-8"?>
<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <x:sheetData>
    <x:row r="1">
      <x:c r="A1" s="20" t="str"><x:v>Nome Ficticio</x:v></x:c>
      <x:c r="B1" s="20" t="str"><x:v>email.ficticio@sint.example</x:v></x:c>
      <x:c r="C1" s="26" />
    </x:row>
  </x:sheetData>
</x:worksheet>`;
    const grid = parseWorkbookGrid(buildXlsx(sheet, undefined, { workbook, rels }));
    expect(grid[0][0]).toBe('Nome Ficticio');
    expect(grid[0][1]).toBe('email.ficticio@sint.example');
    expect(grid[0][2]).toBe(''); // célula self-closing sob namespace, sem valor
  });

  it('rejeita bytes que não são um zip/.xlsx', () => {
    expect(() => parseWorkbookGrid(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(XlsxParseError);
    expect(() => parseWorkbookGrid(new Uint8Array())).toThrow(/Arquivo vazio/);
  });

  it('rejeita zip sem workbook (não é planilha)', () => {
    const zip = zipSync({ 'qualquer.txt': strToU8('não sou uma planilha') });
    expect(() => parseWorkbookGrid(zip)).toThrow(/workbook ausente/);
  });

  it('rejeita workbook sem abas', () => {
    const files = {
      'xl/workbook.xml': strToU8('<workbook><sheets></sheets></workbook>'),
    };
    expect(() => parseWorkbookGrid(zipSync(files))).toThrow(/nenhuma aba/);
  });

  it('rejeita primeira aba vazia', () => {
    const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`;
    expect(() => parseWorkbookGrid(buildXlsx(sheet))).toThrow(/vazia/);
  });
});

/**
 * Seleção de aba por nome.
 *
 * A planilha definitiva da carga tem quatro abas com a de instruções PRIMEIRO.
 * Lendo cegamente a primeira, o importador carregava a LEIA-ME e concluía que o
 * arquivo não tinha rótulo conhecido algum — dados corretos, mas inalcançáveis.
 */
describe('parseWorkbookGrid — escolha da aba pelo nome', () => {
  const WB_MULTI = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="LEIA-ME" sheetId="1" r:id="rId1"/>
    <sheet name="Usuarios_Importacao" sheetId="2" r:id="rId2"/>
    <sheet name="Parceiros_Importacao" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;

  const RELS_MULTI = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="w" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="w" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="w" Target="worksheets/sheet3.xml"/>
</Relationships>`;

  const aba = (texto: string) => `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${texto}</t></is></c></row></sheetData>
</worksheet>`;

  const multi = (): Uint8Array => zipSync({
    'xl/workbook.xml': strToU8(WB_MULTI),
    'xl/_rels/workbook.xml.rels': strToU8(RELS_MULTI),
    'xl/worksheets/sheet1.xml': strToU8(aba('INSTRUCOES')),
    'xl/worksheets/sheet2.xml': strToU8(aba('USUARIOS')),
    'xl/worksheets/sheet3.xml': strToU8(aba('PARCEIROS')),
  });

  it('sem nome, lê a primeira aba — comportamento histórico preservado', () => {
    expect(parseWorkbookGrid(multi())[0][0]).toBe('INSTRUCOES');
  });

  it('com nome, pula a aba de instruções e lê a de dados', () => {
    expect(parseWorkbookGrid(multi(), 'Usuarios_Importacao')[0][0]).toBe('USUARIOS');
    expect(parseWorkbookGrid(multi(), 'Parceiros_Importacao')[0][0]).toBe('PARCEIROS');
  });

  it('a comparação ignora caixa, acento e separador', () => {
    expect(parseWorkbookGrid(multi(), 'usuários importação')[0][0]).toBe('USUARIOS');
    expect(parseWorkbookGrid(multi(), 'USUARIOS-IMPORTACAO')[0][0]).toBe('USUARIOS');
  });

  it('nome inexistente cai na primeira aba em vez de falhar', () => {
    expect(parseWorkbookGrid(multi(), 'Aba_Que_Nao_Existe')[0][0]).toBe('INSTRUCOES');
  });

  it('workbook de aba única segue funcionando com nome pedido', () => {
    const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>UNICA</t></is></c></row></sheetData>
    </worksheet>`;
    expect(parseWorkbookGrid(buildXlsx(sheet), 'Usuarios_Importacao')[0][0]).toBe('UNICA');
  });
});
