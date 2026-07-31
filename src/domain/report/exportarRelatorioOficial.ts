/**
 * ORDEM da exportação do Relatório Oficial de Auditoria (AAPEx 1.3.3).
 *
 * Módulo PURO, no mesmo desenho de `domain/evidence/abrirEvidencia`: as peças
 * de plataforma (rede, PDF, download, compartilhamento) entram como
 * dependências, e o que fica aqui — testável — é a SEQUÊNCIA e o que cada
 * falha significa.
 *
 * A ordem importa por dois motivos concretos:
 *
 *   1. A TRILHA SÓ É ESCRITA DEPOIS DA ENTREGA. Registrar antes produziria
 *      `evaluation.report_exported` para exportações que falharam na geração ou
 *      que o usuário nunca recebeu — uma trilha que afirma o que não aconteceu
 *      é pior do que trilha nenhuma.
 *
 *   2. A FALHA DO REGISTRO NÃO DERRUBA A ENTREGA. O documento já está na mão do
 *      usuário quando o registro é tentado; devolver erro nesse ponto faria a
 *      tela mentir sobre um download que ocorreu. A falha é reportada como
 *      sucesso COM ressalva.
 */
import { buildOfficialAuditReportModel, OfficialAuditReportInput, OfficialAuditReportModel } from './officialAuditReport';

/** Causas distintas, porque cada uma pede uma ação diferente do usuário. */
export type MotivoDaFalha =
  | 'nao-validada'
  | 'sem-snapshot'
  | 'acesso-negado'
  | 'dados'
  | 'conteudo'
  | 'geracao'
  | 'salvamento'
  | 'compartilhamento-indisponivel';

export type ResultadoDosDados =
  | { ok: true; value: OfficialAuditReportInput }
  | { ok: false; motivo: MotivoDaFalha; message: string };

export type ResultadoDaEntrega =
  | { ok: true; via: 'download' | 'compartilhamento' }
  | { ok: false; motivo: 'salvamento' | 'compartilhamento-indisponivel'; message: string };

export interface DependenciasDaExportacao {
  /** Busca os dados autorizados no servidor (RPC 0035). */
  obterDados: () => Promise<ResultadoDosDados>;
  /** Instante da geração — injetado para o modelo continuar puro. */
  agora: () => string;
  /** Desenha o PDF. Pode lançar; a falha vira 'geracao'. */
  renderizar: (modelo: OfficialAuditReportModel) => Uint8Array;
  /** Entrega o arquivo pela plataforma (download no web, partilha no nativo). */
  entregar: (bytes: Uint8Array, fileName: string) => Promise<ResultadoDaEntrega>;
  /** Registra a exportação bem-sucedida. Falha aqui NÃO invalida a entrega. */
  registrar: (dados: {
    evaluationId: string; snapshotId: string; reportVersion: string; integrityCode: string;
  }) => Promise<boolean>;
}

export type ResultadoDaExportacao =
  | {
    ok: true;
    via: 'download' | 'compartilhamento';
    fileName: string;
    integrityCode: string;
    /** false quando o documento saiu mas a trilha não registrou. */
    registrado: boolean;
  }
  | { ok: false; motivo: MotivoDaFalha; message: string };

/** Mensagens apresentáveis — sem stack, SQL, UUID, caminho ou token. */
export const MENSAGENS: Record<MotivoDaFalha, string> = {
  'nao-validada':
    'Esta auditoria ainda não foi validada oficialmente. O relatório oficial só é emitido depois da validação.',
  'sem-snapshot':
    'O registro oficial desta auditoria não foi encontrado. Procure a coordenação antes de emitir o relatório.',
  'acesso-negado':
    'Você não tem acesso a esta auditoria.',
  dados:
    'Não foi possível obter os dados da auditoria. Verifique a conexão e tente novamente.',
  conteudo:
    'Os dados da auditoria vieram incompletos e o relatório oficial não pôde ser montado.',
  geracao:
    'Não foi possível gerar o arquivo do relatório.',
  salvamento:
    'O relatório foi gerado, mas não foi possível salvá-lo neste dispositivo.',
  'compartilhamento-indisponivel':
    'O relatório foi gerado, mas este dispositivo não oferece uma forma de compartilhar ou salvar o arquivo.',
};

export async function exportarRelatorioOficial(
  deps: DependenciasDaExportacao,
): Promise<ResultadoDaExportacao> {
  // (1) DADOS — o servidor decide o acesso; aqui só se traduz a recusa.
  const dados = await deps.obterDados();
  if (!dados.ok) return { ok: false, motivo: dados.motivo, message: dados.message };

  // (2) MODELO — separa oficial de atual e calcula o código de integridade.
  const modelo = buildOfficialAuditReportModel(dados.value, deps.agora());
  if (!modelo.ok) return { ok: false, motivo: 'conteudo', message: MENSAGENS.conteudo };

  // (3) PDF.
  let bytes: Uint8Array;
  try {
    bytes = deps.renderizar(modelo.value);
  } catch {
    return { ok: false, motivo: 'geracao', message: MENSAGENS.geracao };
  }
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, motivo: 'geracao', message: MENSAGENS.geracao };
  }

  // (4) ENTREGA.
  const entrega = await deps.entregar(bytes, modelo.value.fileName);
  if (!entrega.ok) return { ok: false, motivo: entrega.motivo, message: entrega.message };

  // (5) TRILHA — depois da entrega, e sem poder derrubá-la.
  let registrado = false;
  try {
    registrado = await deps.registrar({
      evaluationId: dados.value.evaluationId,
      snapshotId: dados.value.snapshotId,
      reportVersion: modelo.value.integrity.reportVersion,
      integrityCode: modelo.value.integrity.fullCode,
    });
  } catch {
    registrado = false;
  }

  return {
    ok: true,
    via: entrega.via,
    fileName: modelo.value.fileName,
    integrityCode: modelo.value.integrity.fullCode,
    registrado,
  };
}

/**
 * Traduz a recusa do servidor em causa. As mensagens vêm das exceções da
 * migration 0035 e são estáveis; qualquer coisa fora delas é tratada como
 * falha de dados, e NUNCA repassada crua ao usuário — a mensagem do servidor
 * pode carregar nome de função, coluna ou identificador.
 */
export function motivoDoErroDoServidor(mensagemDoServidor: string): MotivoDaFalha {
  const m = String(mensagemDoServidor ?? '').toLowerCase();
  if (m.includes('fora do escopo') || m.includes('inexistente')
    || m.includes('insufficient_privilege') || m.includes('permission denied')) {
    return 'acesso-negado';
  }
  if (m.includes('ainda nao foi validada') || m.includes('ainda não foi validada')) return 'nao-validada';
  if (m.includes('snapshot oficial nao encontrado') || m.includes('snapshot oficial não encontrado')) {
    return 'sem-snapshot';
  }
  return 'dados';
}
