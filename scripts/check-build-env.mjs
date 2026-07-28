import { readFileSync } from 'node:fs';
/**
 * Preflight do build web: falha ANTES do `expo export` quando a configuracao do
 * Supabase nao chega ao processo de build.
 *
 * POR QUE EXISTE. `EXPO_PUBLIC_*` e embutida no bundle em tempo de BUILD. Quando
 * a variavel nao esta presente, o transform do Expo nao deixa a expressao para
 * o runtime: ele substitui `process.env.EXPO_PUBLIC_SUPABASE_URL` por `void 0`.
 * O build termina com sucesso, o deploy fica Ready, e o app publicado cai em
 * modo demonstracao - sem erro em lugar nenhum. Foi exatamente assim que uma
 * publicacao de producao ficou servindo dados ficticios: o sintoma so aparece
 * abrindo o site. Este preflight converte essa falha silenciosa em erro de
 * build.
 *
 * PRIVACIDADE. Nada de valor e impresso: nem a chave, nem fragmento dela, nem a
 * URL completa. A saida e booleana, mais o project ref ESPERADO - que e
 * identificador publico de projeto, nao credencial. Nada e gravado em disco.
 *
 * ESCOPO. Nao altera a arquitetura de configuracao: `src/config/env.ts` segue
 * sendo o unico leitor de `process.env`, com dot notation estatica.
 */

/** Project ref do ambiente produtivo. Identificador publico, nao e segredo. */
export const REF_PRODUCAO = 'plnbgdabciwygsmnyddy';

export const VARIAVEIS_EXIGIDAS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
];

/** Extrai o project ref de `https://<ref>.supabase.co`. null se nao casar. */
export function refDaUrl(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return null;
    const m = /^([a-z0-9]{16,32})\.supabase\.(co|in)$/.exec(hostname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Avaliacao pura, sem I/O - e o que o teste focado exercita.
 *
 * `exigirRefProducao` liga a checagem de identidade do projeto. Fica ligada
 * apenas no build de producao da Vercel (`VERCEL_ENV === 'production'`), para
 * que build local contra staging continue valido: o que nunca pode passar em
 * lugar nenhum e variavel AUSENTE.
 */
export function avaliarAmbienteDeBuild(env, opcoes = {}) {
  const refEsperado = opcoes.refEsperado ?? REF_PRODUCAO;
  const exigirRefProducao = opcoes.exigirRefProducao === true;

  const problemas = [];
  const ausentes = VARIAVEIS_EXIGIDAS.filter((nome) => {
    const v = env[nome];
    return typeof v !== 'string' || v.trim() === '';
  });

  for (const nome of ausentes) {
    problemas.push(`${nome} ausente ou vazia no ambiente de build`);
  }

  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const refEncontrado = refDaUrl(typeof url === 'string' ? url.trim() : '');

  if (!ausentes.includes('EXPO_PUBLIC_SUPABASE_URL') && refEncontrado === null) {
    problemas.push('EXPO_PUBLIC_SUPABASE_URL nao tem a forma https://<project-ref>.supabase.co');
  }

  if (exigirRefProducao && refEncontrado !== null && refEncontrado !== refEsperado) {
    problemas.push(`build de producao apontando para outro projeto (esperado: ${refEsperado})`);
  }

  return {
    ok: problemas.length === 0,
    problemas,
    // Somente booleanos e o ref ESPERADO. O ref encontrado nao e reportado para
    // nao vazar a identidade de outro ambiente por engano.
    resumo: {
      urlPresente: !ausentes.includes('EXPO_PUBLIC_SUPABASE_URL'),
      chavePresente: !ausentes.includes('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
      urlComFormaDeProjeto: refEncontrado !== null,
      refEsperado,
      identidadeDoProjetoExigida: exigirRefProducao,
      identidadeDoProjetoConfere: exigirRefProducao ? refEncontrado === refEsperado : null,
    },
  };
}

/**
 * Le os arquivos `.env` que o Expo tambem carrega, na mesma precedencia: o que
 * ja esta no ambiente do processo VENCE o arquivo.
 *
 * Sem isto o preflight ficaria mais estrito que o proprio build: localmente a
 * configuracao vem do `.env`, e o guarda reprovaria um build que funcionaria.
 * Na Vercel nao ha `.env`, entao nada muda la - que e onde o guarda importa.
 */
export const ARQUIVOS_ENV = ['.env.local', '.env'];

/**
 * A ordem importa: quem e lido PRIMEIRO vence, porque uma chave ja definida
 * nunca e sobrescrita. Dai `.env.local` vir antes de `.env`, e o ambiente do
 * processo vencer os dois por ja estar em `combinado` na entrada.
 */
export function comArquivosEnv(env, lerArquivo) {
  const ler = lerArquivo ?? ((nome) => readFileSync(new URL(`../${nome}`, import.meta.url), 'utf8'));
  const combinado = { ...env };
  for (const nome of ARQUIVOS_ENV) {
    let texto;
    try { texto = ler(nome); }
    catch { continue; }
    if (typeof texto !== 'string') continue;
    for (const linha of texto.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
      if (!m || linha.trimStart().startsWith('#')) continue;
      const chave = m[1];
      if (combinado[chave] !== undefined && combinado[chave] !== '') continue;
      combinado[chave] = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    }
  }
  return combinado;
}

function principal() {
  const env = comArquivosEnv(process.env);
  const resultado = avaliarAmbienteDeBuild(env, {
    exigirRefProducao: env.VERCEL_ENV === 'production',
  });
  const r = resultado.resumo;

  console.log('preflight do build web - configuracao do Supabase');
  console.log(`  EXPO_PUBLIC_SUPABASE_URL presente ....... ${r.urlPresente}`);
  console.log(`  EXPO_PUBLIC_SUPABASE_ANON_KEY presente .. ${r.chavePresente}`);
  console.log(`  URL com forma de project ref ............ ${r.urlComFormaDeProjeto}`);
  console.log(`  identidade do projeto exigida ........... ${r.identidadeDoProjetoExigida}`);
  if (r.identidadeDoProjetoExigida) {
    console.log(`  project ref esperado .................... ${r.refEsperado}`);
    console.log(`  identidade confere ...................... ${r.identidadeDoProjetoConfere}`);
  }

  if (!resultado.ok) {
    console.error('');
    console.error('BUILD INTERROMPIDO - a configuracao do Supabase nao chegou ao build.');
    for (const p of resultado.problemas) console.error(`  - ${p}`);
    console.error('');
    console.error('Sem essas variaveis o Expo embute `void 0` no bundle e o app publicado');
    console.error('sobe em modo demonstracao, sem nenhum erro visivel. Defina as duas no');
    console.error('provedor (na Vercel: Settings > Environment Variables, ambiente');
    console.error('Production) e refaca o build a partir de um novo deployment.');
    process.exit(1);
  }
}

// So executa quando chamado como script; importar para teste nao dispara nada.
if (process.argv[1] && process.argv[1].endsWith('check-build-env.mjs')) {
  principal();
}
