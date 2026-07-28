/**
 * Parser da planilha de Usuários AACE.
 *
 * Formato real do canal (tabular): Nome | email | Área de Atuação | Perfil.
 * A orientação transposta também é aceita — a leitura é a mesma do importador
 * de Parceiros AACE (src/domain/sheets/reader.ts), incluindo a recusa estrita
 * de planilha com rótulo desconhecido (E9).
 *
 * O "Perfil" é traduzido para UserRole por lista fechada: perfil não
 * reconhecido vira erro da linha, nunca um papel default — atribuir papel
 * errado é falha de autorização, não de digitação. A lista aceita tanto o texto
 * humano das planilhas antigas ("Gerência Regional", "Coordenação", "Gerente de
 * Canal", "Administrador") quanto os códigos canônicos da coluna "Perfil
 * Sistema" da planilha definitiva (`admin`, `regional`, `coordinator`,
 * `channel_manager`) — é essa coluna que vale quando as duas existem.
 */
import { UserRole } from '../../types';
import { collapseSpaces, isValidEmail, labelKey, normalizeEmail } from '../partners/normalize';
import { MAX_FIELD_LENGTH } from '../partners/types';
import { SheetFieldSpec, readSheet } from '../sheets/reader';
import { checkInitialPassword } from './initialPassword';
import { MAX_USER_IMPORT_ROWS, UserImportRow, UserIssue, UserParseResult } from './types';

type Field = keyof Omit<UserImportRow, 'index'>;

const FIELDS: SheetFieldSpec<Field>[] = [
  { field: 'name', prefixes: ['nome'], label: 'Nome', required: true },
  { field: 'email', prefixes: ['email', 'e mail'], label: 'E-mail', required: true },
  {
    field: 'region',
    prefixes: ['area de atuacao', 'area', 'regiao', 'coordenacao', 'unidade'],
    label: 'Área de atuação',
    required: true,
  },
  { field: 'role', prefixes: ['perfil', 'papel', 'cargo', 'funcao'], label: 'Perfil', required: true },
  // Opcionais: planilhas antigas (sem senha/ativo) continuam sendo lidas.
  {
    field: 'initialPassword',
    prefixes: ['senha inicial', 'senha'],
    label: 'Senha inicial',
    required: false,
  },
  { field: 'active', prefixes: ['ativo', 'situacao', 'status'], label: 'Ativo', required: false },
];

/** Rótulos aceitos para "ativo". Qualquer outro texto é erro da linha. */
const TRUE_LABELS = ['sim', 's', 'true', 'ativo', '1', 'x'];
const FALSE_LABELS = ['nao', 'n', 'false', 'inativo', '0'];

/**
 * Colunas conhecidas que NÃO são lidas.
 *
 * A planilha definitiva do canal traz o perfil DUAS vezes: "Perfil Original"
 * (texto humano) e "Perfil Sistema" (código canônico). É a Sistema que vale —
 * ler a Original obrigaria a traduzir texto livre de novo, com risco de
 * atribuir papel errado. Como ambas começam por "perfil", sem esta lista as
 * duas disputariam o mesmo campo e a planilha seria recusada por rótulo
 * duplicado. "Troca Obrigatória" e "Linha Fonte" são marcações de controle da
 * própria planilha: conhecidas e irrelevantes para a importação.
 */
const IGNORED_LABEL_PREFIXES = ['perfil original', 'troca obrigatoria', 'linha fonte'];

/** Rótulos de perfil aceitos, do mais específico para o mais genérico. */
const ROLE_PREFIXES: Array<{ prefix: string; role: UserRole }> = [
  // Códigos canônicos da coluna "Perfil Sistema". `labelKey` remove o
  // underscore sem criar separador, então 'channel_manager' vira
  // 'channelmanager'.
  { prefix: 'channelmanager', role: 'channel_manager' },
  { prefix: 'coordinator', role: 'coordinator' },
  { prefix: 'administrador', role: 'admin' },
  { prefix: 'admin', role: 'admin' },
  { prefix: 'gerencia regional', role: 'regional' },
  { prefix: 'gerente regional', role: 'regional' },
  { prefix: 'regional', role: 'regional' },
  { prefix: 'coordenacao', role: 'coordinator' },
  { prefix: 'coordenador', role: 'coordinator' },
  { prefix: 'gerente de canal', role: 'channel_manager' },
  { prefix: 'gerente de canais', role: 'channel_manager' },
  { prefix: 'gc', role: 'channel_manager' },
];

