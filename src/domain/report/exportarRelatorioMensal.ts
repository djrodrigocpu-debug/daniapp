/**
 * ORDEM da exportação do **Relatório Oficial da Auditoria Mensal** (AAPEx 1.3.5).
 *
 * Módulo PURO, no mesmo desenho de `exportarRelatorioOficial`: as peças de
 * plataforma (rede, PDF, download, compartilhamento) entram como dependências,
 * e o que fica aqui — testável — é a SEQUÊNCIA e o que cada falha significa.
 *
 * A ordem importa pelos mesmos dois motivos do relatório legado:
 *
 *   1. **A trilha só é escrita depois da entrega.** Registrar antes produziria
 *      um evento de exportação para documentos que falharam na geração ou que o
 *      usuário nunca recebeu. Trilha que afirma o que não aconteceu é pior do
 *      que trilha nenhuma.
 *
 *   2. **A falha do registro não derruba a entrega.** O documento já está na
 *      mão do usuário quando o registro é tentado; devolver erro ali faria a
 *      tela mentir sobre um download que ocorreu.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM MÓDULO PRÓPRIO, E NÃO UM PARÂMETRO NO LEGADO
 * ---------------------------------------------------------------------------
 * As CAUSAS DE FALHA são diferentes, e é isso que o usuário lê. O legado recusa
 * por *"ainda não validada"*; o mensal recusa por *"não aprovada"* e também por
 * *"esta auditoria segue o modelo legado"* — que no legado não existe. Um
 * dicionário de mensagens compartilhado teria entradas mortas de um lado e
 * faltando do outro.
 */
import {
  MonthlyAuditReportInput, MonthlyAuditReportModel, buildMonthlyAuditReportModel,
} from './monthlyAuditReport';

/** Causas distintas, porque cada uma pede uma ação diferente do usuário. */
export type MotivoDaFalhaMensal =
  | 'nao-aprovada'
  | 'modelo-legado'
  | 'sem-snapshot'
  | 'acesso-negado'
  | 'dados'
  | 'conteudo'
  | 'geracao'
  | 'salvamento'
  | 'compartilhamento-indisponivel';

export type ResultadoDosDadosMensal =
  | { ok: true; value: MonthlyAuditReportInput }
  | { ok: false; motivo: MotivoDaFalhaMensal; message: string };

export type ResultadoDaEntregaMensal =
  | { ok: true; via: 'download' | 'compartilhamento' }
  | { ok: false; motivo: 'salvamento' | 'compartilhamento-indisponivel'; message: string };

export interface DependenciasDaExportacaoMensal {
  /** Busca os dados autorizados no servidor (RPC 0051). */
  obterDados: () => Promise<ResultadoDosDadosMensal>;
  /** Desenha o PDF. Pode lançar; a falha vira 'geracao'. */
  renderizar: (modelo: MonthlyAuditReportModel) => Uint8Array;
  /** Entrega o arquivo pela plataforma (download no web, partilha no nativo). */
  entregar: (bytes: Uint8Array, fileName: string) => Promise<ResultadoDaEntregaMensal>;
  /** Registra a exportação bem-sucedida. Falha aqui NÃO invalida a entrega. */
  registrar: (dados: {
    evaluationId: string; snapshotId: string; reportVersion: string; integrityCode: string;
  }) => Promise<boolean>;
}

export type ResultadoDaExportacaoMensal =
  | {
    ok: true;
    via: 'download' | 'compartilhamento';
    fileName: string;
    integrityCode: string;
    /** `false` quando o documento saiu mas a trilha não registrou. */
    registrado: boolean;
  }
  | { ok: false; motivo: MotivoDaFalhaMensal; message: string };

