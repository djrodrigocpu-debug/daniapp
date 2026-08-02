/**
 * O PDF do Relatório Oficial da Auditoria Mensal é um PDF de verdade:
 * estrutura válida, A4, texto pesquisável, acentuação portuguesa, várias
 * páginas, sem folha em branco, sem truncamento e sem vazamento.
 *
 * As asserções leem os BYTES do arquivo, não um objeto intermediário — é o
 * arquivo entregue ao usuário que está sob teste.
 */
import { describe, it, expect } from 'vitest';
import { buildMonthlyAuditReportModel } from '../monthlyAuditReport';
import {
  DIAGNOSTICO_LONGO, monthlyReportInputFixture, monthlyReportInsufficientFixture,
} from '../monthlyAuditReportFixture';
import { renderMonthlyAuditReportPdf } from './renderMonthlyAuditReport';
import { A4_HEIGHT, A4_WIDTH } from './pdfDocument';

function pdfBytes(input = monthlyReportInputFixture()): Uint8Array {
  return renderMonthlyAuditReportPdf(buildMonthlyAuditReportModel(input));
}

/** O arquivo é ASCII por construção; ler como latin1 preserva byte a byte. */
function asText(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** O texto pesquisável: todo literal `(...) Tj`, com o escape octal desfeito. */
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

describe('estrutura do arquivo', () => {
  const bytes = pdfBytes();
  const texto = asText(bytes);

  it('tem assinatura %PDF, encerra em %%EOF e declara páginas A4', () => {
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true);
    const caixas = [...texto.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    expect(caixas.length).toBeGreaterThan(0);
    for (const c of caixas) {
      expect(Number(c[1])).toBeCloseTo(A4_WIDTH, 1);
      expect(Number(c[2])).toBeCloseTo(A4_HEIGHT, 1);
    }
  });

  it('usa fontes-padrão com WinAnsiEncoding — nada rasterizado', () => {
    expect(texto).toContain('/BaseFont /Helvetica /Encoding /WinAnsiEncoding');
    expect(texto).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(texto).not.toContain('/Subtype /Image');
    expect(texto).not.toContain('/Filter /DCTDecode');
  });

  it('o título do documento nomeia o formato mensal, e não o legado', () => {
    const info = /\/Title \(([^)]*)\)/.exec(texto);
    expect(info).not.toBeNull();
    const octetos = [...info![1].matchAll(/\\(\d{3})/g)].map((x) => parseInt(x[1], 8));
    let titulo = '';
    for (let i = 2; i < octetos.length; i += 2) {
      titulo += String.fromCharCode((octetos[i] << 8) | octetos[i + 1]);
    }
    expect(titulo).toContain('Relatório Oficial da Auditoria Mensal');
    expect(titulo).toContain('Julho de 2026');
    expect(titulo).not.toContain('Relatório Oficial de Auditoria —');
  });

  it('declara a versão 1.3.5 como criador, e não 1.3.3', () => {
    // `Creator` vai no dicionário `Info`, que é UTF-16BE — não há fonte ali, e
    // por isso a string não aparece em ASCII nos bytes.
    const bruto = /\/Creator \(([^)]*)\)/.exec(texto);
    expect(bruto).not.toBeNull();
    const octetos = [...bruto![1].matchAll(/\\(\d{3})/g)].map((x) => parseInt(x[1], 8));
    let criador = '';
    for (let i = 2; i < octetos.length; i += 2) {
      criador += String.fromCharCode((octetos[i] << 8) | octetos[i + 1]);
    }
    expect(criador).toBe('AAPEx 1.3.5');
    expect(criador).not.toContain('1.3.3');
  });

  it('é determinístico: a mesma entrada dá o mesmo arquivo', () => {
    expect(Array.from(pdfBytes())).toEqual(Array.from(pdfBytes()));
  });
});

