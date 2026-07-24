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

function buildXlsx(sheetXml: string, sharedXml?: string): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(WORKBOOK),
    'xl/_rels/workbook.xml.rels': strToU8(RELS),
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
