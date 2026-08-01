/**
 * O PDF é um PDF de verdade: estrutura válida, texto pesquisável, A4,
 * acentuação portuguesa, várias páginas, sem folha em branco e sem vazamento.
 *
 * As asserções leem os BYTES do arquivo, não um objeto intermediário — é o
 * arquivo entregue ao usuário que está sob teste.
 */
import { describe, it, expect } from 'vitest';
import { buildOfficialAuditReportModel } from '../officialAuditReport';
import { reportInputFixture, JUSTIFICATIVA_LONGA } from '../officialAuditReportFixture';
import { renderOfficialAuditReportPdf } from './renderOfficialAuditReport';
import { A4_HEIGHT, A4_WIDTH, wrapText } from './pdfDocument';
import { measureText, toWinAnsi } from './winAnsi';

const AGORA = '2026-09-02T10:15:30.000Z';

function pdfBytes(input = reportInputFixture()): Uint8Array {
  const r = buildOfficialAuditReportModel(input, AGORA);
  if (!r.ok) throw r.error;
  return renderOfficialAuditReportPdf(r.value);
}

/** O arquivo é ASCII por construção; ler como latin1 preserva byte a byte. */
function asText(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/**
 * Extrai o texto pesquisável: todo literal `(...) Tj` do fluxo de conteúdo,
 * desfazendo o escape octal — é exatamente o que um leitor de PDF faz para
 * indexar e para o Ctrl+F.
 */
function extractText(bytes: Uint8Array): string {
  const raw = asText(bytes);
  const pedacos: string[] = [];
  const re = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    pedacos.push(m[1]
      .replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\([()\\])/g, '$1'));
  }
  return pedacos.join('\n');
}

describe('estrutura do arquivo PDF', () => {
  const bytes = pdfBytes();
  const texto = asText(bytes);

  it('tem assinatura %PDF, encerra em %%EOF e declara páginas A4', () => {
    expect(texto.startsWith('%PDF-1.4')).toBe(true);
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(4000);
    expect(texto).toContain(`/MediaBox [0 0 ${A4_WIDTH.toFixed(2)} ${A4_HEIGHT.toFixed(2)}]`);
  });

  it('tem xref válida: cada deslocamento aponta para o início do objeto', () => {
    expect(texto).toContain('/Root 1 0 R');
    const startxref = /startxref\s+(\d+)/.exec(texto);
    expect(startxref).not.toBeNull();
    const offset = Number(startxref![1]);
    expect(texto.slice(offset, offset + 4)).toBe('xref');

    const linhas = texto.slice(offset).split('\n');
    const total = Number(/0 (\d+)/.exec(linhas[1])![1]);
    for (let id = 1; id < total; id += 1) {
      const off = Number(linhas[1 + id + 1].slice(0, 10));
      expect(texto.slice(off, off + String(id).length + 6)).toBe(`${id} 0 obj`);
    }
  });

  it('declara o /Length correto de cada fluxo de conteúdo', () => {
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m: RegExpExecArray | null;
    let fluxos = 0;
    while ((m = re.exec(texto)) !== null) {
      const inicio = m.index + m[0].length;
      expect(texto.slice(inicio + Number(m[1]), inicio + Number(m[1]) + 10)).toBe('\nendstream');
      fluxos += 1;
    }
    expect(fluxos).toBeGreaterThanOrEqual(3);
  });

  it('usa fontes-padrão com WinAnsiEncoding — texto real, nada rasterizado', () => {
    expect(texto).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
    expect(texto).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(texto).not.toContain('/Subtype /Image');
    expect(texto).not.toContain('/Filter /DCTDecode');
  });

  it('escreve o título do documento em UTF-16BE, não em WinAnsi', () => {
    // Dentro do fluxo de conteúdo os bytes são lidos pela codificação da FONTE;
    // no dicionário Info não há fonte, e WinAnsi ali fazia o travessão aparecer
    // como "Š" na aba do visualizador e nas propriedades do arquivo.
    const info = /\/Title \(([^)]*)\)/.exec(texto);
    expect(info).not.toBeNull();
    expect(info![1].startsWith('\\376\\377')).toBe(true);

    const octetos = [...info![1].matchAll(/\\(\d{3})/g)].map((m) => parseInt(m[1], 8));
    let titulo = '';
    for (let i = 2; i < octetos.length; i += 2) {
      titulo += String.fromCharCode((octetos[i] << 8) | octetos[i + 1]);
    }
    expect(titulo).toBe(
      'Relatório Oficial de Auditoria — Parceiro Exemplo Comunicações Ltda. — Julho de 2026');
  });

  it('é determinístico: a mesma entrada e o mesmo instante dão o mesmo arquivo', () => {
    expect(Array.from(pdfBytes())).toEqual(Array.from(pdfBytes()));
  });
});

