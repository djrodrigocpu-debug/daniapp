/**
 * Preflight do build web — teste focado da avaliação PURA.
 *
 * O defeito que este guarda cobre não é hipotético: um build de produção
 * terminou Ready, sem erro algum, e serviu o app em modo demonstração porque as
 * duas variáveis não chegaram ao processo de build. O Expo substitui
 * `process.env.EXPO_PUBLIC_*` ausente por `void 0` em tempo de build, então
 * nada falha — só o site fica errado.
 *
 * Valores aqui são sintéticos. Nenhuma credencial real.
 */
import { describe, it, expect } from 'vitest';
import { avaliarAmbienteDeBuild, refDaUrl, REF_PRODUCAO } from './check-build-env.mjs';

const URL_PROD = `https://${REF_PRODUCAO}.supabase.co`;
const URL_OUTRA = 'https://marcadorsinteticoxyz.supabase.co';
const CHAVE = 'sb_publishable_MARCADOR_SINTETICO';

const completo = (extra = {}) => ({
  EXPO_PUBLIC_SUPABASE_URL: URL_PROD,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: CHAVE,
  ...extra,
});

describe('refDaUrl', () => {
  it('extrai o project ref de uma URL de projeto', () => {
    expect(refDaUrl(URL_PROD)).toBe(REF_PRODUCAO);
  });

  it('recusa o que não tem forma de projeto', () => {
    expect(refDaUrl('')).toBeNull();
    expect(refDaUrl('nao-e-url')).toBeNull();
    expect(refDaUrl('http://plnbgdabciwygsmnyddy.supabase.co')).toBeNull(); // exige https
    expect(refDaUrl('https://exemplo.com')).toBeNull();
    expect(refDaUrl(undefined)).toBeNull();
  });
});

describe('avaliarAmbienteDeBuild — presença das variáveis', () => {
  it('aprova quando as duas estão presentes', () => {
    const r = avaliarAmbienteDeBuild(completo());
    expect(r.ok).toBe(true);
    expect(r.problemas).toEqual([]);
    expect(r.resumo.urlPresente).toBe(true);
    expect(r.resumo.chavePresente).toBe(true);
  });

  it('reprova quando a URL falta — o caso que derrubou a publicação', () => {
    const r = avaliarAmbienteDeBuild({ EXPO_PUBLIC_SUPABASE_ANON_KEY: CHAVE });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_URL ausente/.test(p))).toBe(true);
  });

  it('reprova quando a chave falta', () => {
    const r = avaliarAmbienteDeBuild({ EXPO_PUBLIC_SUPABASE_URL: URL_PROD });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_ANON_KEY ausente/.test(p))).toBe(true);
  });

  it('reprova quando ambas faltam, nomeando as duas e sem ruído', () => {
    const r = avaliarAmbienteDeBuild({});
    expect(r.ok).toBe(false);
    // Exatamente dois problemas: URL ausente não é reportada TAMBÉM como
    // malformada — acusar forma inválida de algo que não existe só confunde
    // quem lê o log do build.
    expect(r.problemas).toHaveLength(2);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_URL ausente/.test(p))).toBe(true);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_ANON_KEY ausente/.test(p))).toBe(true);
  });

  it('string vazia ou só espaços conta como ausente', () => {
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: '   ' })).ok).toBe(false);
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_URL: '' })).ok).toBe(false);
  });

  it('não exige formato JWT na chave — publicável moderna é válida', () => {
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_abc' })).ok).toBe(true);
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOi.x.y' })).ok).toBe(true);
  });
});

describe('avaliarAmbienteDeBuild — identidade do projeto', () => {
  it('build local contra outro projeto passa: o que não pode é variável ausente', () => {
    const r = avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_URL: URL_OUTRA }));
    expect(r.ok).toBe(true);
    expect(r.resumo.identidadeDoProjetoExigida).toBe(false);
  });

  it('build de produção contra outro projeto é REPROVADO', () => {
    const r = avaliarAmbienteDeBuild(
      completo({ EXPO_PUBLIC_SUPABASE_URL: URL_OUTRA }),
      { exigirRefProducao: true },
    );
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /outro projeto/.test(p))).toBe(true);
  });

  it('build de produção contra o projeto esperado é aprovado', () => {
    const r = avaliarAmbienteDeBuild(completo(), { exigirRefProducao: true });
    expect(r.ok).toBe(true);
    expect(r.resumo.identidadeDoProjetoConfere).toBe(true);
  });

  it('URL sem forma de project ref é reprovada', () => {
    const r = avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_URL: 'https://exemplo.com' }));
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /forma https:\/\/<project-ref>/.test(p))).toBe(true);
  });
});

describe('avaliarAmbienteDeBuild — privacidade da saída', () => {
  it('nem a chave nem a URL completa aparecem no resultado', () => {
    const chaveSecreta = 'sb_publishable_VALOR_QUE_NAO_PODE_VAZAR';
    const r = avaliarAmbienteDeBuild(
      completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: chaveSecreta, EXPO_PUBLIC_SUPABASE_URL: URL_OUTRA }),
      { exigirRefProducao: true },
    );
    const serializado = JSON.stringify(r);
    expect(serializado).not.toContain(chaveSecreta);
    expect(serializado).not.toContain('sb_publishable_');
    expect(serializado).not.toContain(URL_OUTRA);
    expect(serializado).not.toContain('marcadorsinteticoxyz');
    // O ref ESPERADO pode aparecer: é identificador público, e é o que orienta
    // a correção quando o build aponta para o projeto errado.
    expect(serializado).toContain(REF_PRODUCAO);
  });
});
