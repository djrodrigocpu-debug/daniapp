/**
 * PROVAS ESTÁTICAS do painel gerencial e da Matriz (AAPEx 1.3.5, Fase 8).
 *
 * POR QUE ESTÁTICAS. A suíte roda em Node puro: telas React Native não são
 * montadas aqui. As garantias abaixo — alternativa tabular em cada gráfico,
 * semântica de botão, ausência de regra duplicada na tela, "sem dado" nunca
 * exibido como zero — são todas verificáveis no FONTE, e é assim que o projeto
 * já verifica `AssistedCycleScreen` e `MonthlyAuditScreen`.
 *
 * O que isto NÃO substitui: o teste visual a 375 px, que é gate manual.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const tela = ler('src/screens/ManagementDashboardScreen.tsx');
const inicio = ler('src/screens/DashboardScreen.tsx');
const navegacao = ler('src/navigation/AppNavigator.tsx');
const policy = ler('src/domain/dashboard/policy135.ts');

describe('caminho até a tela', () => {
  it('a rota existe no navegador e no contrato de parâmetros', () => {
    expect(navegacao).toMatch(/name="ManagementDashboard"/);
    expect(navegacao).toMatch(/ManagementDashboardScreen/);
    expect(ler('src/types/index.ts')).toMatch(/ManagementDashboard: undefined/);
  });

  it('Início → painel gerencial é alcançável em um toque, e o controle é um botão', () => {
    expect(inicio).toMatch(/navigation\.navigate\('ManagementDashboard'\)/);
    const bloco = inicio.slice(inicio.indexOf("navigate('ManagementDashboard')") - 500,
      inicio.indexOf("navigate('ManagementDashboard')") + 500);
    expect(bloco).toMatch(/accessibilityRole="button"/);
    expect(bloco).toMatch(/tabIndex=\{0\}/);
  });

  it('a rota NÃO aceita filtro por parâmetro — um link não pode pedir mais do que o papel alcança', () => {
    expect(ler('src/types/index.ts')).not.toMatch(/ManagementDashboard: \{/);
  });
});

describe('acessibilidade — os achados O-12 e O-13 não se repetem', () => {
  it('todo controle tocável tem semântica de botão e foco por teclado', () => {
    const pressables = tela.match(/<Pressable/g) ?? [];
    const papeis = tela.match(/accessibilityRole="button"/g) ?? [];
    const foco = tela.match(/tabIndex=\{0\}/g) ?? [];
    expect(pressables.length).toBeGreaterThan(0);
    expect(papeis.length).toBeGreaterThanOrEqual(pressables.length);
    expect(foco.length).toBeGreaterThanOrEqual(pressables.length);
  });

  it('o estado de seleção do filtro é anunciado, e não vive só na cor', () => {
    expect(tela).toMatch(/accessibilityState=\{\{ selected: ativo \}\}/);
    // O ✓ textual acompanha o realce visual: cor não é o único sinal.
    expect(tela).toMatch(/ativo \? '✓ ' : ''/);
  });

  it('os campos de período têm rótulo associado', () => {
    expect(tela).toMatch(/nativeID="lbl-de"/);
    expect(tela).toMatch(/accessibilityLabelledBy="lbl-de"/);
    expect(tela).toMatch(/nativeID="lbl-ate"/);
    expect(tela).toMatch(/accessibilityLabelledBy="lbl-ate"/);
  });

  it('carregamento, erro e vazio são estados próprios, e o erro é anunciado', () => {
    expect(tela).toMatch(/accessibilityRole="progressbar"/);
    expect(tela).toMatch(/accessibilityLiveRegion="polite"/);
    expect(tela).toMatch(/<EmptyState/);
    expect(tela).toMatch(/Tentar novamente/);
  });

  it('os cabeçalhos de seção e de tabela são anunciados como cabeçalho', () => {
    expect((tela.match(/accessibilityRole="header"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe('alternativa tabular — D10 exige uma para CADA gráfico', () => {
  it('existe um componente de tabela, e ele traz cabeçalho e valores em texto', () => {
    expect(tela).toMatch(/function Tabela\(/);
    expect(tela).toMatch(/tabelaCabecalho/);
  });

  it('o componente de gráfico SEMPRE renderiza a tabela irmã — não é um modo que se ativa', () => {
    const grafico = tela.slice(tela.indexOf('function Grafico('), tela.indexOf('/** Alternativa tabular'));
    expect(grafico).toMatch(/<Tabela/);
    // A tabela fica FORA do ramo condicional das barras: ela existe mesmo quando
    // não há dado para desenhar.
    expect(grafico.indexOf('<Tabela')).toBeGreaterThan(grafico.indexOf('total === 0'));
  });

  it('há tabela para cobertura, quadrantes, planos e os dois eixos de cada parceiro', () => {
    expect(tela).toMatch(/titulo="Cobertura por módulo"/);
    expect(tela).toMatch(/titulo="Parceiros por quadrante"/);
    expect(tela).toMatch(/titulo="Planos — origem e vencimento"/);
    expect(tela).toMatch(/— os dois eixos/);
  });
});

describe('"sem dado" nunca é exibido como zero', () => {
  it('a tela diz em palavras que zero de tudo é ausência de registro', () => {
    expect(tela).toMatch(/Sem dado no período selecionado/);
    expect(tela).toMatch(/não significa zero/);
  });

  it('nota nula aparece como "sem dado", nunca como 0,00', () => {
    expect(tela).toMatch(/score === null \? 'sem dado'/);
  });

  it('participação sem total aparece como "sem dado", nunca como 0%', () => {
    expect(tela).toMatch(/total === 0 \? 'sem dado'/);
  });
});

describe('a tela não recalcula regra de negócio', () => {
  it('não há classificação de quadrante nem cálculo de índice no fonte da tela', () => {
    expect(tela).not.toMatch(/healthy'\s*:\s*'ineffective_routine/);
    expect(tela).not.toMatch(/assistedWeight\s*[*/]/);
    expect(tela).not.toMatch(/\* 0\.6|\/ 100 \*/);
    // A tela lê `quadrant` e `weightedIndex`; não os produz.
    expect(tela).toMatch(/entrada\.quadrant \?/);
    expect(tela).toMatch(/entrada\.weightedIndex \?/);
  });

  it('nem o módulo puro classifica: ele só rotula o que o servidor decidiu', () => {
    expect(policy).not.toMatch(/function quadrantFor|score >= 80|>= 70/);
    expect(policy).toMatch(/entries\.map|entry\.quadrant/);
  });

  it('a tela não consulta o Supabase diretamente — passa pelo repositório', () => {
    expect(tela).not.toMatch(/from\('|\.rpc\(/);
    expect(tela).toMatch(/useRepositories\(\)/);
    expect(tela).toMatch(/dashboard\.getAggregates/);
    expect(tela).toMatch(/dashboard\.getMatrix/);
  });
});

