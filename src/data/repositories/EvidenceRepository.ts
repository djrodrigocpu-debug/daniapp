/**
 * Repositório de Evidências (Masterplan §12). Abstrai o ARMAZENAMENTO da evidência
 * (o vínculo com o item da auditoria fica no EvaluationsRepository).
 *
 *  - LocalEvidenceRepository  → REAL LOCAL: persiste metadados + URI local do
 *    arquivo, status 'local'. NUNCA trata a URI temporária como armazenamento
 *    definitivo — apenas marca que a evidência ainda não subiu ao Storage.
 *  - SupabaseEvidenceRepository → REAL REMOTO (pronto para conexão): sobe ao
 *    bucket privado, marca 'stored' e emite URL assinada de curta duração. Não
 *    exercitado sem Supabase provisionado (BLOQUEADO PARA AMBIENTE REMOTO).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Evidence } from '../../types';
import { Result, ok, err } from '../../domain/errors/result';
import { AppError } from '../../domain/errors/AppError';
import { makeId } from '../../utils/ids';
import { LocalStore, localStore } from '../store/localStore';

/** Resposta de `reserve_evidence_upload` (0028). */
interface Reserva { reservationId: string; bucket: string; path: string; name: string }

/** Lê os bytes do arquivo escolhido. Injetável para teste. */
export type LeitorDeBytes = (uri: string) => Promise<Uint8Array>;

/**
 * O leitor real depende de `react-native` (Platform) e do `expo-file-system`,
 * que não importam em Node — daí a carga tardia, mesmo padrão já usado no
 * caminho nativo do próprio leitor. Assim o repositório continua testável fora
 * do bundler sem que ninguém precise dublar o React Native inteiro.
 */
const leitorPadrao: LeitorDeBytes = async (uri) => {
  const { readBytesFromUri } = await import('../../utils/readDocumentBytes');
  return readBytesFromUri(uri);
};

/**
 * A mensagem do PostgreSQL é escrita para o usuário final ("tipo de arquivo nao
 * permitido: use imagem ou PDF"), então vale mais que um texto genérico. Sem
 * mensagem, cai num texto neutro — nunca expõe detalhe de infraestrutura.
 */
function mensagemDoServidor(error: { message?: string } | null): string {
  const bruta = error?.message?.trim();
  return bruta && bruta.length > 0 && bruta.length < 200
    ? bruta
    : 'Não foi possível anexar a evidência.';
}

export type EvidenceStoreInput = {
  themeId: string;
  name: string;
  uri: string;
  mimeType?: string;
  type: 'photo' | 'document';
  sizeBytes?: number;
};

export interface EvidenceRepository {
  /** Persiste a evidência e retorna o registro com status. */
  store(input: EvidenceStoreInput): Promise<Result<Evidence>>;
  remove(evidenceId: string): Promise<Result<true>>;
  /** URL para visualização autorizada (local: a própria URI; remoto: assinada). */
  getUrl(evidenceId: string, ttlSeconds?: number): Promise<Result<string>>;
}

const BUCKET = 'evidencias';
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = ['image/', 'application/pdf'];

function validate(input: EvidenceStoreInput): AppError | null {
  if (input.sizeBytes && input.sizeBytes > MAX_BYTES) {
    return new AppError('storage/invalid-file', 'Arquivo acima de 15 MB.', { severity: 'medium' });
  }
  if (input.mimeType && !ALLOWED.some((p) => input.mimeType!.startsWith(p))) {
    return new AppError('storage/invalid-file', 'Tipo de arquivo não permitido (imagem ou PDF).', { severity: 'medium' });
  }
  return null;
}

export class LocalEvidenceRepository implements EvidenceRepository {
  constructor(private readonly db: LocalStore = localStore) {}

  async store(input: EvidenceStoreInput): Promise<Result<Evidence>> {
    const invalid = validate(input);
    if (invalid) return err(invalid);
    const evidence: Evidence = {
      id: makeId('EVD'),
      themeId: input.themeId,
      name: input.name,
      uri: input.uri,
      mimeType: input.mimeType,
      type: input.type,
      sizeBytes: input.sizeBytes,
      // REAL LOCAL: guardada no dispositivo, ainda não no Storage remoto.
      status: 'local',
      createdAt: new Date().toISOString(),
    };
    this.db.update((prev) => ({ ...prev, evidences: [evidence, ...prev.evidences] }));
    return ok(evidence);
  }

  async remove(evidenceId: string): Promise<Result<true>> {
    this.db.update((prev) => ({ ...prev, evidences: prev.evidences.filter((e) => e.id !== evidenceId) }));
    return ok(true);
  }

  async getUrl(evidenceId: string): Promise<Result<string>> {
    const evidence = this.db.getSnapshot().evidences.find((e) => e.id === evidenceId);
    if (!evidence) return err('validation/invalid-input', 'Evidência não encontrada.');
    return ok(evidence.uri); // URI local do arquivo.
  }
}