/** Traduz o perfil escrito na planilha. null ⇒ perfil não reconhecido. */
export function parseUserRole(value: string): UserRole | null {
  const key = labelKey(value);
  if (key === '') return null;
  return ROLE_PREFIXES.find((entry) => key.startsWith(entry.prefix))?.role ?? null;
}

/** Perfis aceitos, para compor a mensagem de erro. */
const ACCEPTED_ROLES = 'Administrador, Gerência Regional, Coordenação, Gerente de Canal';

export function parseUsersSheet(grid: string[][]): UserParseResult {
  const { layout, reader, issues: readIssues } = readSheet(grid, FIELDS, {
    maxRecords: MAX_USER_IMPORT_ROWS,
    unknownLabelHint: 'A planilha de Usuários não está no formato esperado:',
    ignoredPrefixes: IGNORED_LABEL_PREFIXES,
  });
  if (reader === null) return { rows: [], issues: readIssues, layout };

  const issues: UserIssue[] = [];
  const rows: UserImportRow[] = [];
  const seen = new Map<string, number>();

  reader.records.forEach((record, position) => {
    const at = reader.sheetRef(record);
    const recordIssues: UserIssue[] = [];

    const name = collapseSpaces(reader.value('name', record));
    if (name === '') {
      recordIssues.push({ column: at, field: 'name', message: 'Campo obrigatório ausente: Nome' });
    } else if (name.length > MAX_FIELD_LENGTH) {
      recordIssues.push({ column: at, field: 'name', message: `Nome excede o limite de ${MAX_FIELD_LENGTH} caracteres` });
    }

    const email = normalizeEmail(reader.value('email', record));
    if (email === '') {
      recordIssues.push({ column: at, field: 'email', message: 'Campo obrigatório ausente: E-mail' });
    } else if (!isValidEmail(email)) {
      recordIssues.push({ column: at, field: 'email', message: `E-mail inválido: ${email}` });
    } else if (seen.has(email)) {
      recordIssues.push({
        column: at,
        field: 'email',
        message: `E-mail repetido na planilha: ${email} (já usado no registro ${seen.get(email)})`,
      });
    }

    const region = collapseSpaces(reader.value('region', record));
    if (region === '') {
      recordIssues.push({ column: at, field: 'region', message: 'Campo obrigatório ausente: Área de atuação' });
    }

    const rawRole = collapseSpaces(reader.value('role', record));
    const role = parseUserRole(rawRole);
    if (rawRole === '') {
      recordIssues.push({ column: at, field: 'role', message: 'Campo obrigatório ausente: Perfil' });
    } else if (role === null) {
      recordIssues.push({
        column: at,
        field: 'role',
        message: `Perfil não reconhecido: "${rawRole}" (aceitos: ${ACCEPTED_ROLES})`,
      });
    }

    // Senha inicial: opcional na planilha (só é exigida para identidade nova, o
    // que o servidor decide). Quando vem preenchida, o formato é validado aqui
    // para o operador corrigir antes de simular. O VALOR nunca entra em issue.
    const rawPassword = reader.value('initialPassword', record);
    const initialPassword = typeof rawPassword === 'string' ? rawPassword.trim() : '';
    if (initialPassword !== '') {
      const check = checkInitialPassword(initialPassword, email);
      if (!check.ok) {
        recordIssues.push({ column: at, field: 'initialPassword', message: check.message as string });
      }
    }

    const rawActive = labelKey(reader.value('active', record));
    let active = true;
    if (rawActive !== '') {
      if (TRUE_LABELS.includes(rawActive)) active = true;
      else if (FALSE_LABELS.includes(rawActive)) active = false;
      else {
        recordIssues.push({
          column: at,
          field: 'active',
          message: `Valor não reconhecido em Ativo: "${collapseSpaces(reader.value('active', record))}" (aceitos: Sim, Não)`,
        });
      }
    }

    if (recordIssues.length > 0) {
      issues.push(...recordIssues);
      return;
    }
    seen.set(email, position + 1);
    rows.push({
      index: position + 1,
      name,
      email,
      role: role as UserRole,
      region,
      ...(initialPassword !== '' ? { initialPassword } : {}),
      active,
    });
  });

  return { rows, issues, layout };
}