/** Mensagens apresentáveis — sem stack, SQL, UUID, caminho ou token. */
export const MENSAGENS_MENSAL: Record<MotivoDaFalhaMensal, string> = {
  'nao-aprovada':
    'Esta Auditoria Mensal ainda não foi aprovada. O relatório oficial só é emitido depois da aprovação.',
  'modelo-legado':
    'Esta auditoria segue o modelo legado e tem um relatório próprio, com formato diferente.',
  'sem-snapshot':
    'O registro oficial desta Auditoria Mensal não foi encontrado. Procure a coordenação antes de emitir o relatório.',
  'acesso-negado':
    'Você não tem acesso a esta Auditoria Mensal.',
  dados:
    'Não foi possível obter os dados da Auditoria Mensal. Verifique a conexão e tente novamente.',
  conteudo:
    'Os dados da Auditoria Mensal vieram incompletos e o relatório oficial não pôde ser montado.',
  geracao:
    'Não foi possível gerar o arquivo do relatório.',
  salvamento:
    'O relatório foi gerado, mas não foi possível salvá-lo neste dispositivo.',
  'compartilhamento-indisponivel':
    'O relatório foi gerado, mas este dispositivo não oferece uma forma de compartilhar ou salvar o arquivo.',
};

export async function exportarRelatorioMensal(
  deps: DependenciasDaExportacaoMensal,
): Promise<ResultadoDaExportacaoMensal> {
  // (1) DADOS — o servidor decide o acesso; aqui só se traduz a recusa.
  const dados = await deps.obterDados();
  if (!dados.ok) return { ok: false, motivo: dados.motivo, message: dados.message };

  // (2) MODELO — ordena, agrupa e calcula o código de integridade.
  //     `generatedAt` já vem do servidor, e fica FORA do código.
  let modelo: MonthlyAuditReportModel;
  try {
    modelo = buildMonthlyAuditReportModel(dados.value);
  } catch {
    return { ok: false, motivo: 'conteudo', message: MENSAGENS_MENSAL.conteudo };
  }
  if (!modelo.integrity.fullCode) {
    return { ok: false, motivo: 'conteudo', message: MENSAGENS_MENSAL.conteudo };
  }

  // (3) PDF.
  let bytes: Uint8Array;
  try {
    bytes = deps.renderizar(modelo);
  } catch {
    return { ok: false, motivo: 'geracao', message: MENSAGENS_MENSAL.geracao };
  }
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, motivo: 'geracao', message: MENSAGENS_MENSAL.geracao };
  }

  // (4) ENTREGA.
  const entrega = await deps.entregar(bytes, modelo.fileName);
  if (!entrega.ok) return { ok: false, motivo: entrega.motivo, message: entrega.message };

  // (5) TRILHA — depois da entrega, e sem poder derrubá-la.
  let registrado = false;
  try {
    registrado = await deps.registrar({
      evaluationId: dados.value.identity.evaluationId,
      snapshotId: dados.value.identity.snapshotId,
      reportVersion: modelo.integrity.formatVersion,
      integrityCode: modelo.integrity.fullCode,
    });
  } catch {
    registrado = false;
  }

  return {
    ok: true,
    via: entrega.via,
    fileName: modelo.fileName,
    integrityCode: modelo.integrity.fullCode,
    registrado,
  };
}

/**
 * Traduz a recusa do servidor em causa.
 *
 * As frases vêm das exceções da migration 0051 e são estáveis. Qualquer coisa
 * fora delas vira `dados`, e **nunca** é repassada crua: a mensagem do servidor
 * pode carregar nome de função, coluna ou identificador.
 */
export function motivoDoErroMensal(mensagemDoServidor: string): MotivoDaFalhaMensal {
  const m = String(mensagemDoServidor ?? '').toLowerCase();
  if (m.includes('fora do escopo') || m.includes('inexistente')
    || m.includes('insufficient_privilege') || m.includes('permission denied')) {
    return 'acesso-negado';
  }
  if (m.includes('modelo legado')) return 'modelo-legado';
  if (m.includes('nao esta aprovada') || m.includes('não está aprovada')) return 'nao-aprovada';
  if (m.includes('sem snapshot oficial')) return 'sem-snapshot';
  return 'dados';
}
