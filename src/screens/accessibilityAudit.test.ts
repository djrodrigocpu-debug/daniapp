/**
 * AAPEx 1.3.5 — FASE 10: auditoria INTEGRAL de acessibilidade e responsividade.
 *
 * ---------------------------------------------------------------------------
 * FRONTEIRA ASSUMIDA, E ELA É REAL
 * ---------------------------------------------------------------------------
 * A suíte roda em Node puro: **nenhuma tela é montada**. Estas garantias são
 * ESTÁTICAS sobre o código-fonte, como o projeto já faz desde
 * `performancePlanLink.test.ts`. Elas provam que a semântica foi ESCRITA, não
 * que o leitor de tela a pronunciou.
 *
 * O que elas pegam, e é o que produziu O-12 e O-13: controle sem papel,
 * controle fora da ordem de tabulação, estado não anunciado, cor como único
 * sinal e largura fixa que estoura a viewport. O que elas **não** pegam —
 * contraste medido em pixel, ordem de foco percebida, comportamento real do
 * NVDA/VoiceOver — fica como **gate manual**, e está registrado como tal em
 * `10-ACESSIBILIDADE.md` e `11-RESPONSIVIDADE.md` do checkpoint.
 *
 * Uma varredura estática que se apresenta como prova de acessibilidade seria
 * pior do que nenhuma: daria por resolvido o que ninguém verificou.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (p: string) => readFileSync(p, 'utf8');

/** As telas construídas ou tocadas pelas Fases 1, 3, 5, 8, 9 e 10. */
const TELAS_135: Array<[string, string]> = [
  ['Catálogo regional (Fase 1)', 'src/screens/admin/CatalogSection.tsx'],
  ['Gestão Assistida (Fase 3)', 'src/screens/AssistedCycleScreen.tsx'],
  ['Auditoria Mensal (Fase 5)', 'src/screens/MonthlyAuditScreen.tsx'],
  ['Painel e Matriz (Fases 8 e 9)', 'src/screens/ManagementDashboardScreen.tsx'],
  ['Detalhe do parceiro (Fase 10)', 'src/screens/OperationDetailScreen.tsx'],
];

/** Telas anteriores à 1.3.5 que a Fase 10 também corrigiu — ver §7 abaixo. */
const TELAS_ANTERIORES: Array<[string, string]> = [
  ['Parceiros (admin)', 'src/screens/admin/PartnersSection.tsx'],
  ['Importação de parceiros', 'src/screens/admin/PartnerImportFlow.tsx'],
  ['Importação de usuários', 'src/screens/admin/UserImportFlow.tsx'],
];

const TODAS = [...TELAS_135, ...TELAS_ANTERIORES];

/**
 * Um `<Pressable` cru e o que vem até o `>` de abertura da tag. É sobre este
 * pedaço que as asserções de semântica são feitas.
 */
function aberturas(fonte: string): string[] {
  const blocos: string[] = [];
  let i = fonte.indexOf('<Pressable');
  while (i !== -1) {
    // Vai até o primeiro `>` que fecha a tag de abertura, ignorando os que
    // estão dentro de chaves de expressão.
    let profundidade = 0;
    let j = i;
    for (; j < fonte.length; j += 1) {
      const c = fonte[j];
      if (c === '{') profundidade += 1;
      else if (c === '}') profundidade -= 1;
      else if (c === '>' && profundidade === 0) break;
    }
    blocos.push(fonte.slice(i, j + 1));
    i = fonte.indexOf('<Pressable', j);
  }
  return blocos;
}

