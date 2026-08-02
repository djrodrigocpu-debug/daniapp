/**
 * PROVAS ESTÁTICAS da tela da Gestão Assistida.
 *
 * POR QUE ESTÁTICAS. A suíte roda em Node puro (ver `vitest.config.ts`): telas
 * React Native não são montadas aqui, e fingir que são exigiria jest-expo, que
 * este projeto não usa. As garantias abaixo — semântica de botão, status nunca
 * só por cor, erro associado ao campo, ausência de consulta direta ao Supabase —
 * são todas verificáveis no FONTE, e é assim que o projeto já as verifica em
 * `performancePlanLink.test.ts`.
 *
 * O que isto NÃO substitui: teste visual real, que é gate manual da sessão.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const tela = ler('src/screens/AssistedCycleScreen.tsx');
const detalhe = ler('src/screens/OperationDetailScreen.tsx');
const navegacao = ler('src/navigation/AppNavigator.tsx');

describe('caminho até a tela', () => {
  it('a rota existe no navegador e no contrato de parâmetros', () => {
    expect(navegacao).toMatch(/name="AssistedCycle"/);
    expect(navegacao).toMatch(/AssistedCycleScreen/);
    expect(ler('src/types/index.ts')).toMatch(/AssistedCycle:\s*\{\s*operationId: string/);
  });

  it('Parceiros → parceiro → Gestão Assistida é alcançável em um toque', () => {
    expect(detalhe).toMatch(/navigation\.navigate\('AssistedCycle'/);
  });

  it('nenhum BOTÃO continua se chamando "Gestão Assistida"', () => {
    // Antes da 1.3.5 o botão da Visita produtiva usava esse nome. Dois destinos
    // com o mesmo rótulo mandariam o operador ao lugar errado. O título de
    // SEÇÃO pode e deve manter o nome — ele não navega para lugar nenhum.
    const botoes = detalhe.match(/<AppButton\s+title="[^"]*"/g) ?? [];
    const ambiguos = botoes.filter((b) => /Gest[aã]o Assistida/.test(b));
    expect(ambiguos).toEqual([]);
    expect(detalhe).toMatch(/title="Abrir visita produtiva"/);
    expect(detalhe).toMatch(/<SectionTitle title="Gestão Assistida"/);
  });
});

describe('acessibilidade — os achados O-12 e O-13 não se repetem', () => {
  it('todo controle tocável tem semântica de botão', () => {
    const pressables = tela.match(/<Pressable/g) ?? [];
    const papeis = tela.match(/accessibilityRole="button"/g) ?? [];
    expect(pressables.length).toBeGreaterThan(0);
    // Cada Pressable da tela declara o papel; os demais botões vêm de
    // `AppButton`, que já o declara internamente.
    expect(papeis.length).toBeGreaterThanOrEqual(pressables.length);
  });

  it('controles sem texto visível têm rótulo acessível', () => {
    // As setas de semana são só ícone: sem rótulo, um leitor de tela anunciaria
    // "botão" e nada mais.
    expect(tela).toMatch(/accessibilityLabel="Semana anterior"/);
    expect(tela).toMatch(/accessibilityLabel="Próxima semana"/);
  });

  it('o erro de campo entra no rótulo do PRÓPRIO campo, não só abaixo dele', () => {
    expect(tela).toMatch(/accessibilityLabel=\{error \? `\$\{label\}\. Erro: \$\{error\}` : label\}/);
  });

  it('mensagens de bloqueio e de falha são anunciadas como alerta', () => {
    const alertas = tela.match(/accessibilityRole="alert"/g) ?? [];
    expect(alertas.length).toBeGreaterThanOrEqual(3);
  });

  it('alvos de toque respeitam o mínimo de 44 px', () => {
    // 375 px de largura é o alvo declarado; abaixo de 44 o toque erra.
    expect(tela).toMatch(/minWidth: 44, minHeight: 44/);
    expect(tela).toMatch(/minHeight: 44, borderWidth: 1/);
  });
});

describe('status nunca depende só de cor (§25)', () => {
  it('cada status tem cor, ícone e palavra', () => {
    for (const s of ['conforme', 'atencao', 'nao_conforme', 'sem_dado']) {
      const linha = new RegExp(`${s}:\\s*\\{[^}]*color:[^}]*icon:[^}]*\\}`);
      expect(tela, `status ${s} sem cor+ícone`).toMatch(linha);
    }
    // E a palavra vem de `describeStatus`, testada no domínio.
    expect(tela).toMatch(/describeStatus\(entry\.status\)/);
  });

  it('o resumo do cabeçalho também traz ícone e palavra, não só número colorido', () => {
    expect(tela).toMatch(/STATUS_VISUAL\[s\]\.icon/);
    expect(tela).toMatch(/describeStatus\(s\)/);
  });
});

describe('as quatro coisas que a tela precisa deixar claras', () => {
  it('diz que o resultado veio de fora, e de onde', () => {
    expect(tela).toMatch(/relatório oficial da operação/);
  });

  it('diz que a meta já estava configurada e não se edita aqui', () => {
    expect(tela).toMatch(/metas já estão configuradas pela região e não são editáveis/);
  });

  it('diz que o status foi calculado pelo AAPEx', () => {
    expect(tela).toMatch(/status é calculado pelo AAPEx/);
  });

  it('diz que o plano é obrigatório quando há desvio', () => {
    expect(tela).toMatch(/Obrigatório neste indicador: há desvio/);
  });

  it('usa a terminologia D8 e NÃO chama o ciclo de "auditoria semanal"', () => {
    expect(tela).not.toMatch(/auditoria semanal/i);
  });
});

describe('todos os estados obrigatórios do §25 estão implementados', () => {
  const estados = [
    'loading', 'unavailable', 'unauthorized', 'error', 'not-opened', 'no-catalog', 'closed',
  ];
  it.each(estados)('estado %s é tratado', (estado) => {
    expect(tela).toMatch(new RegExp(`'${estado}'`));
  });

  it('ciclo fechado é somente leitura — não há campo editável', () => {
    expect(tela).toMatch(/const readOnly = state\.kind === 'closed'/);
    expect(tela).toMatch(/readOnly \? \(/);
    // O botão de concluir não existe em ciclo fechado.
    expect(tela).toMatch(/\{!readOnly && \(/);
  });

  it('erro de ação é separado de erro de carga — falhar ao concluir não apaga a tela', () => {
    expect(tela).toMatch(/const \[actionError, setActionError\]/);
    expect(tela).toMatch(/const \[errorMessage, setErrorMessage\]/);
  });
});

describe('a tela não contorna a camada de repositório', () => {
  it('nenhuma chamada direta ao Supabase, a nenhuma tabela ou RPC', () => {
    expect(tela).not.toMatch(/supabase/i);
    expect(tela).not.toMatch(/\.rpc\(/);
    expect(tela).not.toMatch(/\.from\(/);
  });

  it('todo acesso passa pelo repositório injetado', () => {
    expect(tela).toMatch(/useRepositories\(\)/);
    for (const m of ['getCycle', 'openCycle', 'closeCycle', 'saveEntry', 'savePlan']) {
      expect(tela, `faltou usar ${m}`).toMatch(new RegExp(`assisted\\.${m}\\(`));
    }
  });

  it('a regra de status não é recalculada na tela — o servidor é a autoridade', () => {
    // A tela LÊ `entry.status`. Chamar `statusOf` aqui criaria uma segunda
    // verdade que divergiria da gravada no primeiro arredondamento.
    expect(tela).not.toMatch(/statusOf\(/);
  });
});