/**
 * REAL REMOTO. O anexo de evidência acontece em três passos, porque Storage e
 * PostgreSQL não compartilham transação (D-02 — ver o cabeçalho da migration
 * 0028):
 *
 *   1. `reserve_evidence_upload` — o SERVIDOR valida e devolve o caminho;
 *   2. upload do binário exatamente naquele caminho, com o JWT do usuário;
 *   3. `confirm_evidence_upload` — o servidor confere que o objeto existe e só
 *      então cria metadata e vínculo, na mesma transação.
 *
 * Qualquer falha compensa o que já foi feito e devolve erro. Nunca há sucesso
 * na tela sem arquivo no bucket: antes desta correção o caminho oficial nem
 * sequer subia o binário, e ainda assim dizia "enviado".
 */
export class SupabaseEvidenceRepository implements EvidenceRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly lerBytes: LeitorDeBytes = leitorPadrao,
  ) {}

  /**
   * Anexa a evidência a um item de uma avaliação, de ponta a ponta.
   * É o ÚNICO caminho de criação de evidência no modo corporativo.
   */
  async attach(evaluationId: string, themeId: string, input: EvidenceStoreInput): Promise<Result<Evidence>> {
    const invalid = validate(input);
    if (invalid) return err(invalid);

    // Os bytes são lidos ANTES de reservar: se o arquivo não pode ser lido, nada
    // é criado no servidor. O tamanho que vale é o real, não o informado pelo
    // seletor — é ele que o servidor valida e grava no metadata.
    let bytes: Uint8Array;
    try {
      bytes = await this.lerBytes(input.uri);
    } catch (cause) {
      return err(new AppError('storage/invalid-file', 'Não foi possível ler o arquivo selecionado.', { cause }));
    }
    if (bytes.byteLength === 0) {
      return err(new AppError('storage/invalid-file', 'O arquivo selecionado está vazio.', { severity: 'medium' }));
    }

    const mimeType = input.mimeType ?? 'application/octet-stream';
    const reserved = await this.client.rpc('reserve_evidence_upload', {
      p_evaluation_id: evaluationId,
      p_theme_id: themeId,
      p_input: { name: input.name, mimeType, sizeBytes: bytes.byteLength },
    });
    if (reserved.error || !reserved.data) {
      return err(new AppError('storage/invalid-file', mensagemDoServidor(reserved.error), { cause: reserved.error }));
    }
    const { reservationId, bucket, path } = reserved.data as Reserva;

    // `upsert: false`: um caminho reservado é gravado uma única vez.
    const up = await this.client.storage.from(bucket).upload(path, bytes, { contentType: mimeType, upsert: false });
    if (up.error) {
      // Compensação: o binário não subiu, então a reserva não pode continuar
      // autorizando escrita naquele caminho.
      await this.descartar(reservationId);
      return err(new AppError('network/unavailable', 'Falha ao enviar a evidência. Tente novamente.', { cause: up.error }));
    }

    const confirmed = await this.client.rpc('confirm_evidence_upload', { p_reservation_id: reservationId });
    if (confirmed.error || !confirmed.data) {
      // Compensação inversa: o objeto subiu mas não virou evidência, então ele
      // não pode ficar no bucket sem metadata.
      const limpou = await this.client.storage.from(bucket).remove([path]);
      await this.descartar(reservationId);
      return err(new AppError('network/unavailable', 'A evidência não pôde ser registrada.', {
        cause: confirmed.error,
        severity: 'high',
        // Sinaliza resíduo para diagnóstico, sem expor caminho nem segredo.
        details: { residuoNoArmazenamento: limpou.error != null },
      }));
    }
    return ok(confirmed.data as Evidence);
  }

  /** Compensação silenciosa: já estamos devolvendo erro ao chamador. */
  private async descartar(reservationId: string): Promise<void> {
    await this.client.rpc('discard_evidence_reservation', { p_reservation_id: reservationId });
  }

  /**
   * Sem a avaliação de destino não há como criar evidência íntegra: o caminho e
   * o vínculo dependem dela. Mantido só para satisfazer o contrato compartilhado
   * com o modo local — o caminho corporativo é `attach`.
   */
  async store(): Promise<Result<Evidence>> {
    return err(new AppError('validation/invalid-input',
      'Evidência corporativa exige a avaliação de destino: use attach().'));
  }

  async remove(evidenceId: string): Promise<Result<true>> {
    const { error } = await this.client.rpc('remove_evidence_file', { p_evidence_id: evidenceId });
    return error ? err(new AppError('network/unavailable', 'Falha ao remover a evidência.', { cause: error })) : ok(true);
  }

  async getUrl(evidenceId: string, ttlSeconds = 300): Promise<Result<string>> {
    // Resolve o path e emite URL assinada de curta duração (§12).
    const { data, error } = await this.client.rpc('evidence_path', { p_evidence_id: evidenceId });
    if (error || !data) return err(new AppError('network/unavailable', 'Falha ao localizar a evidência.', { cause: error }));
    const signed = await this.client.storage.from(BUCKET).createSignedUrl(String(data), ttlSeconds);
    if (signed.error) return err(new AppError('network/unavailable', 'Falha ao gerar URL de acesso.', { cause: signed.error }));
    return ok(signed.data.signedUrl);
  }
}
