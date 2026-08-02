/**
 * Escritor de CSV — UTF-8, cabeçalhos estáveis, e **CSV injection neutralizada**
 * (D9; risco RT-07).
 *
 * ---------------------------------------------------------------------------
 * O ATAQUE, E POR QUE PRECISA DE DUAS DEFESAS DIFERENTES
 * ---------------------------------------------------------------------------
 * Um texto gravado como `=HYPERLINK("http://…";"clique")` é dado inofensivo no
 * banco e vira **fórmula executável** quando o arquivo é aberto numa planilha.
 * O usuário que exporta não é o atacante: é a vítima.
 *
 * Duas defesas, e elas resolvem coisas distintas — confundi-las é o erro comum:
 *
 *   1. **ASPAS** resolvem o CSV: um campo com `;`, `"` ou quebra de linha
 *      quebraria a estrutura do arquivo. É formatação, e não protege de nada;
 *   2. **NEUTRALIZAÇÃO** resolve a fórmula: o valor deixa de começar por `=`,
 *      `+`, `-` ou `@`. É segurança, e as aspas **não** a fazem — um campo
 *      `"=1+1"` continua sendo interpretado como fórmula pelo Excel.
 *
 * A neutralização usada é o prefixo apóstrofo, recomendação da OWASP. Ela muda o
 * VALOR, não a aparência: é por isso que não é "sanitização meramente visual".
 *
 * ---------------------------------------------------------------------------
 * O QUE **NÃO** É NEUTRALIZADO, E POR QUÊ
 * ---------------------------------------------------------------------------
 * Somente colunas `type: 'text'`. Número, data e booleano passam intactos —
 * neutralizar `-12,5` produziria `'-12,5`, que deixa de ser número. É a razão de
 * o dataset trazer o tipo de cada coluna desde o servidor.
 */
import { ExportColumn, ExportDataset, ExportRow, ExportValue } from './dataset';

/**
 * `;` — convenção pt-BR, que é o público deste aplicativo. Com `,` o Excel em
 * português joga a linha inteira numa célula só.
 */
export const CSV_DELIMITER = ';';

/**
 * BOM de UTF-8. Sem ele o Excel no Windows abre `Não conformidade` como
 * `NÃ£o conformidade`. É UTF-8 com assinatura, não outra codificação.
 */
export const UTF8_BOM = '﻿';

const PERIGOSOS = ['=', '+', '-', '@'];

/**
 * O caractere perigoso pode estar atrás de espaço, tabulação, quebra de linha
 * ou caractere de controle — e a planilha ignora esse lixo antes de decidir se
 * a célula é fórmula. Por isso a inspeção pula o vazio à esquerda em vez de
 * olhar só o índice zero.
 */
export function isFormulaInjection(value: string): boolean {
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c <= '') { i += 1; continue; }
    break;
  }
  return i < value.length && PERIGOSOS.includes(value[i]);
}

/** Neutraliza o valor TEXTUAL. Não decide sozinha: quem chama já sabe o tipo. */
export function neutralizeFormula(value: string): string {
  return isFormulaInjection(value) ? `'${value}` : value;
}

/** Aspas, dobrando as internas. Formatação — não confundir com a defesa acima. */
export function quoteCsvField(value: string, delimiter = CSV_DELIMITER): string {
  const precisa = value.includes(delimiter) || value.includes('"')
    || value.includes('\n') || value.includes('\r');
  return precisa ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Um valor tipado vira o texto da célula. `null` vira campo VAZIO — nunca
 * `"null"`, nunca `0`: ausência de dado não é zero, e o CSV precisa dizer isso
 * do mesmo jeito que a tela diz.
 */
export function formatCsvValue(value: ExportValue, column: ExportColumn, delimiter = CSV_DELIMITER): string {
  if (value === null || value === undefined) return '';

  if (column.type === 'boolean') return value ? 'sim' : 'nao';

  if (column.type === 'number') {
    // Número nunca é neutralizado, e nunca é envolvido em aspas: é o que
    // preserva o negativo real. `.` como separador decimal, que é o formato
    // documentado deste contrato.
    return String(value);
  }

  if (column.type === 'date') {
    // AAAA-MM-DD — o formato documentado. Sem conversão de fuso: a data já vem
    // do servidor como dia de calendário.
    return quoteCsvField(String(value), delimiter);
  }

  return quoteCsvField(neutralizeFormula(String(value)), delimiter);
}

export interface CsvOptions {
  delimiter?: string;
  /** Incluir o BOM de UTF-8. Padrão: sim. */
  bom?: boolean;
}

/**
 * O CSV do dataset. A ordem das colunas e das linhas é a que o servidor
 * devolveu — o escritor não reordena, porque o determinismo foi decidido lá.
 */
export function toCsv(dataset: ExportDataset, options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? CSV_DELIMITER;
  const bom = options.bom ?? true;

  const linhas: string[] = [];
  linhas.push(dataset.columns.map((c) => quoteCsvField(c.label, delimiter)).join(delimiter));

  for (const row of dataset.rows) {
    linhas.push(dataset.columns
      .map((c) => formatCsvValue(row[c.key] ?? null, c, delimiter))
      .join(delimiter));
  }

  // `\r\n` é o que RFC 4180 pede, e é o que o Excel espera no Windows.
  return (bom ? UTF8_BOM : '') + linhas.join('\r\n') + '\r\n';
}

/**
 * O recorte que o arquivo representa, em texto — para que o CSV **diga de si
 * mesmo** de que conjunto fala, como o XLSX diz na aba `Filtros_Aplicados`.
 */
export function filtersAsRows(dataset: ExportDataset): Array<[string, string]> {
  const f = dataset.filters as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) && v.length ? v.join(', ') : '(sem filtro)');
  return [
    ['Contrato', dataset.contractVersion],
    ['Modulo', dataset.module],
    ['Gerado em', dataset.generatedAt],
    ['Solicitado por', dataset.requestedBy],
    ['Escopo efetivo (parceiros)', String(dataset.scope.operationCount)],
    ['Periodo - de', String(f.periodFrom ?? '(sem filtro)')],
    ['Periodo - ate', String(f.periodTo ?? '(sem filtro)')],
    ['Parceiros', lista(f.operationIds)],
    ['Gerentes de Canal', lista(f.channelManagerIds)],
    ['Coordenadorias', lista(f.coordinationIds)],
    ['Temas', lista(f.themeIds)],
    ['Indicadores', lista(f.indicatorIds)],
    ['Modulos', lista(f.modules)],
    ['Status', lista(f.statuses)],
    ['Regra do eixo de desempenho', String(dataset.ruleProvenance.performanceScoreRule ?? '')],
    ['Regra do eixo de processo', String(dataset.ruleProvenance.monthlyScoreRule ?? '')],
    ['Regra dos quadrantes', String(dataset.ruleProvenance.quadrantRule ?? '')],
    ['Decisoes empresariais abertas',
      Array.isArray(dataset.ruleProvenance.openDecisions)
        ? (dataset.ruleProvenance.openDecisions as string[]).join(', ') : ''],
  ];
}

/** Nome de arquivo estável e sem caractere que o sistema de arquivos recuse. */
export function exportFileName(dataset: ExportDataset, extension: 'csv' | 'xlsx'): string {
  const dia = String(dataset.generatedAt).slice(0, 10).replace(/-/g, '');
  return `aapex-${dataset.module}-${dia}.${extension}`;
}

/** Bytes do CSV, prontos para entrega. */
export function csvBytes(dataset: ExportDataset, options: CsvOptions = {}): Uint8Array {
  return new TextEncoder().encode(toCsv(dataset, options));
}
