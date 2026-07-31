/**
 * Entrega do PDF no NAVEGADOR.
 *
 * O requisito é literal: download real, sem `window.open`, sem pop-up, com a
 * object URL revogada. Aqui o DOM é simulado com dublês para que a asserção
 * caia sobre o que o código de fato chama — inclusive sobre o que ele NÃO
 * chama.
 *
 * O caminho nativo (arquivo temporário + folha de compartilhamento) não é
 * exercitado aqui: depende de `expo-file-system` e `expo-sharing`, que não
 * existem fora do runtime do Expo. Ele é verificado na homologação em
 * dispositivo — e a limitação está registrada no relatório da fatia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);   // "%PDF-1.4"

interface AncoraFalsa {
  href: string; download: string; rel: string; style: { display: string };
  click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>;
}

interface Ambiente {
  ancoras: AncoraFalsa[];
  criadas: string[];
  revogadas: string[];
  blobs: Array<{ tipo: string; bytes: number }>;
  anexadas: number;
  abriuJanela: boolean;
}

let amb: Ambiente;
const originais: Record<string, unknown> = {};

function instalarDom(): void {
  amb = { ancoras: [], criadas: [], revogadas: [], blobs: [], anexadas: 0, abriuJanela: false };
  let n = 0;

  for (const chave of ['document', 'URL', 'Blob', 'window']) {
    originais[chave] = (globalThis as Record<string, unknown>)[chave];
  }

  (globalThis as Record<string, unknown>).Blob = class {
    constructor(partes: ArrayBuffer[], opts: { type: string }) {
      amb.blobs.push({ tipo: opts.type, bytes: partes[0].byteLength });
    }
  };

  (globalThis as Record<string, unknown>).URL = {
    createObjectURL: () => { n += 1; const u = `blob:fake/${n}`; amb.criadas.push(u); return u; },
    revokeObjectURL: (u: string) => { amb.revogadas.push(u); },
  };

  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const a: AncoraFalsa = {
        href: '', download: '', rel: '', style: { display: '' },
        click: vi.fn(), remove: vi.fn(),
      };
      amb.ancoras.push(a);
      return a;
    },
    body: { appendChild: () => { amb.anexadas += 1; } },
  };

  (globalThis as Record<string, unknown>).window = {
    open: () => { amb.abriuJanela = true; return null; },
  };
}

function desinstalarDom(): void {
  for (const [chave, valor] of Object.entries(originais)) {
    if (valor === undefined) delete (globalThis as Record<string, unknown>)[chave];
    else (globalThis as Record<string, unknown>)[chave] = valor;
  }
}

/** `react-native` fora do bundler: só é preciso `Platform.OS`. */
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('entrega do PDF no navegador', () => {
  beforeEach(() => { instalarDom(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); desinstalarDom(); vi.resetModules(); });

  async function entregar(nome = 'AAPEx_Relatorio.pdf') {
    const { entregarPdf } = await import('./entregarPdf');
    return entregarPdf()(PDF, nome);
  }

  it('baixa o arquivo com o nome pedido e o tipo application/pdf', async () => {
    const r = await entregar('AAPEx_Relatorio_Auditoria_Parceiro_2026-07_abcdef12.pdf');
    expect(r).toEqual({ ok: true, via: 'download' });

    expect(amb.ancoras).toHaveLength(1);
    const a = amb.ancoras[0];
    expect(a.download).toBe('AAPEx_Relatorio_Auditoria_Parceiro_2026-07_abcdef12.pdf');
    expect(a.href).toBe('blob:fake/1');
    expect(a.rel).toBe('noopener');
    expect(a.click).toHaveBeenCalledTimes(1);
    expect(amb.blobs).toEqual([{ tipo: 'application/pdf', bytes: PDF.byteLength }]);
  });

  it('NUNCA usa window.open nem abre aba — download não pede pop-up', async () => {
    await entregar();
    expect(amb.abriuJanela).toBe(false);
  });

  it('remove a âncora e revoga a object URL', async () => {
    await entregar();
    expect(amb.ancoras[0].remove).toHaveBeenCalledTimes(1);
    // A revogação é adiada: revogar antes do clique cancelaria o download.
    expect(amb.revogadas).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(amb.revogadas).toEqual(['blob:fake/1']);
  });

  it('não deixa object URL pendurada quando exporta duas vezes', async () => {
    await entregar('um.pdf');
    await entregar('dois.pdf');
    vi.advanceTimersByTime(60_000);
    expect(amb.criadas).toEqual(['blob:fake/1', 'blob:fake/2']);
    expect([...amb.revogadas].sort()).toEqual(['blob:fake/1', 'blob:fake/2']);
  });

  it('reporta falha de salvamento quando o navegador recusa o download', async () => {
    (globalThis as Record<string, unknown>).URL = {
      createObjectURL: () => { throw new Error('bloqueado'); },
      revokeObjectURL: () => undefined,
    };
    const r = await entregar();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('salvamento');
  });

  it('reporta falha de salvamento quando não há DOM', async () => {
    delete (globalThis as Record<string, unknown>).document;
    const r = await entregar();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe('salvamento');
      expect(r.message).not.toMatch(/undefined|document|TypeError/);
    }
  });
});
