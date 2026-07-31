/**
 * Fluxo de anexo de evidência no modo corporativo (D-02).
 *
 * O defeito não era o upload em si: era o upload não estar no caminho. A tela
 * chamava uma RPC que criava metadata 'stored' e o vínculo, e nenhum byte subia
 * — a interface anunciava "enviado" sobre um arquivo inexistente.
 *
 * Estes testes fixam a ORDEM (reserva → upload → confirmação) e a COMPENSAÇÃO,
 * que é o que substitui a transação única que Storage e PostgreSQL não têm.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseEvidenceRepository } from './EvidenceRepository';

type Resposta = { data?: unknown; error?: { message: string } | null };

interface Roteiro {
  reserve?: Resposta;
  confirm?: Resposta;
  discard?: Resposta;
  upload?: { error: { message: string } | null };
  remove?: { error: { message: string } | null };
}

const RESERVA = {
  reservationId: 'res-1', bucket: 'evidencias',
  path: 'I01/11111111-1111-1111-1111-111111111111-foto.jpg', name: 'foto.jpg',
};

/** Cliente de mentira que REGISTRA a sequência de chamadas, que é o que importa. */
function fakeClient(roteiro: Roteiro = {}) {
  const chamadas: string[] = [];
  const client = {
    rpc: async (nome: string) => {
      chamadas.push(`rpc:${nome}`);
      if (nome === 'reserve_evidence_upload') return roteiro.reserve ?? { data: RESERVA, error: null };
      if (nome === 'confirm_evidence_upload') {
        return roteiro.confirm ?? { data: { id: 'EVD-1', status: 'stored' }, error: null };
      }
      if (nome === 'discard_evidence_reservation') return roteiro.discard ?? { data: null, error: null };
      return { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          chamadas.push(`upload:${bucket}/${path}`);
          return roteiro.upload ?? { error: null };
        },
        remove: async (paths: string[]) => {
          chamadas.push(`remove:${bucket}/${paths[0]}`);
          return roteiro.remove ?? { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, chamadas };
}

const BYTES = new Uint8Array([1, 2, 3, 4]);
const lerOk = async () => BYTES;
const ENTRADA = {
  themeId: 'I01', name: 'foto.jpg', uri: 'file://foto.jpg',
  mimeType: 'image/jpeg', type: 'photo' as const, sizeBytes: 4,
};

describe('SupabaseEvidenceRepository.attach — ordem e compensação (D-02)', () => {
  it('caminho feliz: reserva, sobe o binário e só então confirma', async () => {
    const { client, chamadas } = fakeClient();
    const res = await new SupabaseEvidenceRepository(client, lerOk).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(true);
    expect(chamadas).toEqual([
      'rpc:reserve_evidence_upload',
      `upload:evidencias/${RESERVA.path}`,
      'rpc:confirm_evidence_upload',
    ]);
  });

  it('o caminho do objeto é o que o SERVIDOR reservou, não um escolhido no cliente', async () => {
    const { client, chamadas } = fakeClient();
    await new SupabaseEvidenceRepository(client, lerOk).attach('EVAL-1', 'I01', {
      ...ENTRADA, name: 'nome/que/o/usuario/mandou.jpg',
    });
    expect(chamadas[1]).toBe(`upload:evidencias/${RESERVA.path}`);
  });

  it('arquivo ilegível: nada é reservado nem enviado', async () => {
    const { client, chamadas } = fakeClient();
    const lerFalha = async () => { throw new Error('sem acesso ao arquivo'); };
    const res = await new SupabaseEvidenceRepository(client, lerFalha).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it('arquivo vazio é recusado antes de reservar', async () => {
    const { client, chamadas } = fakeClient();
    const lerVazio = async () => new Uint8Array(0);
    const res = await new SupabaseEvidenceRepository(client, lerVazio).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it('reserva recusada pelo servidor: não sobe nada e a mensagem do servidor chega ao usuário', async () => {
    const { client, chamadas } = fakeClient({
      reserve: { data: null, error: { message: 'tipo de arquivo nao permitido: use imagem ou PDF' } },
    });
    const res = await new SupabaseEvidenceRepository(client, lerOk).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toMatch(/imagem ou PDF/);
    expect(chamadas).toEqual(['rpc:reserve_evidence_upload']);
  });

  it('upload falho: descarta a reserva e NÃO confirma — nenhum metadata nasce', async () => {
    const { client, chamadas } = fakeClient({ upload: { error: { message: 'rede' } } });
    const res = await new SupabaseEvidenceRepository(client, lerOk).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(false);
    expect(chamadas).toEqual([
      'rpc:reserve_evidence_upload',
      `upload:evidencias/${RESERVA.path}`,
      'rpc:discard_evidence_reservation',
    ]);
    expect(chamadas).not.toContain('rpc:confirm_evidence_upload');
  });

  it('confirmação falha: apaga o objeto recém-enviado e descarta a reserva', async () => {
    const { client, chamadas } = fakeClient({
      confirm: { data: null, error: { message: 'reserva inexistente ou ja consumida' } },
    });
    const res = await new SupabaseEvidenceRepository(client, lerOk).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(false);
    expect(chamadas).toEqual([
      'rpc:reserve_evidence_upload',
      `upload:evidencias/${RESERVA.path}`,
      'rpc:confirm_evidence_upload',
      `remove:evidencias/${RESERVA.path}`,
      'rpc:discard_evidence_reservation',
    ]);
  });

  it('quando a limpeza compensatória também falha, o resultado continua sendo ERRO', async () => {
    // O usuário não pode ver sucesso: pode ter sobrado objeto sem metadata.
    const { client } = fakeClient({
      confirm: { data: null, error: { message: 'falhou' } },
      remove: { error: { message: 'nao apagou' } },
    });
    const res = await new SupabaseEvidenceRepository(client, lerOk).attach('EVAL-1', 'I01', ENTRADA);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.details?.residuoNoArmazenamento).toBe(true);
  });

  it('tipo e tamanho inválidos são barrados no cliente, sem ida ao servidor', async () => {
    const { client, chamadas } = fakeClient();
    const repo = new SupabaseEvidenceRepository(client, lerOk);

    const tipo = await repo.attach('EVAL-1', 'I01', { ...ENTRADA, mimeType: 'application/zip' });
    const grande = await repo.attach('EVAL-1', 'I01', { ...ENTRADA, sizeBytes: 20 * 1024 * 1024 });

    expect(tipo.ok).toBe(false);
    expect(grande.ok).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it('store() sem avaliação de destino não cria evidência alguma', async () => {
    const { client, chamadas } = fakeClient();
    const res = await new SupabaseEvidenceRepository(client, lerOk).store();
    expect(res.ok).toBe(false);
    expect(chamadas).toEqual([]);
  });
});
