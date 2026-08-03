/**
 * PROVAS ESTÁTICAS da tela da Auditoria Mensal, e do caminho até ela.
 *
 * POR QUE ESTÁTICAS. A suíte roda em Node puro (ver `vitest.config.ts`): telas
 * React Native não são montadas aqui. As garantias abaixo — semântica de botão,
 * status nunca só por cor, erro associado ao campo, ausência de PDF fingido e
 * o caminho do O-12 — são todas verificáveis no FONTE, e é assim que o projeto
 * já as verifica em `performancePlanLink.test.ts` e `assistedCycleScreen.test.ts`.
 *
 * O que isto NÃO substitui: teste visual real, que é gate manual da sessão.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const tela = ler('src/screens/MonthlyAuditScreen.tsx');
const detalhe = ler('src/screens/OperationDetailScreen.tsx');
const navegacao = ler('src/navigation/AppNavigator.tsx');
const policy = ler('src/domain/monthlyAudit/policy.ts');

describe('caminho até a tela', () => {
  it('a rota existe no navegador e no contrato de parâmetros', () => {
    expect(navegacao).toMatch(/name="MonthlyAudit"/);
    expect(navegacao).toMatch(/MonthlyAuditScreen/);
    expect(ler('src/types/index.ts')).toMatch(/MonthlyAudit:\s*\{\s*operationId: string/);
  });

  it('Parceiros → parceiro → Auditoria Mensal é alcançável em um toque', () => {
    expect(detalhe).toMatch(/navigation\.navigate\('MonthlyAudit'/);
    expect(detalhe).toMatch(/title="Abrir competência atual"/);
  });

  it('os três blocos estão visualmente separados (Modelo Operacional §6)', () => {
    // Gestão Assistida · Auditoria Mensal · histórico semanal legado.
    expect(detalhe).toMatch(/<SectionTitle title="Gestão Assistida"/);
    expect(detalhe).toMatch(/<SectionTitle title="Auditoria Mensal"/);
    // REFORÇADO PELA FASE 10: a separação deixou de ser só um título e passou a
    // ser uma FAIXA com rótulo próprio e borda de cor distinta. Sem ela,
    // "Checklist semanal legado" e "Gestão Assistida" ficam a uma rolagem de
    // distância e parecem dois nomes para a mesma coisa.
    expect(detalhe).toMatch(/styles\.blocoAtual/);
    expect(detalhe).toMatch(/styles\.blocoLegado/);
    expect(detalhe).toMatch(/>Histórico semanal legado</);
    expect(detalhe).toMatch(/>Operação atual</);
  });

  it('a terminologia D8 é aplicada no detalhe do parceiro', () => {
    // "Relatório oficial da operação" é a FONTE EXTERNA. O bloco legado se
    // chama "histórico semanal legado", nunca "auditorias antigas".
    expect(detalhe).toMatch(/relatório oficial da operação \(fonte externa\)/);
    expect(detalhe).toMatch(/Histórico semanal legado/);
    expect(detalhe).not.toMatch(/auditorias antigas/i);
    // E o legado não se apresenta como "Auditoria semanal", que confundiria
    // com a Gestão Assistida.
    expect(detalhe).not.toMatch(/title="Auditoria semanal"/);
    // ATUALIZADO NA FASE 12-B (02/08/2026): o botão "Checklist semanal legado"
    // era exigido aqui enquanto o modelo legado estava em operação. Ele foi
    // REMOVIDO junto com o mensal, por decisão do proprietário — o cutover da
    // 0052 fecha as duas frequências no servidor. A terminologia que sobrevive
    // é a do HISTÓRICO, que continua visível e somente leitura.
    // A ausência dos botões é medida em `legacyCheckoutRemoved.test.ts`.
    expect(detalhe).not.toMatch(/title="Checklist semanal legado"/);
    expect(detalhe).not.toMatch(/title="Checklist mensal legado"/);
  });

  it('O-12 no bloco LEGADO: todo item listado tem ação, inclusive o aprovado', () => {
    // Antes, só rascunho e devolvida tinham botão — uma avaliação aprovada
    // ficava listada sem rota, que é exatamente o padrão do achado.
    expect(detalhe).toMatch(/title=\{\s*evaluation\.status === 'returned' \? 'Corrigir'/);
    expect(detalhe).toMatch(/: 'Ver avaliação'/);
    expect(detalhe).not.toMatch(/\['draft', 'returned'\]\.includes\(evaluation\.status\) &&/);
  });
});

describe('O-12 — a auditoria aprovada é alcançável', () => {
  it('todo item listado tem rota de abertura', () => {
    // O achado nasceu de um cartão aprovado que não levava a lugar nenhum.
    expect(detalhe).toMatch(/monthlyAudits\.map/);
    expect(detalhe).toMatch(/navigation\.navigate\('MonthlyAudit', \{\s*operationId: activeOperation\.id, competence: m\.competence/);
  });

  it('a aprovada recebe a ação explícita "Ver auditoria"', () => {
    expect(detalhe).toMatch(/m\.status === 'approved' \? 'Ver auditoria' : 'Continuar'/);
  });

  it('a ação é um AppButton — Pressable com role, foco e alvo de 48 px', () => {
    // `AppButton` declara `accessibilityRole="button"` e `minHeight: 48`; usá-lo
    // é o que impede repetir o O-13, em que o controle não tinha semântica.
    const componente = ler('src/components/AppButton.tsx');
    expect(componente).toMatch(/accessibilityRole="button"/);
    expect(componente).toMatch(/minHeight: 48/);
    expect(detalhe).toMatch(/<AppButton\s+title=\{m\.status === 'approved'/);
  });

  it('a tela de detalhe mostra snapshot, critérios, respostas, evidências, planos e aprovador', () => {
    expect(tela).toMatch(/Aprovada por \{current\.validatorName/);
    expect(tela).toMatch(/criterion\.answer\.evidences/);
    expect(tela).toMatch(/criterion\.answer\.plans\.map/);
    expect(tela).toMatch(/describeCompetence\(competence\)/);
    expect(tela).toMatch(/snapshot oficial imutável/);
  });
});

describe('o novo PDF existe, e SÓ para auditoria aprovada', () => {
  // ATUALIZADO PELA FASE 10 (A-05 congelada em 02/08/2026). Este bloco media a
  // ausência deliberada do botão; passa a medir a PRESENÇA CONDICIONAL dele.
  // A propriedade de fundo é a mesma: nunca oferecer um botão que produziria
  // documento incompatível — antes porque o formato não existia, agora porque
  // a auditoria pode não estar aprovada.

  it('o botão gera o Relatório Oficial da Auditoria Mensal', () => {
    expect(tela).toMatch(/title="Gerar Relatório Oficial da Auditoria Mensal"/);
    expect(tela).toMatch(/exportarRelatorioMensal\(/);
    expect(tela).toMatch(/renderMonthlyAuditReportPdf/);
  });

  it('a CHAMADA do botão vive dentro do bloco `approved`, e em nenhum outro', () => {
    // A função é declarada junto com as outras ações, no topo do componente; o
    // que precisa estar confinado é o ponto de CHAMADA. Fora de `approved` o
    // servidor recusaria (0051), e a interface espelha a regra em vez de
    // oferecer o que será negado.
    const chamadas = [...tela.matchAll(/onPress=\{\(\) => void exportarPdf\(/g)];
    expect(chamadas).toHaveLength(1);
    const i = tela.indexOf('{approved && (');
    expect(i).toBeGreaterThan(0);
    expect(chamadas[0].index!).toBeGreaterThan(i);
  });

  it('a terminologia D8 é aplicada: o PDF do AAPEx não é a fonte externa', () => {
    expect(tela).toMatch(/Relatório Oficial da Auditoria Mensal/);
    expect(tela).toMatch(/relatório oficial da operação/);
  });

  it('o sucesso e a falha da exportação são ANUNCIADOS', () => {
    expect(tela).toMatch(/exportOk/);
    expect(tela).toMatch(/accessibilityLiveRegion="polite"/);
  });

  it('a REPORT_FORMAT_VERSION legada não é reutilizada', () => {
    expect(tela).not.toMatch(/1\.3\.3/);
    expect(tela).not.toMatch(/REPORT_FORMAT_VERSION/);
  });

  it('nenhuma pendência fechada continua anunciada na tela', () => {
    expect(tela).not.toMatch(/A-05|A-10/);
  });
});

describe('acessibilidade — os achados O-12 e O-13 não se repetem', () => {
  it('todo controle tocável tem semântica declarada', () => {
    const pressables = tela.match(/<Pressable/g) ?? [];
    const papeis = tela.match(/accessibilityRole="(button|radio)"/g) ?? [];
    expect(pressables.length).toBeGreaterThan(0);
    expect(papeis.length).toBeGreaterThanOrEqual(pressables.length);
  });

  it('as três respostas são um grupo de escolha, com estado anunciado', () => {
    expect(tela).toMatch(/accessibilityRole="radio"/);
    expect(tela).toMatch(/accessibilityState=\{\{ selected, disabled \}\}/);
    // N/A desabilitado onde o critério não o admite — e o motivo é do domínio.
    expect(tela).toMatch(/s === 'nao_aplicavel' && !criterion\.allowsNa/);
  });

  it('controles sem texto visível têm rótulo acessível', () => {
    expect(tela).toMatch(/accessibilityLabel="Competência anterior"/);
    expect(tela).toMatch(/accessibilityLabel="Próxima competência"/);
  });

  it('o erro de campo entra no rótulo do PRÓPRIO campo', () => {
    expect(tela).toMatch(/accessibilityLabel=\{error \? `\$\{label\}\. Erro: \$\{error\}` : label\}/);
  });

  it('mensagens de bloqueio e falha são anunciadas como alerta', () => {
    const alertas = tela.match(/accessibilityRole="alert"/g) ?? [];
    expect(alertas.length).toBeGreaterThanOrEqual(3);
  });

  it('alvos de toque respeitam o mínimo de 44 px', () => {
    expect(tela).toMatch(/minWidth: 44, minHeight: 44/);
    expect(tela).toMatch(/minHeight: 44, borderWidth: 1/);
    // A escolha de resposta também — é o controle mais tocado da tela.
    expect(tela).toMatch(/minHeight: 44, paddingHorizontal: spacing\.md/);
  });
});

describe('status nunca depende só de cor', () => {
  it('cada status tem cor, ícone e palavra', () => {
    for (const s of ['conforme', 'nao_conforme', 'nao_aplicavel', 'nao_avaliado']) {
      expect(tela, `status ${s} sem cor+ícone`)
        .toMatch(new RegExp(`${s}:\\s*\\{[^}]*color:[^}]*icon:[^}]*\\}`));
    }
    expect(tela).toMatch(/describeAnswerStatus\(criterion\.answer\.status\)/);
  });

  it('o resumo do cabeçalho também traz ícone e palavra', () => {
    expect(tela).toMatch(/STATUS_VISUAL\[s\]\.icon/);
    expect(tela).toMatch(/describeAnswerStatus\(s\)/);
  });
});

describe('a tela diz o que precisa dizer', () => {
  // As expressões toleram quebra de linha: o texto está dentro de JSX e o
  // prettier o reparte onde couber. Casar por `\s+` mede o que a tela DIZ, e
  // não como o arquivo foi formatado.
  it('explica que a pergunta é de PROCESSO, não de resultado', () => {
    expect(tela).toMatch(/existe,\s+está\s+implantado\s+e\s+é\s+executado/);
    expect(tela).toMatch(/não\s+qual\s+foi\s+o\s+número/);
  });

  it('diz que os critérios foram congelados no início da competência', () => {
    expect(tela).toMatch(/não mudam com o catálogo|não mudam mais/);
  });

  it('diz que a nota é PROVISÓRIA, e não a chama de Índice', () => {
    expect(tela).toMatch(/proporção\s+simples,\s+sem\s+ponderação/);
    expect(tela).toMatch(/regra\s+de\s+pontuação\s+definitiva\s+ainda\s+não\s+foi\s+decidida/);
    expect(tela).not.toMatch(/Índice de excelência/);
  });

  it('usa a terminologia D8 e não confunde com a Gestão Assistida', () => {
    expect(tela).toMatch(/Auditoria Mensal/);
    expect(tela).not.toMatch(/auditoria semanal/i);
  });
});

describe('a tela não contorna a camada de repositório', () => {
  it('nenhuma chamada direta ao Supabase', () => {
    expect(tela).not.toMatch(/supabase/i);
    expect(tela).not.toMatch(/\.rpc\(/);
    expect(tela).not.toMatch(/\.from\(/);
  });

  it('todo acesso passa pelo repositório injetado', () => {
    expect(tela).toMatch(/useRepositories\(\)/);
    for (const m of ['getAudit', 'startAudit', 'saveAnswer', 'savePlan', 'submitAudit']) {
      expect(tela, `faltou usar ${m}`).toMatch(new RegExp(`monthlyAudit\\.${m}\\(`));
    }
  });

  it('a nota não é recalculada na tela — o servidor é a autoridade', () => {
    expect(tela).not.toMatch(/monthlyScore\(/);
    expect(tela).toMatch(/current\.score/);
  });
});

describe('todos os estados obrigatórios estão implementados', () => {
  const screenState = ler('src/domain/monthlyAudit/screenState.ts');
  const estados = [
    'loading', 'unavailable', 'unauthorized', 'error',
    'not-started', 'no-criteria', 'editable', 'submitted', 'approved',
  ];

  it.each(estados)('o estado %s existe no domínio', (estado) => {
    expect(screenState).toMatch(new RegExp(`'${estado}'`));
  });

  it('a tela ramifica em todos os que pedem tratamento visual próprio', () => {
    for (const estado of ['loading', 'unavailable', 'unauthorized', 'error',
      'not-started', 'no-criteria', 'approved']) {
      expect(tela, `tela não trata ${estado}`).toMatch(new RegExp(`'${estado}'`));
    }
  });

  it('enviada e aprovada são somente leitura, e uma é distinguida da outra', () => {
    expect(tela).toMatch(/const readOnly = !isEditable\(current\)/);
    expect(tela).toMatch(/\{!readOnly && \(/);
    // `submitted` é o ramo "somente leitura MAS ainda não aprovada": tem texto
    // próprio, dizendo que a devolução reabre.
    expect(tela).toMatch(/\{readOnly && !approved && \(/);
    expect(tela).toMatch(/Se for devolvida, ela reabre/);
  });

  it('erro de ação é separado de erro de carga', () => {
    expect(tela).toMatch(/const \[actionError, setActionError\]/);
    expect(tela).toMatch(/const \[errorMessage, setErrorMessage\]/);
  });
});

describe('o espelho de domínio não inventa regra', () => {
  it('a pontuação se declara provisória e cita A-10', () => {
    expect(policy).toMatch(/A-10-pendente/);
    expect(policy).toMatch(/Não é ponderação e não é o Índice de Excelência/);
  });

  it('a justificativa útil usa o mesmo limiar do servidor', () => {
    expect(policy).toMatch(/\.length >= 10/);
  });
});
