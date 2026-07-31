/**
 * Ordem e falhas da abertura de comprovação (D-03, correção web).
 *
 * POR QUE ESTE ARQUIVO EXISTE. O teste anterior substituía `window.open` por um
 * dublê para capturar a URL — e passou a medir o dublê. Ele aprovou um fluxo que
 * o Chrome bloqueava, porque a única coisa que importava era JUSTAMENTE o que
 * havia sido substituído: `window.open` ser chamado ANTES do `await`.
 *
 * Aqui a reserva é uma dependência, então dá para observar QUANDO ela acontece
 * em relação à Promise da URL — que é o contrato de verdade.
 */
import { describe, it, expect, vi } from 'vitest';
import { abrirEvidencia, MENSAGENS, type CanalDeAbertura } from './abrirEvidencia';

function canalFake(overrides: Partial<CanalDeAbertura> = {}) {
  const canal: CanalDeAbertura & { navegadaPara: string | null; cancelado: number } = {
    reservado: true,
    navegadaPara: null,
    cancelado: 0,
    async concluir(url) { canal.navegadaPara = url; return true; },
    cancelar() { canal.cancelado += 1; },
    ...overrides,
  };
  return canal;
}

const URL_ASSINADA = 'https://projeto.supabase.co/storage/v1/object/sign/evidencias/T01/x.png?token=efemero';

describe('abrirEvidencia — a aba nasce antes da URL (bloqueio de pop-up)', () => {
  it('reserva o destino ANTES de a Promise da URL resolver', async () => {
    const eventos: string[] = [];
    let liberar: (v: { ok: true; url: string }) => void = () => {};
    const urlPendente = new Promise<{ ok: true; url: string }>((r) => { liberar = r; });

    const promessa = abrirEvidencia({
      reservar: () => { eventos.push('reservou'); return canalFake(); },
      obterUrl: () => { eventos.push('pediu url'); return urlPendente; },
    });

    // A URL ainda NÃO resolveu, e a reserva já tem que ter acontecido: é este o
    // instante em que a ativação do gesto ainda existe.
    expect(eventos).toEqual(['reservou', 'pediu url']);

    liberar({ ok: true, url: URL_ASSINADA });
    await promessa;
  });

  it('a reserva é síncrona — acontece antes de qualquer microtarefa', () => {
    let reservou = false;
    void abrirEvidencia({
      reservar: () => { reservou = true; return canalFake(); },
      obterUrl: async () => ({ ok: true, url: URL_ASSINADA }),
    });
    // Sem `await` nenhum entre a chamada e esta linha.
    expect(reservou).toBe(true);
  });

  it('a aba reservada recebe a URL assinada quando o servidor autoriza', async () => {
    const canal = canalFake();
    const r = await abrirEvidencia({
      reservar: () => canal,
      obterUrl: async () => ({ ok: true, url: URL_ASSINADA }),
    });
    expect(r).toEqual({ ok: true, via: 'aba' });
    expect(canal.navegadaPara).toBe(URL_ASSINADA);
    expect(canal.cancelado).toBe(0);
  });
});

describe('abrirEvidencia — falhas distinguíveis', () => {
  it('acesso negado fecha a aba reservada e repassa a mensagem do servidor', async () => {
    const canal = canalFake();
    const r = await abrirEvidencia({
      reservar: () => canal,
      obterUrl: async () => ({ ok: false, message: 'Esta evidência não está disponível para você.' }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('acesso');
      expect(r.message).toBe('Esta evidência não está disponível para você.');
    }
    // A aba em branco não pode ficar aberta.
    expect(canal.cancelado).toBe(1);
    expect(canal.navegadaPara).toBeNull();
  });

  it('arquivo inexistente no bucket também fecha a aba, com a mensagem própria', async () => {
    const canal = canalFake();
    const r = await abrirEvidencia({
      reservar: () => canal,
      obterUrl: async () => ({ ok: false, message: 'O arquivo desta evidência não foi encontrado no armazenamento.' }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/não foi encontrado no armazenamento/);
    expect(canal.cancelado).toBe(1);
  });

  it('aba barrada pelo navegador: cai no download e o usuário recebe o arquivo', async () => {
    const baixar = vi.fn(async () => true);
    const r = await abrirEvidencia({
      reservar: () => canalFake({ reservado: false }),
      obterUrl: async () => ({ ok: true, url: URL_ASSINADA }),
      baixar,
    });
    expect(r).toEqual({ ok: true, via: 'download' });
    expect(baixar).toHaveBeenCalledWith(URL_ASSINADA);
  });

  it('aba barrada E download falho: mensagem honesta, nunca sucesso silencioso', async () => {
    const r = await abrirEvidencia({
      reservar: () => canalFake({ reservado: false }),
      obterUrl: async () => ({ ok: true, url: URL_ASSINADA }),
      baixar: async () => false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('bloqueado');
      expect(r.message).toBe(MENSAGENS.bloqueado);
    }
  });

  it('sem download alternativo (nativo), tipo não exibível dá mensagem de exibição', async () => {
    const canal = canalFake({ async concluir() { return false; } });
    const r = await abrirEvidencia({
      reservar: () => canal,
      obterUrl: async () => ({ ok: true, url: URL_ASSINADA }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('exibicao');
      expect(r.message).toBe(MENSAGENS.exibicao);
    }
    expect(canal.cancelado).toBe(1);
  });

  it('nenhuma mensagem de falha é apenas "Erro" — todas dizem o que houve', async () => {
    const casos = [
      await abrirEvidencia({ reservar: () => canalFake(), obterUrl: async () => ({ ok: false, message: 'Esta evidência não está disponível para você.' }) }),
      await abrirEvidencia({ reservar: () => canalFake({ reservado: false }), obterUrl: async () => ({ ok: true, url: URL_ASSINADA }), baixar: async () => false }),
      await abrirEvidencia({ reservar: () => canalFake({ async concluir() { return false; } }), obterUrl: async () => ({ ok: true, url: URL_ASSINADA }) }),
    ];
    const motivos = new Set<string>();
    for (const c of casos) {
      expect(c.ok).toBe(false);
      if (!c.ok) {
        expect(c.message.length).toBeGreaterThan(30);
        motivos.add(c.motivo);
      }
    }
    expect(motivos.size).toBe(3); // acesso, bloqueado e exibicao são distinguíveis
  });

  it('a URL assinada nunca é exposta na mensagem de erro', async () => {
    const r = await abrirEvidencia({
      reservar: () => canalFake({ reservado: false }),
      obterUrl: async () => ({ ok: true, url: URL_ASSINADA }),
      baixar: async () => false,
    });
    if (!r.ok) {
      expect(r.message).not.toContain('token=');
      expect(r.message).not.toContain('supabase.co');
      expect(r.message).not.toContain('T01/');
    }
  });
});
