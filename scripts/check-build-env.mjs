#!/usr/bin/env node
/**
 * Preflight do build web: falha ANTES do `expo export` quando a configuração do
 * Supabase não chega ao processo de build.
 *
 * POR QUE EXISTE. `EXPO_PUBLIC_*` é embutida no bundle em tempo de BUILD. Quando
 * a variável não está presente, o transform do Expo não deixa a expressão para
 * o runtime: ele substitui `process.env.EXPO_PUBLIC_SUPABASE_URL` por `void 0`.
 * O build termina com sucesso, o deploy fica Ready, e o app publicado cai em
 * modo demonstração — sem erro em lugar nenhum. Foi exatamente assim que uma
 * publicação de produção ficou servindo dados fictícios: o sintoma só aparece
 * abrindo o site. Este preflight converte essa falha silenciosa em erro de
 * build.
 *
 * PRIVACIDADE. Nada de valor é impresso: nem a chave, nem fragmento dela, nem a
 * URL completa. A saída é booleana, mais o project ref ESPERADO — que é
 * identificador público de projeto, não credencial. Nada é gravado em disco.
 *
 * ESCOPO. Não altera a arquitetura de configuração: `src/config/env.ts` segue
 * sendo o único leitor de `process.env`, com dot notation estática.
 */

/** Project ref do ambiente produtivo. Identificador público, não é segredo. */
export const REF_PRODUCAO = 'plnbgdabciwygsmnyddy';

export const VARIAVEIS_EXIGIDAS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
];

/** Extrai o project ref de `https://<ref>.supabase.co`. null se não casar. */
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
 * Avaliação pura, sem I/O — é o que o teste focado exercita.
 *
 * `exigirRefProducao` liga a checagem de identidade do projeto. Fica ligada
 * apenas no build de produção da Vercel (`VERCEL_ENV === 'production'`), para
 * que build local contra staging continue válido: o que nunca pode passar em
 * lugar nenhum é variável AUSENTE.
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
    problemas.push('EXPO_PUBLIC_SUPABASE_URL não tem a forma https://<project-ref>.supabase.co');
  }

  if (exigirRefProducao && refEncontrado !== null && refEncontrado !== refEsperado) {
    problemas.push(`build de produção apontando para outro projeto (esperado: ${refEsperado})`);
  }

  return {
    ok: problemas.length === 0,
    problemas,
    // Somente booleanos e o ref ESPERADO. O ref encontrado não é reportado para
    // não vazar a identidade de outro ambiente por engano.
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

function principal() {
  const env = process.env;
  const resultado = avaliarAmbienteDeBuild(env, {
    exigirRefProducao: env.VERCEL_ENV === 'production',
  });
  const r = resultado.resumo;

  console.log('preflight do build web — configuração do Supabase');
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
    console.error('BUILD INTERROMPIDO — a configuração do Supabase não chegou ao build.');
    for (const p of resultado.problemas) console.error(`  - ${p}`);
    console.error('');
    console.error('Sem essas variáveis o Expo embute `void 0` no bundle e o app publicado');
    console.error('sobe em modo demonstração, sem nenhum erro visível. Defina as duas no');
    console.error('provedor (na Vercel: Settings > Environment Variables, ambiente');
    console.error('Production) e refaça o build a partir de um novo deployment.');
    process.exit(1);
  }
}

// Só executa quando chamado como script; importar para teste não dispara nada.
if (process.argv[1] && process.argv[1].endsWith('check-build-env.mjs')) {
  principal();
}
