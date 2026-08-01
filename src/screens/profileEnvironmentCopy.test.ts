/**
 * PROVA — aviso de ambiente e persistência do Perfil (1.3.4).
 *
 * O DEFEITO. A tela anunciava, em texto fixo, "Escopo da versão 1.2" e "Os dados
 * permanecem no aparelho nesta versão". No build corporativo isso é falso desde a
 * 1.3.0: o dado operacional vive no ambiente corporativo, não no aparelho. A frase
 * envelheceu porque estava presa a um número de versão.
 *
 * O que estes testes travam é a NÃO RECORRÊNCIA: o aviso passa a ser derivado do
 * modo real (`domain/version/appVersion`), a tela não escreve versão à mão, e
 * nenhum dos três textos possíveis vaza infraestrutura para o usuário final.
 *
 * A conferência visual em 375 px e o console limpo são feitos na homologação
 * contra o ambiente de homologação; aqui prova-se o que é estático.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DataMode,
  dataModeLabelFor,
  dataModeNoticeFor,
  resolveDataMode,
} from '../domain/version/appVersion';

const tela = readFileSync(join(__dirname, '..', '..', 'src/screens/ProfileScreen.tsx'), 'utf8');

const TODOS_OS_MODOS: DataMode[] = ['corporate', 'local-demo', 'unconfigured'];

/** Tudo que o usuário final pode ler nos três modos. */
const textosApresentaveis = TODOS_OS_MODOS.flatMap((mode) => {
  const { title, body } = dataModeNoticeFor(mode);
  return [title, body, dataModeLabelFor(mode)];
});

describe('texto legado removido', () => {
  it('1 — "Escopo da versão 1.2" não existe mais na tela', () => {
    expect(tela).not.toContain('Escopo da versão 1.2');
  });

  it('2 — nenhum modo afirma que os dados permanecem no aparelho "nesta versão"', () => {
    expect(tela).not.toContain('permanecem no aparelho');
    for (const texto of textosApresentaveis) {
      expect(texto).not.toMatch(/nesta vers[ãa]o/i);
    }
  });

  it('3 — a tela não escreve nenhum número de versão à mão', () => {
    expect(tela).not.toMatch(/vers[ãa]o\s*\d/i);
    expect(tela).not.toMatch(/\b\d+\.\d+(\.\d+)?\b/);
    // A versão exibida continua vindo da fonte única (D-05).
    expect(tela).toContain('appVersion()');
  });
});

describe('cada ambiente recebe a mensagem verdadeira', () => {
  it('4 — produção com backend: ambiente corporativo, com a ressalva de sessão', () => {
    const mode = resolveDataMode({ environment: 'production', isConfigured: true });
    expect(mode).toBe('corporate');
    const { title, body } = dataModeNoticeFor(mode);
    expect(title).toBe('Ambiente corporativo');
    expect(body).toContain('sincronizados com o ambiente corporativo');
    expect(body).toContain('conforme seu perfil e escopo de acesso');
    // Ressalva factual: a SESSÃO persiste no dispositivo (services/supabase/client),
    // o dado operacional não.
    expect(body).toMatch(/sess[ãa]o e prefer[êe]ncias podem permanecer temporariamente neste dispositivo/i);
    expect(dataModeLabelFor(mode)).toBe('Corporativo');
  });

  it('5 — homologação com backend recebe a mesma mensagem corporativa', () => {
    const mode = resolveDataMode({ environment: 'homologation', isConfigured: true });
    expect(mode).toBe('corporate');
    expect(dataModeNoticeFor(mode)).toEqual(dataModeNoticeFor(resolveDataMode({ environment: 'production', isConfigured: true })));
  });

  it('6 — desenvolvimento sem backend admite que o dado fica só no aparelho', () => {
    const mode = resolveDataMode({ environment: 'development', isConfigured: false });
    expect(mode).toBe('local-demo');
    const { title, body } = dataModeNoticeFor(mode);
    expect(title).toBe('Demonstração local');
    expect(body).toContain('somente neste dispositivo');
    expect(body).toContain('não é enviado');
    expect(dataModeLabelFor(mode)).toBe('Demonstração local');
  });

  it('7 — produção SEM backend não se disfarça de demonstração nem de ambiente corporativo', () => {
    const mode = resolveDataMode({ environment: 'production', isConfigured: false });
    expect(mode).toBe('unconfigured');
    const { title, body } = dataModeNoticeFor(mode);
    expect(title).toBe('Ambiente corporativo indisponível');
    expect(body).toContain('não está conectado ao ambiente corporativo');
    expect(body).toContain('somente neste dispositivo');
    expect(dataModeLabelFor(mode)).toBe('Não configurado');
  });
});

describe('nada de infraestrutura chega ao usuário final', () => {
  it('8 — nenhuma URL, host ou identificador de projeto nos textos apresentáveis', () => {
    for (const texto of textosApresentaveis) {
      expect(texto).not.toMatch(/https?:|\/\/|\.co\b|\.com\b/i);
      expect(texto).not.toMatch(/\bsupabase\b|\bproject[- ]?ref\b|\bendpoint\b|\bschema\b/i);
    }
  });

  it('9 — nenhuma chave, token ou segredo nos textos apresentáveis', () => {
    for (const texto of textosApresentaveis) {
      expect(texto).not.toMatch(/\b(jwt|token|anon|api[- ]?key|chave|senha|cookie|service[- ]?role)\b/i);
    }
  });

  it('10 — a própria tela não carrega URL nem referência de projeto', () => {
    expect(tela).not.toMatch(/https?:\/\//);
    expect(tela).not.toMatch(/supabase/i);
  });
});

describe('apresentação', () => {
  it('11 — o aviso é anunciado por inteiro para leitores de tela', () => {
    expect(tela).toContain('accessibilityRole="text"');
    expect(tela).toContain('accessibilityLabel={`${notice.title}. ${notice.body}`}');
  });

  it('12 — o aviso flui na largura disponível, sem largura fixa nem truncamento (375 px)', () => {
    expect(tela).toContain('noticeText: { flex: 1 }');
    expect(tela).not.toMatch(/notice[A-Za-z]*:\s*\{[^}]*\bwidth:\s*\d/);
    expect(tela).not.toContain('numberOfLines');
    // Corpo com entrelinha própria: texto longo quebra em vez de comprimir.
    expect(tela).toMatch(/noticeBody:\s*\{[^}]*lineHeight:/);
  });

  it('13 — restaurar demonstração só aparece quando a fonte é local', () => {
    expect(tela).toContain('{isLocalData && <AppButton title="Restaurar dados demonstrativos"');
    expect(tela).toContain("const isLocalData = mode !== 'corporate';");
  });
});