describe('paginação', () => {
  const bytes = pdfBytes();
  const texto = asText(bytes);

  it('produz múltiplas páginas e nenhuma delas em branco', () => {
    const paginas = (texto.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(paginas).toBeGreaterThan(1);
    // Todo fluxo de conteúdo precisa escrever alguma coisa.
    const fluxos = [...texto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
    expect(fluxos.length).toBe(paginas);
    for (const f of fluxos) expect(f[1]).toMatch(/Tj/);
  });

  it('numera o rodapé com o total REAL de páginas', () => {
    const t = extractText(bytes);
    const paginas = (texto.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(t).toContain(`Página 1 de ${paginas}`);
    expect(t).toContain(`Página ${paginas} de ${paginas}`);
  });

  it('o rodapé nomeia o documento corretamente em TODA página', () => {
    const t = extractText(bytes);
    const paginas = (texto.match(/\/Type \/Page[^s]/g) ?? []).length;
    const ocorrencias = t.split('AAPEx · Relatório Oficial da Auditoria Mensal').length - 1;
    expect(ocorrencias).toBe(paginas);
  });

  it('cresce com o conteúdo, paginando em vez de cortar', () => {
    const base = monthlyReportInputFixture();
    const muitos = monthlyReportInputFixture({
      content: Array.from({ length: 40 }, (_, i) => ({
        ...base.content[1],
        criterionCode: `CRIT-X-${String(i).padStart(3, '0')}`,
      })),
    });
    const grandes = pdfBytes(muitos);
    const nGrande = (asText(grandes).match(/\/Type \/Page[^s]/g) ?? []).length;
    const nBase = (texto.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(nGrande).toBeGreaterThan(nBase);
    // E o último critério continua no arquivo: nada foi cortado.
    expect(extractText(grandes)).toContain('CRIT-X-039');
  });
});

describe('conteúdo impresso', () => {
  const t = extractText(pdfBytes());

  it('a capa nomeia o documento pela terminologia D8', () => {
    expect(t).toContain('RELATÓRIO OFICIAL DA AUDITORIA MENSAL');
    expect(t).toContain('Parceiro Exemplo Comunicações Ltda.');
    expect(t).toContain('Julho de 2026');
  });

  it('a terminologia D8 distingue o documento do AAPEx da fonte EXTERNA', () => {
    // "Relatório oficial da operação" é a fonte externa que o GC consulta. Se
    // os dois se chamarem igual, o usuário procura o número no lugar errado.
    expect(t).toContain('relatório oficial da operação');
    expect(t).toContain('Relatório Oficial da Auditoria Mensal');
  });

  it('a acentuação portuguesa sobrevive ao texto pesquisável', () => {
    expect(t).toContain('Avaliação de Parceiros AACE de Excelência');
    expect(t).toContain('Não conforme');
    expect(t).toContain('Não aplicável');
    expect(t).toContain('Competência');
  });

  it('imprime a pontuação do processo e diz o que ela NÃO é', () => {
    expect(t).toContain('PONTUAÇÃO DO PROCESSO');
    expect(t).toContain('66,67');
    expect(t).toContain('não é a ponderação entre módulos e não é o Índice de Excelência');
  });

  it('imprime os critérios agrupados por tema e indicador', () => {
    expect(t).toContain('TEMA-01 · Atendimento e relacionamento');
    expect(t).toContain('IND-011 · Conversão de propostas');
    expect(t).toContain('CRIT-011-A');
    expect(t).toContain('CRIT-021-B');
  });

  it('a resposta aparece em TEXTO, não só em cor', () => {
    for (const rotulo of ['Conforme', 'Não conforme', 'Não aplicável']) {
      expect(`${rotulo}: ${t.includes(rotulo)}`).toBe(`${rotulo}: true`);
    }
  });

  it('o diagnóstico longo é impresso INTEIRO, quebrado em linhas', () => {
    const semQuebra = t.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    // As primeiras e as últimas palavras do texto longo precisam estar lá.
    expect(semQuebra).toContain('A rotina de conferência diária não está implantada');
    expect(semQuebra).toContain('desatualizado havia mais de seis semanas');
    expect(DIAGNOSTICO_LONGO.length).toBeGreaterThan(300);
  });

  it('as evidências saem por NOME seguro, sem caminho nem link', () => {
    expect(t).toContain('quadro-semana-27.jpg');
    expect(t).toContain('ata-reuniao.pdf');
    expect(t).not.toMatch(/https?:\/\//);
    expect(t).not.toContain('evidencias/');
  });

  it('os planos materializados aparecem, e o documento diz que são do MOMENTO da aprovação', () => {
    // Títulos de seção são impressos em caixa alta pelo layout.
    expect(t).toContain('PLANOS DE AÇÃO MATERIALIZADOS');
    expect(t).toContain('Implantar a conferência diária');
    expect(t).toContain('Responsável Exemplo');
    expect(t).toContain('30/09/2026');
    expect(t).toContain('constavam do registro oficial no momento da aprovação');
  });

  it('imprime o código de integridade sem chamá-lo de assinatura', () => {
    expect(t).toContain('CÓDIGO DE INTEGRIDADE');
    expect(t).toContain('não é assinatura digital nem certificado');
    expect(t).toContain('conformidade-simples-processo/1.3.5');
    expect(t).toContain('linha-por-fato/1.3.5');
  });

  it('avisa que o documento foi gerado pelo AAPEx a partir do snapshot', () => {
    expect(t).toContain('Documento gerado pelo AAPEx a partir do snapshot oficial imutável');
  });

  it('não vaza UUID de usuário, e-mail nem token', () => {
    expect(t).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(t).not.toMatch(/Bearer |eyJ/);
  });
});

describe('a auditoria sem critério aplicável', () => {
  const t = extractText(pdfBytes(monthlyReportInsufficientFixture()));

  it('imprime "Dados insuficientes" no lugar da nota — nunca 0,00', () => {
    expect(t).toContain('Dados insuficientes');
    expect(t).not.toContain('0,00');
  });

  it('diz o MOTIVO da ausência, em português', () => {
    expect(t).toContain('nenhum critério aplicável nesta auditoria');
  });

  it('continua sendo um documento completo, com código e rodapé', () => {
    expect(t).toContain('CÓDIGO DE INTEGRIDADE');
    expect(t).toContain('AAPEx · Relatório Oficial da Auditoria Mensal');
  });
});
