/**
 * FASE 12-B — a ficha do parceiro NÃO escreve nada, e o caminho legado sumiu.
 *
 * POR QUE ESTE ARQUIVO EXISTE. No smoke de 02/08/2026 uma sessão de
 * administrador gravou uma Auditoria Semanal em PRODUÇÃO: `evaluations` 4→5,
 * respostas 48→64 e o primeiro `audit_log` que aquele banco já teve. A apuração
 * mostrou que **não foi a navegação** — foi o clique no botão "Checklist semanal
 * legado", que criava o rascunho **na hora, sem confirmação**, com um rótulo que
 * parecia navegação.
 *
 * A decisão do proprietário foi tirar o modelo legado de operação. Este arquivo
 * é a rede que impede o caminho de voltar por descuido:
 *
 *   1. os dois botões não existem mais na ficha;
 *   2. a tela não chama nada que escreva — nem direta, nem indiretamente;
 *   3. o histórico legado continua VISÍVEL, porque desligar não é apagar;
 *   4. a guarda de verdade é do servidor (0052), e a interface não é a guarda.
 *
 * PROVAS ESTÁTICAS, como o resto da pasta: a suíte roda em Node puro e telas
 * React Native não são montadas aqui. O que se verifica é o FONTE — que é onde
 * o defeito morava.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), 'utf8');

const detalhe = ler('src/screens/OperationDetailScreen.tsx');
const migration = ler('supabase/migrations/0052_legacy_cutover_and_purge.sql');

describe('os botões legados saíram da ficha do parceiro', () => {
  it('nenhum botão "Checklist semanal legado" ou "Checklist mensal legado"', () => {
    expect(detalhe).not.toMatch(/title="Checklist semanal legado"/);
    expect(detalhe).not.toMatch(/title="Checklist mensal legado"/);
  });

  it('a função que criava a avaliação não existe mais na tela', () => {
    expect(detalhe).not.toMatch(/function launch\s*\(/);
    expect(detalhe).not.toMatch(/void launch\(/);
  });

  it('a tela não importa mais nada que inicie avaliação', () => {
    expect(detalhe).not.toMatch(/\bstartEvaluation\b/);
    expect(detalhe).not.toMatch(/\bgetCurrentDraft\b/);
  });
});

describe('consultar a ficha não tem efeito colateral', () => {
  /**
   * O `useEffect` é o único lugar que roda sozinho ao abrir a tela. Se algum dia
   * alguém puser ali uma chamada que escreve, este caso fica vermelho — que é
   * exatamente o defeito de 02/08 tentando voltar.
   */
  const efeitos = detalhe.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\);/g) ?? [];

  it('a tela tem efeitos, e todos são de LEITURA', () => {
    expect(efeitos.length).toBeGreaterThan(0);
    const escritas = /start(Evaluation|Audit)|open(AssistedCycle|_assisted_cycle)|save[A-Z]|submit|create[A-Z]|delete[A-Z]|purge/;
    for (const efeito of efeitos) {
      expect(efeito).not.toMatch(escritas);
    }
  });

  it('os efeitos chamam apenas as duas consultas conhecidas', () => {
    const juntos = efeitos.join('\n');
    expect(juntos).toMatch(/getOperationPeople/);
    expect(juntos).toMatch(/listAudits/);
  });

  it('nada é iniciado no corpo do componente fora de um manipulador de evento', () => {
    // Tudo que navega ou age precisa estar atrás de `onPress`.
    const corpo = detalhe.slice(0, detalhe.indexOf('const styles ='));
    const acoes = corpo.match(/navigation\.navigate\(/g) ?? [];
    const gatilhos = corpo.match(/onPress=\{/g) ?? [];
    expect(acoes.length).toBeGreaterThan(0);
    expect(gatilhos.length).toBeGreaterThanOrEqual(acoes.length);
  });
});

describe('desligar não é apagar', () => {
  it('o histórico legado continua visível na ficha', () => {
    expect(detalhe).toMatch(/<SectionTitle title="Histórico legado recente"/);
  });

  it('a Gestão Assistida e a Auditoria Mensal continuam alcançáveis', () => {
    expect(detalhe).toMatch(/navigation\.navigate\('AssistedCycle'/);
    expect(detalhe).toMatch(/navigation\.navigate\('MonthlyAudit'/);
  });
});

describe('a guarda de verdade é do servidor, não da interface', () => {
  it('a 0052 recusa a abertura nas DUAS frequências', () => {
    expect(migration).toMatch(/modelo legado encerrado em/);
    // A guarda não pode voltar a olhar só `weekly`.
    expect(migration).not.toMatch(/if v_freq = 'weekly' then/);
  });

  it('a 0052 não apaga nada por si — o expurgo é RPC explícita', () => {
    // Os corpos de função saem PRIMEIRO. O `delete from public.evaluations` da
    // RPC é legítimo e esperado; o que não pode existir é DML de nível
    // superior, que rodaria só por aplicar a migration.
    const semCorpos = migration
      .replace(/\$([a-zA-Z_]*)\$[\s\S]*?\$\1\$/g, '\n<<CORPO>>\n')
      .replace(/--[^\n]*/g, '');
    expect(semCorpos).not.toMatch(/^\s*delete\s+from/im);
    expect(semCorpos).not.toMatch(/^\s*truncate/im);
    expect(semCorpos).not.toMatch(/^\s*drop\s+table/im);
    // E o `delete` existe, sim — dentro da função.
    expect(migration).toMatch(/delete from public\.evaluations;/);
    expect(migration).toMatch(/create or replace function public\.admin_purge_legacy_evaluations/);
  });

  it('o expurgo exige administrador e motivo', () => {
    expect(migration).toMatch(/apenas administrador executa o expurgo/);
    expect(migration).toMatch(/informe o motivo do expurgo/);
  });
});
