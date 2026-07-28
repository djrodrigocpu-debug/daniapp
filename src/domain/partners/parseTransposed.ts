/**
 * Parser da planilha de Parceiros AACE (AAPEx v2).
 *
 * Aceita as DUAS orientações que o canal usa de fato:
 *   - TRANSPOSTA: coluna A com os rótulos, um Parceiro AACE por coluna;
 *   - TABULAR:    linha 1 com os rótulos, um Parceiro AACE por linha.
 * A orientação é detectada pela quantidade de rótulos reconhecidos na coluna A
 * contra a linha 1 — empate favorece a transposta (formato histórico).
 *
 * Rótulos casam por prefixo de `labelKey` (tolera acento, caixa, hífen,
 * dois-pontos e texto de ajuda como "Estado: PR ou SC"). Rótulo duplicado ou
 * desconhecido continua sendo erro GLOBAL sem nenhuma linha interpretada
 * (emenda E9) — o que mudou é QUAIS rótulos são obrigatórios.
 *
 * Campos que a planilha do canal não traz são derivados, nunca inventados em
 * silêncio: Estado sai da coordenação (PR CAPITAL/PR INTERIOR ⇒ PR, SANTA
 * CATARINA ⇒ SC) e vira `warnings` visível na simulação; Organização, Região e
 * e-mail do Coordenador ficam ausentes aqui e são resolvidos no repositório.
 */
import {
  ImportRow,
  ParseResult,
  RowIssue,
  MAX_FIELD_LENGTH,
  MAX_IMPORT_ROWS,
} from './types';
import { collapseSpaces, isValidEmail, labelKey, normalizeEmail, normalizeState } from './normalize';
import { normalizeCnpj, validateCnpj } from './cnpj';
import { SheetFieldSpec, readSheet } from '../sheets/reader';

type Field = keyof Omit<ImportRow, 'index'>;

interface FieldSpec extends SheetFieldSpec<Field> {
  kind: 'text' | 'email' | 'state' | 'cnpj';
}

const FIELDS: FieldSpec[] = [
  { field: 'organizationName', prefixes: ['organizacao'], label: 'Organização', kind: 'text', required: false },
  { field: 'regionName', prefixes: ['regiao'], label: 'Região', kind: 'text', required: false },
  { field: 'unitName', prefixes: ['unidade'], label: 'Unidade', kind: 'text', required: true },
  { field: 'coordinationName', prefixes: ['coordenacao'], label: 'Coordenação', kind: 'text', required: true },
  {
    field: 'partnerName',
    prefixes: ['nome do parceiro', 'empresa parceira', 'razao social'],
    label: 'Empresa parceira',
    kind: 'text',
    required: true,
  },
  {
    field: 'cnpj',
    // Aliases deliberadamente restritos: nada que possa significar CPF, para
    // que documento de PESSOA jamais entre no cadastro da EMPRESA.
    prefixes: ['cnpj do parceiro', 'cnpj da empresa', 'cnpj', 'documento da empresa', 'documento'],
    label: 'CNPJ',
    kind: 'cnpj',
    required: false,
  },
  {
    field: 'officeName',
    prefixes: ['nome do escritorio', 'escritorio'],
    label: 'Nome do escritório',
    kind: 'text',
    required: true,
  },
  { field: 'city', prefixes: ['cidade'], label: 'Cidade', kind: 'text', required: true },
  { field: 'state', prefixes: ['estado', 'uf'], label: 'Estado', kind: 'state', required: false },
  {
    field: 'coordinatorEmail',
    prefixes: ['email do coordenador', 'email da coordenacao', 'email coordenador'],
    label: 'E-mail do Coordenador',
    kind: 'email',
    required: false,
  },
  {
    field: 'managerEmail',
    prefixes: ['email do gc', 'email gc', 'email gerentes de canais', 'email gerente de canal', 'email do gerente'],
    label: 'E-mail do GC',
    kind: 'email',
    required: true,
  },
  // Origem do parceiro (0016). O servidor normaliza o DDD e recusa o que não
  // tiver dois dígitos; aqui só transportamos o texto da planilha.
  {
    field: 'sourceCode',
    prefixes: ['codigo fonte', 'codigo de origem', 'codigo do parceiro'],
    label: 'Código Fonte',
    kind: 'text',
    required: false,
  },
  { field: 'ddd', prefixes: ['ddd'], label: 'DDD', kind: 'text', required: false },
];

/**
 * Colunas conhecidas que NÃO são lidas.
 *
 * "Ativo" não existe no contrato de importação: `import_partners_core` grava
 * `active = true` na inserção e a desativação é ato administrativo posterior.
 * "E-mail Gerente Regional" é contato adicional — o vínculo do parceiro é com
 * Coordenador e GC, e um prefixo mais curto aqui engoliria "E-mail Gerente de
 * Canal", que é obrigatório. "Linha Fonte" é controle da própria planilha.
 */