describe('paginação do relatório', () => {
  const bytes = pdfBytes();
  const texto = asText(bytes);
  const conteudo = extractText(bytes);

  it('produz múltiplas páginas e nenhuma delas em branco', () => {
    const contagem = Number(/\/Type \/Pages \/Count (\d+)/.exec(texto)![1]);
    expect(contagem).toBeGreaterThanOrEqual(3);
    expect((texto.match(/\/Type \/Page(?!s)/g) ?? []).length).toBe(contagem);

    // Toda página tem conteúdo: o rodapé sozinho já garante três `Tj`, então
    // qualquer fluxo com menos que isso seria uma folha vazia.
    const fluxos = [...texto.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
    expect(fluxos).toHaveLength(contagem);
    for (const [, , corpo] of fluxos) {
      expect((corpo.match(/Tj/g) ?? []).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('numera o rodapé com o total real de páginas', () => {
    const contagem = Number(/\/Type \/Pages \/Count (\d+)/.exec(texto)![1]);
    for (let p = 1; p <= contagem; p += 1) {
      expect(conteudo).toContain(`Página ${p} de ${contagem}`);
    }
    expect(conteudo).not.toContain(`Página ${contagem + 1} de`);
    expect(conteudo).toContain('AAPEx · Relatório Oficial de Auditoria');
  });

  it('cresce com o conteúdo, paginando em vez de cortar', () => {
    const muitos = reportInputFixture();
    muitos.official.answers = Array.from({ length: 60 }, (_, i) => ({
      code: `Z${String(i).padStart(2, '0')}`,
      pillar: 'Pilar de carga',
      title: `Item de carga número ${i}`,
      weight: 3,
      status: 'green',
      measuredValue: '100% da meta',
      observation: JUSTIFICATIVA_LONGA,
      notApplicableReason: '',
      evidenceCount: 0,
    }));
    const grande = pdfBytes(muitos);
    expect(Number(/\/Type \/Pages \/Count (\d+)/.exec(asText(grande))![1])).toBeGreaterThan(10);
    expect(extractText(grande)).toContain('Item de carga número 59');
  });
});

describe('conteúdo impresso', () => {
  const conteudo = extractText(pdfBytes());
  const texto = asText(pdfBytes());

  it('imprime a capa com parceiro, nota, classificação, competência e situação oficial', () => {
    expect(conteudo).toContain('RELATÓRIO OFICIAL DE AUDITORIA');
    expect(conteudo).toContain('Parceiro Exemplo Comunicações Ltda.');
    expect(conteudo).toContain('82.5');
    expect(conteudo).toContain('Alta performance');
    expect(conteudo).toContain('Validada oficialmente');
    expect(conteudo).toContain('Julho de 2026');
  });

  it('preserva a acentuação portuguesa no texto pesquisável', () => {
    for (const trecho of ['Comunicações', 'Validação oficial', 'NÃO CONFORMES', 'Situação lida',
      'ANÁLISE DO GERENTE DE CANAL', 'COMPROVAÇÕES', 'Região Sul', 'Coordenação']) {
      expect(conteudo).toContain(trecho);
    }
    // O travessão é WinAnsi 0x97 e sai escapado em octal — nunca como '?'.
    expect(texto).toContain('\\227');
  });

  it('imprime o checklist inteiro, na ordem do catálogo, sem truncar o texto longo', () => {
    const codigos = ['T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T11',
      'T14', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22', 'T24'];
    let anterior = -1;
    for (const code of codigos) {
      const pos = conteudo.indexOf(`\n${code}\n`);
      expect(pos, `item ${code} ausente do PDF`).toBeGreaterThan(-1);
      expect(pos, `item ${code} fora de ordem`).toBeGreaterThan(anterior);
      anterior = pos;
    }

    expect(conteudo).toContain('JUSTIFICATIVA DO NÃO APLICÁVEL');
    expect(conteudo).toContain('O tema não se aplica a esta operação');
    expect(conteudo).toContain('de portes diferentes.');
    expect(conteudo).not.toContain('…');
  });

  it('imprime as comprovações por nome seguro, sem caminho, link nem anotação', () => {
    expect(conteudo).toContain('Relatorio_producao_julho.pdf');
    expect(conteudo).toContain('Dashboard_churn.pdf');
    expect(conteudo).toContain('1.5 MB');
    expect(texto).not.toContain('/URI');
    expect(texto).not.toContain('/Annots');
  });

  it('separa o plano de ação como situação atual e datada', () => {
    expect(conteudo).toContain('SITUAÇÃO DO PLANO DE AÇÃO NA DATA DE GERAÇÃO');
    expect(conteudo).toContain('Esta seção NÃO faz parte do snapshot oficial imutável.');
    expect(conteudo).toContain('Situação lida em 02/09/2026 10:15 UTC.');
    expect(conteudo).toContain('EM ATRASO');

    const semPlano = extractText(pdfBytes(reportInputFixture({ plans: [] })));
    expect(semPlano).toContain('Nenhum plano de ação registrado na data de geração.');
    expect(semPlano).not.toContain('EM ATRASO');
  });

  it('imprime o código de integridade sem chamá-lo de assinatura', () => {
    expect(conteudo).toContain('CÓDIGO DE INTEGRIDADE');
    expect(conteudo).toContain('Documento gerado a partir do snapshot oficial imutável da auditoria.');
    expect(conteudo).toContain('1.3.3');
    expect(conteudo).toContain('não é assinatura digital nem certificado');
  });

  it('não vaza e-mail, caminho de Storage, URL, token nem UUID integral', () => {
    expect(conteudo).not.toContain('@');
    expect(conteudo).not.toMatch(/https?:\/\//);
    expect(conteudo).not.toContain('evidencias/');
    expect(conteudo).not.toMatch(/\btoken\b/i);
    expect(conteudo).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});

describe('quebra de linha e métricas de fonte', () => {
  it('nunca ultrapassa a largura útil, partindo até a palavra que não cabe', () => {
    const largura = A4_WIDTH - 96;
    for (const linha of wrapText(JUSTIFICATIVA_LONGA, 'regular', 9.5, largura)) {
      expect(measureText(linha, 'regular', 9.5)).toBeLessThanOrEqual(largura);
    }

    const gigante = 'A'.repeat(400);
    const partido = wrapText(gigante, 'regular', 9.5, 200);
    expect(partido.length).toBeGreaterThan(1);
    expect(partido.join('')).toBe(gigante);   // nada se perdeu
    for (const linha of partido) expect(measureText(linha, 'regular', 9.5)).toBeLessThanOrEqual(200);

    expect(wrapText('um\n\ndois', 'regular', 10, 500)).toEqual(['um', '', 'dois']);
    expect(wrapText('   ', 'regular', 10, 500)).toEqual([]);
  });

  it('mapeia a acentuação portuguesa para WinAnsi e só substitui o que não existe lá', () => {
    const acentos = toWinAnsi('áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ');
    expect(acentos).not.toContain(0x3f);
    expect(acentos).toHaveLength(26);
    expect(toWinAnsi('—')).toEqual([0x97]);
    expect(toWinAnsi('…')).toEqual([0x85]);
    expect(toWinAnsi('·')).toEqual([0xb7]);
    expect(toWinAnsi('日')).toEqual([0x3f]);
  });
});
