/**
 * Preflight do build web - teste focado da avaliacao PURA.
 *
 * O defeito que este guarda cobre nao e hipotetico: um build de producao
 * terminou Ready, sem erro algum, e serviu o app em modo demonstracao porque as
 * duas variaveis nao chegaram ao processo de build. O Expo substitui
 * `process.env.EXPO_PUBLIC_*` ausente por `void 0` em tempo de build, entao
 * nada falha - so o site fica errado.
 *
 * Valores aqui sao sinteticos. Nenhuma credencial real.
 */
import { describe, it, expect } from 'vitest';
import { avaliarAmbienteDeBuild, refDaUrl, REF_PRODUCAO, comArquivosEnv } from './check-build-env.mjs';

const URL_PROD = `https://${REF_PRODUCAO}.supabase.co`;
const URL_OUTRA = 'https://marcadorsinteticoxyz.supabase.co';
const CHAVE = 'sb_publishable_MARCADOR_SINTETICO';

const completo = (extra = {}) => ({
  EXPO_PUBLIC_SUPABASE_URL: URL_PROD,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: CHAVE,
  ...extra,
});

describe('comArquivosEnv - precedencia', () => {
  const arquivos = {
    '.env': 'EXPO_PUBLIC_SUPABASE_URL=https://doenv.supabase.co\nSO_NO_ENV=valorEnv\n',
    '.env.local': 'EXPO_PUBLIC_SUPABASE_URL=https://dolocal.supabase.co\nSO_NO_LOCAL=valorLocal\n',
  };
  const ler = (nome) => {
    if (!(nome in arquivos)) throw new Error('ausente');
    return arquivos[nome];
  };

  it('process.env vence .env.local e .env', () => {
    const r = comArquivosEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://doprocesso.supabase.co' }, ler);
    expect(r.EXPO_PUBLIC_SUPABASE_URL).toBe('https://doprocesso.supabase.co');
  });

  it('.env.local vence .env', () => {
    const r = comArquivosEnv({}, ler);
    expect(r.EXPO_PUBLIC_SUPABASE_URL).toBe('https://dolocal.supabase.co');
  });

  it('chaves exclusivas de cada arquivo sao somadas', () => {
    const r = comArquivosEnv({}, ler);
    expect(r.SO_NO_ENV).toBe('valorEnv');
    expect(r.SO_NO_LOCAL).toBe('valorLocal');
  });

  it('arquivo ausente nao quebra a leitura', () => {
    const r = comArquivosEnv({ X: '1' }, () => { throw new Error('ausente'); });
    expect(r.X).toBe('1');
  });

  it('comentario e linha invalida sao ignorados; aspas sao removidas', () => {
    const r = comArquivosEnv({}, () => '# comentario\nlixo sem igual\nA="entre aspas"\n');
    expect(r.A).toBe('entre aspas');
    expect(r['# comentario']).toBeUndefined();
  });
});

describe('refDaUrl', () => {
  it('extrai o project ref de uma URL de projeto', () => {
    expect(refDaUrl(URL_PROD)).toBe(REF_PRODUCAO);
  });

  it('recusa o que nao tem forma de projeto', () => {
    expect(refDaUrl('')).toBeNull();
    expect(refDaUrl('nao-e-url')).toBeNull();
    expect(refDaUrl('http://plnbgdabciwygsmnyddy.supabase.co')).toBeNull(); // exige https
    expect(refDaUrl('https://exemplo.com')).toBeNull();
    expect(refDaUrl(undefined)).toBeNull();
  });
});

describe('avaliarAmbienteDeBuild - presenca das variaveis', () => {
  it('aprova quando as duas estao presentes', () => {
    const r = avaliarAmbienteDeBuild(completo());
    expect(r.ok).toBe(true);
    expect(r.problemas).toEqual([]);
    expect(r.resumo.urlPresente).toBe(true);
    expect(r.resumo.chavePresente).toBe(true);
  });

  it('reprova quando a URL falta - o caso que derrubou a publicacao', () => {
    const r = avaliarAmbienteDeBuild({ EXPO_PUBLIC_SUPABASE_ANON_KEY: CHAVE });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_URL ausente/.test(p))).toBe(true);
  });

  it('reprova quando a chave falta', () => {
    const r = avaliarAmbienteDeBuild({ EXPO_PUBLIC_SUPABASE_URL: URL_PROD });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_ANON_KEY ausente/.test(p))).toBe(true);
  });

  it('reprova quando ambas faltam, nomeando as duas e sem ruido', () => {
    const r = avaliarAmbienteDeBuild({});
    expect(r.ok).toBe(false);
    // Exatamente dois problemas: URL ausente nao e reportada TAMBEM como
    // malformada - acusar forma invalida de algo que nao existe so confunde
    // quem le o log do build.
    expect(r.problemas).toHaveLength(2);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_URL ausente/.test(p))).toBe(true);
    expect(r.problemas.some((p) => /EXPO_PUBLIC_SUPABASE_ANON_KEY ausente/.test(p))).toBe(true);
  });

  it('string vazia ou so espacos conta como ausente', () => {
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: '   ' })).ok).toBe(false);
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_URL: '' })).ok).toBe(false);
  });

  it('nao exige formato JWT na chave - publicavel moderna e valida', () => {
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_abc' })).ok).toBe(true);
    expect(avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOi.x.y' })).ok).toBe(true);
  });
});

describe('avaliarAmbienteDeBuild - identidade do projeto', () => {
  it('build local contra outro projeto passa: o que nao pode e variavel ausente', () => {
    const r = avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_URL: URL_OUTRA }));
    expect(r.ok).toBe(true);
    expect(r.resumo.identidadeDoProjetoExigida).toBe(false);
  });

  it('build de producao contra outro projeto e REPROVADO', () => {
    const r = avaliarAmbienteDeBuild(
      completo({ EXPO_PUBLIC_SUPABASE_URL: URL_OUTRA }),
      { exigirRefProducao: true },
    );
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /outro projeto/.test(p))).toBe(true);
  });

  it('build de producao contra o projeto esperado e aprovado', () => {
    const r = avaliarAmbienteDeBuild(completo(), { exigirRefProducao: true });
    expect(r.ok).toBe(true);
    expect(r.resumo.identidadeDoProjetoConfere).toBe(true);
  });

  it('URL sem forma de project ref e reprovada', () => {
    const r = avaliarAmbienteDeBuild(completo({ EXPO_PUBLIC_SUPABASE_URL: 'https://exemplo.com' }));
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => /forma https:\/\/<project-ref>/.test(p))).toBe(true);
  });
});

describe('avaliarAmbienteDeBuild - privacidade da saida', () => {
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
    // O ref ESPERADO pode aparecer: e identificador publico, e e o que orienta
    // a correcao quando o build aponta para o projeto errado.
    expect(serializado).toContain(REF_PRODUCAO);
  });
});