// ===========================================================================
// A · O ACHADO O-13 NÃO SE REPETE
// ===========================================================================
describe('A · todo controle tocável tem papel e alcança o teclado', () => {
  it('o botão do produto declara papel, rótulo, estado e ordem de tabulação', () => {
    // A garantia mora em UM lugar, e não em cada tela — foi a dispersão dela
    // que produziu o O-13.
    const b = ler('src/components/AppButton.tsx');
    expect(b).toMatch(/accessibilityRole="button"/);
    expect(b).toMatch(/accessibilityLabel=\{title\}/);
    expect(b).toMatch(/accessibilityState=\{\{ disabled: inativo, busy: Boolean\(loading\) \}\}/);
    expect(b).toMatch(/tabIndex=\{inativo \? -1 : 0\}/);
    expect(b).toMatch(/focusable=\{!inativo\}/);
  });

  it('o botão desativado sai da tabulação mas CONTINUA anunciando o estado', () => {
    // Silêncio não é acessibilidade: quem chega nele por leitor de tela precisa
    // ouvir que está desabilitado.
    const b = ler('src/components/AppButton.tsx');
    expect(b).toMatch(/tabIndex=\{inativo \? -1 : 0\}/);
    expect(b).toMatch(/accessibilityState=\{\{ disabled: inativo/);
  });

  for (const [nome, caminho] of TODAS) {
    it(`${nome}: nenhum \`Pressable\` cru sem papel, rótulo e tabulação`, () => {
      const fonte = ler(caminho);
      for (const bloco of aberturas(fonte)) {
        const resumo = bloco.replace(/\s+/g, ' ').slice(0, 70);
        expect(`${resumo} | role`).toMatch(/role$/);
        expect(`role: ${/accessibilityRole=/.test(bloco)} <- ${resumo}`)
          .toBe(`role: true <- ${resumo}`);
        expect(`label: ${/accessibilityLabel=/.test(bloco)} <- ${resumo}`)
          .toBe(`label: true <- ${resumo}`);
        expect(`tabIndex: ${/tabIndex=/.test(bloco)} <- ${resumo}`)
          .toBe(`tabIndex: true <- ${resumo}`);
        expect(`focusable: ${/focusable/.test(bloco)} <- ${resumo}`)
          .toBe(`focusable: true <- ${resumo}`);
      }
    });
  }

  it('o alvo de toque mínimo é 48 pontos, e o compacto só serve a linha de lista', () => {
    const b = ler('src/components/AppButton.tsx');
    expect(b).toMatch(/minHeight: 48/);
    expect(b).toMatch(/compact: \{ minHeight: 38/);
  });
});

// ===========================================================================
// B · ESTADO SELECIONADO E DESABILITADO SÃO ANUNCIADOS
// ===========================================================================
describe('B · estado, e não só aparência', () => {
  it('todo controle que tem estado SELECIONADO o declara', () => {
    // Um chip que muda de cor ao ser escolhido, sem `accessibilityState`, é um
    // controle cujo estado só existe para quem enxerga.
    for (const [nome, caminho] of TODAS) {
      const fonte = ler(caminho);
      for (const bloco of aberturas(fonte)) {
        if (!/chipActive|Active\]|selected ===|selected:/.test(bloco)) continue;
        expect(`${nome}: ${/accessibilityState=/.test(bloco)}`).toBe(`${nome}: true`);
      }
    }
  });

  it('o grupo de resposta da Auditoria Mensal usa papel de rádio, com selecionado', () => {
    const t = ler('src/screens/MonthlyAuditScreen.tsx');
    expect(t).toMatch(/accessibilityRole="radio"/);
    expect(t).toMatch(/accessibilityState=\{\{ selected, disabled \}\}/);
    expect(t).toMatch(/tabIndex=\{disabled \? -1 : 0\}/);
  });
});

// ===========================================================================
// C · ERRO, CARGA E VAZIO SÃO ANUNCIADOS
// ===========================================================================
describe('C · o que muda sozinho na tela é anunciado', () => {
  for (const [nome, caminho] of TELAS_135) {
    it(`${nome}: todo bloco de erro tem papel de alerta`, () => {
      const fonte = ler(caminho);
      // Se a tela tem um estilo de erro, ela precisa ter papel de alerta.
      if (!/actionError|errorMessage|styles\.erro/.test(fonte)) return;
      expect(`${nome}: ${/accessibilityRole="alert"/.test(fonte)}`).toBe(`${nome}: true`);
    });
  }

  it('a exportação do relatório mensal anuncia o sucesso, não só a falha', () => {
    const t = ler('src/screens/MonthlyAuditScreen.tsx');
    expect(t).toMatch(/accessibilityLiveRegion="polite"/);
    expect(t).toMatch(/exportOk/);
  });

  it('o painel gerencial anuncia carga, vazio e ausência de dado', () => {
    const t = ler('src/screens/ManagementDashboardScreen.tsx');
    expect(t).toMatch(/ActivityIndicator/);
    expect(t).toMatch(/EmptyState/);
    expect(t).toMatch(/sem dado/i);
  });
});

// ===========================================================================
// D · COR NUNCA É O ÚNICO SINAL
// ===========================================================================
describe('D · cor nunca é o único sinal', () => {
  it('cada gráfico do painel tem alternativa TABULAR sempre presente', () => {
    const t = ler('src/screens/ManagementDashboardScreen.tsx');
    expect(t).toMatch(/function Tabela/);
    expect(t).toMatch(/<Grafico[\s\S]*?linhas=/);
    // A tabela não é um "modo acessível" que se ativa: ela está no DOM sempre.
    expect(t).not.toMatch(/mostrarTabela|modoAcessivel|toggleTabela/);
  });

  it('o quadrante e o índice têm texto acessível, e não só posição na matriz', () => {
    const p = ler('src/domain/dashboard/policy135.ts');
    expect(p).toMatch(/export function quadrantAccessibleLabel/);
    expect(p).toMatch(/export function weightedIndexAccessibleLabel/);
  });

  it('o PDF mensal imprime o RÓTULO da resposta ao lado da cor', () => {
    const r = ler('src/domain/report/pdf/renderMonthlyAuditReport.ts');
    expect(r).toMatch(/A cor vem acompanhada do rótulo/);
    expect(r).toMatch(/c\.answerLabel/);
  });
});

// ===========================================================================
// E · RESPONSIVIDADE — 375, 768 e 1366
// ===========================================================================
describe('E · o documento não rola na horizontal', () => {
  const LARGURAS = [375, 768, 1366];

  for (const [nome, caminho] of TELAS_135) {
    it(`${nome}: nenhuma largura fixa maior que 375 px`, () => {
      const fonte = ler(caminho);
      // `width: <n>` literal maior que a menor viewport força rolagem
      // horizontal do DOCUMENTO — que é o que a exigência proíbe. Largura
      // dentro de contêiner rolável é outra coisa, e é permitida (ver abaixo).
      const fixas = [...fonte.matchAll(/(?<!max|min)[Ww]idth: (\d{3,})/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > LARGURAS[0]);
      expect(`${nome}: ${JSON.stringify(fixas)}`).toBe(`${nome}: []`);
    });

    it(`${nome}: o conteúdo largo rola DENTRO do próprio contêiner`, () => {
      const fonte = ler(caminho);
      // Só exige contêiner rolável quem tem tabela ou linha larga.
      if (!/function Tabela|horizontal/.test(fonte)) return;
      expect(`${nome}: ${/horizontal/.test(fonte)}`).toBe(`${nome}: true`);
    });

    it(`${nome}: linhas de botão quebram em vez de estourar`, () => {
      const fonte = ler(caminho);
      if (!/buttonRow|filtroLinha|linhaBotoes/.test(fonte)) return;
      expect(`${nome}: ${/flexWrap/.test(fonte)}`).toBe(`${nome}: true`);
    });
  }

  it('as três larguras do gate estão registradas para a verificação manual', () => {
    expect(LARGURAS).toEqual([375, 768, 1366]);
  });
});

// ===========================================================================
// F · TERMINOLOGIA D8 EM TODA A INTERFACE
// ===========================================================================
describe('F · terminologia D8', () => {
  // A proibição é sobre o BOTÃO DE AÇÃO do fluxo legado, não sobre o nome do
  // módulo: `<SectionTitle title="Auditoria Mensal">` é o nome canônico de D8 e
  // precisa aparecer. O que não pode existir é um `AppButton` que ofereça o
  // checklist legado com o nome do módulo novo — foi assim que os dois ficaram
  // indistinguíveis até a Fase 10.
  const PROIBIDAS = [
    /<AppButton title="Auditoria semanal"/,
    /<AppButton title="Auditoria mensal"/i,
    /auditorias antigas/i,
  ];

  for (const [nome, caminho] of TELAS_135) {
    it(`${nome}: nenhum nome proibido pela tabela de §9`, () => {
      const fonte = ler(caminho);
      for (const p of PROIBIDAS) {
        expect(`${nome} ${p}: ${p.test(fonte)}`).toBe(`${nome} ${p}: false`);
      }
    });
  }

  it('o documento do AAPEx e a fonte externa têm nomes distintos', () => {
    const mensal = ler('src/screens/MonthlyAuditScreen.tsx');
    const detalhe = ler('src/screens/OperationDetailScreen.tsx');
    expect(mensal).toMatch(/Relatório Oficial da Auditoria Mensal/);
    expect(mensal).toMatch(/relatório oficial da operação/);
    expect(detalhe).toMatch(/relatório oficial da operação \(fonte externa\)/);
  });

  it('nenhuma pendência FECHADA continua anunciada em tela', () => {
    for (const [nome, caminho] of TELAS_135) {
      const fonte = ler(caminho);
      // A-01, A-02, A-03, A-04 e A-07 continuam abertas e podem aparecer.
      for (const fechada of ['A-05', 'A-06', 'A-10', 'A-11']) {
        expect(`${nome} ${fechada}: ${fonte.includes(fechada)}`).toBe(`${nome} ${fechada}: false`);
      }
    }
  });
});