const IGNORED_LABEL_PREFIXES = ['ativo', 'email gerente regional', 'linha fonte'];

/** Campos textuais que precisam de valor em cada registro. */
const TEXT_REQUIRED: Field[] = ['unitName', 'coordinationName', 'partnerName', 'officeName', 'city'];

/**
 * Deduz a UF pelo nome da coordenação de vendas — a coordenação do canal já
 * carrega o estado ("PR CAPITAL", "PR INTERIOR", "SANTA CATARINA"). Retorna
 * null quando não dá para afirmar; nesse caso o registro exige coluna Estado.
 */
export function deriveStateFromCoordination(coordination: string): 'PR' | 'SC' | null {
  const key = labelKey(coordination);
  if (key === '') return null;
  if (key === 'pr' || key.startsWith('pr ') || key.startsWith('parana')) return 'PR';
  if (key === 'sc' || key.startsWith('sc ') || key.includes('santa catarina')) return 'SC';
  return null;
}

export function parsePartnersSheet(grid: string[][]): ParseResult {
  const { layout, reader, issues: readIssues } = readSheet(grid, FIELDS, {
    maxRecords: MAX_IMPORT_ROWS,
    unknownLabelHint: 'A planilha de Parceiros AACE não está no formato esperado:',
    ignoredPrefixes: IGNORED_LABEL_PREFIXES,
  });
  if (reader === null) return { rows: [], issues: readIssues, warnings: [], layout };

  const issues: RowIssue[] = [];
  const warnings: RowIssue[] = [];

  // Valida e monta cada registro; registro com problema vira issue (fora de rows).
  const rows: ImportRow[] = [];
  reader.records.forEach((record, position) => {
    const recordIssues: RowIssue[] = [];
    const at = reader.sheetRef(record);
    const draft: Partial<ImportRow> = { index: position + 1 };

    for (const spec of FIELDS) {
      const present = reader.has(spec.field);
      const value = reader.value(spec.field, record);

      if (spec.kind === 'email') {
        const email = normalizeEmail(value);
        if (email === '') {
          // Só o GC é obrigatório na planilha; o coordenador é resolvido depois
          // pela coordenação, no repositório.
          if (spec.required) {
            recordIssues.push({ column: at, field: spec.field, message: `Campo obrigatório ausente: ${spec.label}` });
          }
        } else if (!isValidEmail(email)) {
          recordIssues.push({ column: at, field: spec.field, message: `${spec.label} inválido: ${email}` });
        } else {
          (draft as Record<string, unknown>)[spec.field] = email;
        }
        continue;
      }

      if (spec.kind === 'cnpj') {
        const bruto = collapseSpaces(value);
        if (bruto === '') continue;  // ausente: o servidor decide se é erro
        const check = validateCnpj(bruto);
        if (!check.ok) {
          // A mensagem não ecoa o valor completo — célula colada pode conter
          // qualquer coisa, inclusive documento de pessoa.
          recordIssues.push({ column: at, field: spec.field, message: 'CNPJ inválido' });
        } else {
          draft.cnpj = normalizeCnpj(bruto);
        }
        continue;
      }

      if (spec.kind === 'state') {
        const state = normalizeState(value);
        if (state === '' && !present) continue; // sem coluna Estado: deduz no passo 4
        if (state !== 'PR' && state !== 'SC') {
          recordIssues.push({
            column: at,
            field: spec.field,
            message: `Estado inválido: ${state === '' ? '(vazio)' : state} (esperado PR ou SC)`,
          });
        } else {
          draft.state = state;
        }
        continue;
      }

      const text = collapseSpaces(value);
      if (text === '') {
        if (TEXT_REQUIRED.includes(spec.field)) {
          recordIssues.push({ column: at, field: spec.field, message: `Campo obrigatório ausente: ${spec.label}` });
        }
      } else if (text.length > MAX_FIELD_LENGTH) {
        recordIssues.push({
          column: at,
          field: spec.field,
          message: `${spec.label} excede o limite de ${MAX_FIELD_LENGTH} caracteres`,
        });
      } else {
        (draft as Record<string, unknown>)[spec.field] = text;
      }
    }

    // 4) Estado ausente na planilha: deduz pela coordenação e registra o aviso.
    if (draft.state === undefined && recordIssues.length === 0) {
      const derived = deriveStateFromCoordination(draft.coordinationName ?? '');
      if (derived === null) {
        recordIssues.push({
          column: at,
          field: 'state',
          message:
            `Estado ausente e não foi possível deduzir da coordenação "${draft.coordinationName ?? ''}" — `
            + 'inclua uma coluna Estado com PR ou SC',
        });
      } else {
        draft.state = derived;
        warnings.push({
          column: at,
          field: 'state',
          message: `Estado ${derived} deduzido da coordenação "${draft.coordinationName}"`,
        });
      }
    }

    if (recordIssues.length > 0) issues.push(...recordIssues);
    else rows.push(draft as ImportRow);
  });

  return { rows, issues, warnings, layout };
}
