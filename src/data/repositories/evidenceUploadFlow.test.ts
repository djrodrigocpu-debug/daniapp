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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Leitura da evidência pelo validador (D-03).
 *
 * A policy do bucket já autoriza quem tem escopo; o que estes testes fixam é o
 * caminho do CLIENTE até o arquivo: endereço resolvido no servidor, assinatura
 * de curta duração, e erro honesto quando falta permissão ou falta arquivo.
 */
interface RoteiroLeitura {
  path?: { data: unknown; error: { message: string } | null };
  signed?: { data: { signedUrl: string } | null; error: { message: string } | null };
}

function fakeClientLeitura(roteiro: RoteiroLeitura = {}) {
  const chamadas: string[] = [];
  const assinaturas: Array<{ path: string; ttl: number }> = [];
  const client = {
    rpc: async (nome: string) => {
      chamadas.push(`rpc:${nome}`);
      return roteiro.path ?? { data: RESERVA.path, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          chamadas.push(`assinar:${bucket}/${path}`);
          assinaturas.push({ path, ttl });
          return roteiro.signed ?? {
            data: { signedUrl: `https://staging.exemplo/object/sign/${path}?token=efemero` },
            error: null,
          };
        },
        // Presente de propósito: se algum dia alguém chamar, o teste vê.
        getPublicUrl: (path: string) => {
          chamadas.push(`publica:${bucket}/${path}`);
          return { data: { publicUrl: `https://staging.exemplo/public/${path}` } };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, chamadas, assinaturas };
}

describe('SupabaseEvidenceRepository.getUrl — abertura pelo validador (D-03)', () => {
  it('resolve o caminho no servidor e devolve URL ASSINADA de curta duração', async () => {
    const { client, chamadas, assinaturas } = fakeClientLeitura();
    const res = await new SupabaseEvidenceRepository(client, lerOk).getUrl('EVD-1');

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toContain('/object/sign/');
    expect(chamadas).toEqual(['rpc:evidence_path', `assinar:evidencias/${RESERVA.path}`]);
    expect(assinaturas[0].ttl).toBeGreaterThan(0);
    expect(assinaturas[0].ttl).toBeLessThanOrEqual(600); // curta duração, não link eterno
  });

  it('NUNCA gera URL pública permanente', async () => {
    const { client, chamadas } = fakeClientLeitura();
    await new SupabaseEvidenceRepository(client, lerOk).getUrl('EVD-1');
    expect(chamadas.some((c) => c.startsWith('publica:'))).toBe(false);
  });

  it('fora do escopo: o servidor nega o caminho e nada é assinado', async () => {
    const { client, chamadas } = fakeClientLeitura({
      path: { data: null, error: { message: 'sem permissao' } },
    });
    const res = await new SupabaseEvidenceRepository(client, lerOk).getUrl('EVD-1');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('Esta evidência não está disponível para você.');
    expect(chamadas).toEqual(['rpc:evidence_path']);
  });

  it('a recusa não revela se a evidência existe — mesma mensagem nos dois casos', async () => {
    const repo = (r: RoteiroLeitura) => new SupabaseEvidenceRepository(fakeClientLeitura(r).client, lerOk);
    const semPermissao = await repo({ path: { data: null, error: { message: 'sem permissao' } } }).getUrl('EVD-1');
    const inexistente = await repo({ path: { data: null, error: { message: 'evidencia inexistente' } } }).getUrl('EVD-2');

    expect(semPermissao.ok).toBe(false);
    expect(inexistente.ok).toBe(false);
    if (!semPermissao.ok && !inexistente.ok) {
      expect(semPermissao.error.message).toBe(inexistente.error.message);
    }
  });

  it('metadata sem objeto no bucket produz erro honesto, não silêncio', async () => {
    // O escopo passou; o que falta é o arquivo. O usuário precisa saber disso.
    const { client, chamadas } = fakeClientLeitura({
      signed: { data: null, error: { message: 'Object not found' } },
    });
    const res = await new SupabaseEvidenceRepository(client, lerOk).getUrl('EVD-1');

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toBe('O arquivo desta evidência não foi encontrado no armazenamento.');
      expect(res.error.severity).toBe('high');
    }
    expect(chamadas).toContain('rpc:evidence_path'); // chegou até a assinatura
  });
});

/**
 * A ação existe na tela e está protegida (D-03, complementação visual).
 *
 * Complemento estrutural, não prova principal: o comportamento real é o smoke
 * autenticado em staging. O que estes testes impedem é a regressão silenciosa
 * de a ação sumir da tela ou perder a trava de toque duplo — foi a AUSÊNCIA
 * dessa ação que deixou D-03 corrigido no banco e ainda quebrado para o usuário.
 */
describe('EvaluationScreen — ação de abrir a comprovação', () => {
  const tela = readFileSync(join(__dirname, '../../screens/EvaluationScreen.tsx'), 'utf8');

  it('a linha da evidência tem botão de abrir, com rótulo acessível', () => {
    expect(tela).toContain('abrirEvidencia');
    expect(tela).toMatch(/accessibilityLabel=\{`Abrir evidência \$\{evidence\.name\}`\}/);
  });

  it('abrir está disponível também em leitura — é o caso do validador', () => {
    // O botão de remover é `{!readOnly && ...}`; o de abrir NÃO pode estar
    // dentro dessa condição, senão o Coordenador volta a não ter o que tocar.
    const inicio = tela.indexOf('accessibilityLabel={`Abrir evidência');
    const trecho = tela.slice(Math.max(0, inicio - 400), inicio);
    expect(trecho).not.toContain('!readOnly &&');
  });

  it('mostra tipo e tamanho ao lado do nome', () => {
    expect(tela).toContain('formatBytes(evidence.sizeBytes)');
  });

  it('toque duplo não abre duas abas — a trava é síncrona, não o estado', () => {
    // `setState` é assíncrono: dois toques rápidos leriam `null` os dois e
    // reservariam duas abas. O `ref` fecha isso no mesmo tick.
    expect(tela).toMatch(/if \(abrindoRef\.current\) return;/);
    expect(tela).toMatch(/abrindoRef\.current = true;/);
    expect(tela).toContain('disabled={abrindoEvidencia !== null}');
  });

  it('a aba é reservada no toque e a URL vem do provider, não da tela', () => {
    // A ordem de verdade é garantida por `domain/evidence/abrirEvidencia`; aqui
    // só se confere que a tela entrega a reserva e o obtentor de URL certos.
    expect(tela).toContain('reservar: reservarAbertura');
    expect(tela).toContain('obterUrl: () => getEvidenceUrl(evidence.id)');
    expect(tela).not.toMatch(/supabase\.co\/storage/);
    expect(tela).not.toMatch(/window\.open/);
  });

  it('o web tem saída por download quando a aba é barrada', () => {
    expect(tela).toContain('baixar: temDownloadAlternativo ? baixarArquivo(evidence.name)');
  });
});
