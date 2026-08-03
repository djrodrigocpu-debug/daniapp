/**
 * AAPEx 1.3.5 — MODO SIMULAÇÃO
 *
 * Decide se este bundle é o laboratório de simulação. É a única fonte da
 * verdade para a faixa visual, e existe separada de `config/env` de propósito:
 * o modo simulação NÃO é um ambiente do produto (`production` | `homologation` |
 * `development`), é um rótulo de laboratório que precisa desaparecer por
 * completo do build de produção.
 *
 * IMPORTANTE (bundle web): o Expo/Metro só faz o INLINE de `EXPO_PUBLIC_*`
 * quando há referência ESTÁTICA e DIRETA a `process.env.<NOME>`. Ler por
 * colchetes, spread ou nome dinâmico deixa a variável `undefined` no build — a
 * mesma armadilha já documentada em `config/env.ts`. Por isso a leitura abaixo é
 * literal, e não deve ser refatorada para acesso dinâmico.
 *
 * SEM a variável, `isSimulationMode` é `false` e a faixa não existe no bundle.
 * Não há default permissivo: um build de produção que esqueça de desligar algo
 * não pode acabar exibindo "dados fictícios" — e um build de simulação que
 * esqueça de ligar mostra menos, nunca mais.
 */

export const SIMULATION_BANNER_TEXT =
  'AMBIENTE DE SIMULAÇÃO · DADOS FICTÍCIOS · NÃO É PRODUÇÃO';

export const SIMULATION_PAGE_TITLE = 'AAPEx 1.3.5 — SIMULAÇÃO';

/** Aceita apenas o literal `true`. Qualquer outro valor desliga o modo. */
export function parseSimulationFlag(raw: string | undefined | null): boolean {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'true';
}

/**
 * Abrevia o Project Ref para identificar o alvo sem despejar o identificador
 * inteiro em toda screenshot: `qjvpkaur…linhp`.
 */
export function abbreviateProjectRef(url: string | undefined | null): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\./i);
  const ref = match?.[1];
  if (!ref) return null;
  if (ref.length <= 12) return ref;
  return `${ref.slice(0, 8)}…${ref.slice(-5)}`;
}

export const isSimulationMode: boolean = parseSimulationFlag(
  process.env.EXPO_PUBLIC_SIMULATION_MODE,
);

export const simulationProjectRef: string | null = isSimulationMode
  ? abbreviateProjectRef(process.env.EXPO_PUBLIC_SUPABASE_URL)
  : null;