describe('o provisório é dito em voz alta', () => {
  it('o aviso de A-10 e A-11 está na tela, com papel de alerta', () => {
    expect(tela).toMatch(/provisionalNotice\(matrix\.ruleProvenance\)/);
    expect(tela).toMatch(/accessibilityRole="alert"/);
  });

  it('a proveniência das três regras é exibida, e não escondida', () => {
    expect(tela).toMatch(/ruleProvenance\.performanceScoreRule/);
    expect(tela).toMatch(/ruleProvenance\.monthlyScoreRule/);
    expect(tela).toMatch(/ruleProvenance\.quadrantRule/);
  });

  it('a seção da Auditoria Mensal avisa que a pontuação é provisória', () => {
    expect(tela).toMatch(/PROVISÓRIA e aguarda decisão empresarial \(A-10\)/);
  });

  it('quando não há índice, a tela diz POR QUE não há', () => {
    expect(tela).toMatch(/Índice não calculado/);
    expect(tela).toMatch(/weightedIndexUnavailableReason/);
  });
});

describe('responsivo a 375 px', () => {
  it('os campos de filtro encolhem em vez de estourar a linha', () => {
    expect(tela).toMatch(/flexWrap: 'wrap'/);
    expect(tela).toMatch(/flexGrow: 1, flexShrink: 1, minWidth: 140/);
  });

  it('as células de tabela dividem a largura em vez de fixá-la', () => {
    expect(tela).toMatch(/tabelaCelula: \{ flex: 1/);
  });
});
