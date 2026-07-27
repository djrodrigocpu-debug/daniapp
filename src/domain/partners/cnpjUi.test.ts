/**
 * Provas ESTÁTICAS da interface de CNPJ dos Parceiros AACE.
 *
 * O projeto não tem runner de componente (o Vitest inclui só `*.test.ts` e não
 * há testing-library), então a lógica arriscada foi extraída para módulos puros
 * — cobertos em `cnpjForm.test.ts` e `cnpj.test.ts` — e aqui verificamos que as
 * TELAS realmente consomem esses módulos, em vez de reimplementar a regra.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const TELAS = join(RAIZ, 'src', 'screens', 'admin');

function semComentarios(fonte: string): string {
  return fonte
    // Remove CR ANTES de tudo: em arquivo CRLF o `.*$` do strip de comentario
    // de linha para antes do CR, e o comentario sobreviveria inteiro — a prova
    // de ausencia passaria a ler o que a propria documentacao menciona.
    .replace(new RegExp(String.fromCharCode(13), 'g'), '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const partners = semComentarios(readFileSync(join(TELAS, 'PartnersSection.tsx'), 'utf8'));
const importFlow = semComentarios(readFileSync(join(TELAS, 'PartnerImportFlow.tsx'), 'utf8'));

describe('formulário de parceiro', () => {
  it('usa a máscara e a decisão de patch do domínio, sem reimplementar', () => {
    expect(partners).toContain("from '../../domain/partners/cnpj'");
    expect(partners).toContain("from '../../domain/partners/cnpjForm'");
    expect(partners).toContain('formatCnpjInput');
    expect(partners).toContain('resolveCnpjField');
    expect(partners).toContain('applyCnpjToPayload');
    // Nenhum algoritmo de dígito verificador copiado para a tela.
    expect(partners).not.toMatch(/\[5,\s*4,\s*3,\s*2,\s*9/);
  });

  it('NUNCA monta o PAYLOAD com cnpj literal vazio ou nulo', () => {
    // O estado inicial do campo (`EMPTY_FORM.cnpj = ''`) é legítimo — é o input
    // vazio. O que não pode existir é `cnpj` literal no objeto enviado ao
    // repositório: lá o valor vem exclusivamente de `applyCnpjToPayload`.
    const submit = partners.slice(
      partners.indexOf('async function submit()'),
      partners.indexOf('async function toggleActive'),
    );
    expect(submit).toContain('applyCnpjToPayload');
    expect(submit).not.toMatch(/cnpj:\s*''/);
    expect(submit).not.toMatch(/cnpj:\s*null/);
    expect(submit).not.toMatch(/cnpj:\s*undefined/);
    expect(submit).not.toMatch(/cnpj:\s*form\./);
  });

  it('bloqueia o envio quando a decisão recusa o campo', () => {
    expect(partners).toMatch(/if\s*\(!cnpj\.ok\)/);
    expect(partners).toContain('setCnpjError');
  });

  it('carrega o CNPJ gravado ao entrar em edição', () => {
    expect(partners).toContain('setEditingCnpj(partner.cnpj)');
    expect(partners).toContain('current: editingId ? editingCnpj : null');
    expect(partners).toContain('creating: !editingId');
  });

  it('tem rótulo, erro acessível e teclado numérico', () => {
    expect(partners).toContain('accessibilityLabel="CNPJ do parceiro"');
    expect(partners).toContain('accessibilityRole="alert"');
    expect(partners).toContain('keyboardType="number-pad"');
    expect(partners).toContain('00.000.000/0000-00');
  });

  it('preserva o que foi digitado quando o servidor recusa', () => {
    // O formulário só é limpo por `cancelEdit`, e ele não é chamado no ramo de
    // erro: o operador corrige o conflito devolvido pela RPC sem redigitar.
    const submit = partners.slice(partners.indexOf('async function submit()'));
    const ramoErro = submit.slice(submit.indexOf('if (!res.ok)'), submit.indexOf('cancelEdit();'));
    expect(ramoErro).not.toContain('setForm(');
    expect(ramoErro).not.toContain('cancelEdit()');
  });
});

describe('listagem e preview', () => {
  it('a listagem exibe o CNPJ pelo helper, nunca o valor cru', () => {
    expect(partners).toContain('displayCnpj(partner.cnpj)');
    expect(partners).not.toMatch(/\{partner\.cnpj\}/);
  });

  it('o preview e o relatório da importação exibem o CNPJ pelo helper', () => {
    expect(importFlow).toContain('displayCnpj(row.cnpj)');
    expect(importFlow).not.toMatch(/\{row\.cnpj\}/);
  });
});

describe('fronteira: nenhuma tela de parceiro toca autenticação', () => {
  it('não chama createUser, convite nem SMTP', () => {
    for (const fonte of [partners, importFlow]) {
      for (const proibido of ['createUser', 'inviteUserByEmail', 'smtp', 'signInWithPassword', 'auth.admin']) {
        expect(fonte.toLowerCase()).not.toContain(proibido.toLowerCase());
      }
    }
  });

  it('não referencia identidade, perfil nem escopo', () => {
    for (const fonte of [partners, importFlow]) {
      for (const proibido of ['auth.users', 'user_scopes', 'authUserId']) {
        expect(fonte).not.toContain(proibido);
      }
    }
  });
});
