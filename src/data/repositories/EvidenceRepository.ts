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

export class SupabaseEvidenceRepository implements EvidenceRepository {
  constructor(private readonly client: SupabaseClient) {}

  async store(input: EvidenceStoreInput): Promise<Result<Evidence>> {
    const invalid = validate(input);
    if (invalid) return err(invalid);
    const path = `${input.themeId}/${makeId('ev')}-${input.name}`;
    // Sobe o binário ao bucket privado (a política de acesso vive no servidor).
    const file = await fetch(input.uri).then((r) => r.blob()).catch(() => null);
    if (!file) return err(new AppError('storage/invalid-file', 'Não foi possível ler o arquivo local.'));
    const up = await this.client.storage.from(BUCKET).upload(path, file, { contentType: input.mimeType, upsert: false });
    if (up.error) return err(new AppError('network/unavailable', 'Falha ao enviar a evidência.', { cause: up.error }));
    const evidence: Evidence = {
      id: makeId('EVD'), themeId: input.themeId, name: input.name, uri: path, mimeType: input.mimeType,
      type: input.type, sizeBytes: input.sizeBytes, status: 'stored', createdAt: new Date().toISOString(),
    };
    return ok(evidence);
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
