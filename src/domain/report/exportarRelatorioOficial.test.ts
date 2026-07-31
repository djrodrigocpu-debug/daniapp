/**
 * ORDEM da exportação: o que acontece, em que sequência, e o que cada falha
 * significa. As peças de plataforma são dublês — o que está sob teste é a
 * sequência, não o navegador.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  exportarRelatorioOficial,
  motivoDoErroDoServidor,
  MENSAGENS,
  type DependenciasDaExportacao,
  type ResultadoDaEntrega,
} from './exportarRelatorioOficial';
import { reportInputFixture } from './officialAuditReportFixture';

const AGORA = '2026-09-02T10:15:30.000Z';

function deps(over: Partial<DependenciasDaExportacao> = {}): DependenciasDaExportacao {
  return {
    obterDados: async () => ({ ok: true, value: reportInputFixture() }),
    agora: () => AGORA,
    renderizar: () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]),   // "%PDF"
    entregar: async (): Promise<ResultadoDaEntrega> => ({ ok: true, via: 'download' }),
    registrar: async () => true,
    ...over,
  };
}

describe('exportação do relatório oficial', () => {
  it('percorre dados → PDF → entrega → trilha, nessa ordem, e devolve nome e código', async () => {
    const ordem: string[] = [];
    const r = await exportarRelatorioOficial(deps({
      obterDados: async () => { ordem.push('dados'); return { ok: true, value: reportInputFixture() }; },
      renderizar: () => { ordem.push('pdf'); return Uint8Array.from([1, 2, 3]); },
      entregar: async () => { ordem.push('entrega'); return { ok: true, via: 'download' }; },
      registrar: async () => { ordem.push('trilha'); return true; },
    }));
    expect(ordem).toEqual(['dados', 'pdf', 'entrega', 'trilha']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fileName).toMatch(/^AAPEx_Relatorio_Auditoria_.+_2026-07_[0-9a-f]{8}\.pdf$/);
    expect(r.integrityCode).toMatch(/^[0-9a-f]{64}$/);
    expect(r.via).toBe('download');
    expect(r.registrado).toBe(true);
  });

  it('registra DEPOIS da entrega, com snapshot e código — e sem ator vindo do cliente', async () => {
    const registrar = vi.fn<DependenciasDaExportacao['registrar']>(async () => true);
    await exportarRelatorioOficial(deps({ registrar }));
    expect(registrar).toHaveBeenCalledTimes(1);
    const arg = registrar.mock.calls[0][0];
    expect(arg.evaluationId).toBe(reportInputFixture().evaluationId);
    expect(arg.snapshotId).toBe(reportInputFixture().snapshotId);
    expect(arg.reportVersion).toBe('1.3.3');
    expect(arg.integrityCode).toMatch(/^[0-9a-f]{64}$/);
    // Quem carimba o ator é o servidor, a partir de auth.uid().
    expect(Object.keys(arg)).not.toContain('actor');
    expect(Object.keys(arg)).not.toContain('userId');
  });

  it('NUNCA registra sucesso quando os dados, a geração ou a entrega falham', async () => {
    const semDados = vi.fn<DependenciasDaExportacao['registrar']>(async () => true);
    await exportarRelatorioOficial(deps({
      obterDados: async () => ({ ok: false, motivo: 'dados', message: MENSAGENS.dados }),
      registrar: semDados,
    }));
    expect(semDados).not.toHaveBeenCalled();

    const semPdf = vi.fn<DependenciasDaExportacao['registrar']>(async () => true);
    const entregar = vi.fn(async (): Promise<ResultadoDaEntrega> => ({ ok: true, via: 'download' }));
    const rPdf = await exportarRelatorioOficial(deps({
      renderizar: () => { throw new Error('falhou'); }, entregar, registrar: semPdf,
    }));
    expect(rPdf.ok).toBe(false);
    if (!rPdf.ok) expect(rPdf.motivo).toBe('geracao');
    expect(entregar).not.toHaveBeenCalled();
    expect(semPdf).not.toHaveBeenCalled();

    const semEntrega = vi.fn<DependenciasDaExportacao['registrar']>(async () => true);
    const rEntrega = await exportarRelatorioOficial(deps({
      entregar: async () => ({ ok: false, motivo: 'salvamento', message: MENSAGENS.salvamento }),
      registrar: semEntrega,
    }));
    expect(rEntrega.ok).toBe(false);
    if (!rEntrega.ok) expect(rEntrega.motivo).toBe('salvamento');
    expect(semEntrega).not.toHaveBeenCalled();
  });

  it('entrega o documento mesmo quando a trilha falha, e diz que não registrou', async () => {
    const lancou = await exportarRelatorioOficial(deps({
      registrar: async () => { throw new Error('rede caiu'); },
    }));
    expect(lancou.ok).toBe(true);
    if (lancou.ok) expect(lancou.registrado).toBe(false);

    const recusou = await exportarRelatorioOficial(deps({ registrar: async () => false }));
    expect(recusou.ok).toBe(true);
    if (recusou.ok) expect(recusou.registrado).toBe(false);
  });

  it('distingue cada causa de falha', async () => {
    for (const motivo of ['nao-validada', 'sem-snapshot', 'acesso-negado', 'dados'] as const) {
      const r = await exportarRelatorioOficial(deps({
        obterDados: async () => ({ ok: false, motivo, message: MENSAGENS[motivo] }),
      }));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBe(motivo);
        expect(r.message).toBe(MENSAGENS[motivo]);
      }
    }

    // Dados incompletos são problema de CONTEÚDO, não de rede.
    const truncado = reportInputFixture();
    truncado.official.answers = [];
    const conteudo = await exportarRelatorioOficial(deps({
      obterDados: async () => ({ ok: true, value: truncado }),
    }));
    expect(conteudo.ok).toBe(false);
    if (!conteudo.ok) expect(conteudo.motivo).toBe('conteudo');

    const vazio = await exportarRelatorioOficial(deps({ renderizar: () => new Uint8Array(0) }));
    expect(vazio.ok).toBe(false);
    if (!vazio.ok) expect(vazio.motivo).toBe('geracao');

    const semPartilha = await exportarRelatorioOficial(deps({
      entregar: async () => ({
        ok: false, motivo: 'compartilhamento-indisponivel',
        message: MENSAGENS['compartilhamento-indisponivel'],
      }),
    }));
    expect(semPartilha.ok).toBe(false);
    if (!semPartilha.ok) expect(semPartilha.motivo).toBe('compartilhamento-indisponivel');
  });

  it('nenhuma mensagem ao usuário carrega stack, SQL, UUID, caminho ou token', () => {
    for (const mensagem of Object.values(MENSAGENS)) {
      expect(mensagem).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(mensagem).not.toMatch(/select |insert |from public\.|pg_|errcode/i);
      expect(mensagem).not.toMatch(/https?:\/\/|\/storage\/|token|Error:|at \w+\./);
      expect(mensagem.length).toBeLessThan(180);
    }
  });

  it('classifica as exceções reais da 0035 e não repassa texto cru do servidor', () => {
    expect(motivoDoErroDoServidor('avaliacao inexistente ou fora do escopo')).toBe('acesso-negado');
    expect(motivoDoErroDoServidor('avaliacao ainda nao foi validada oficialmente')).toBe('nao-validada');
    expect(motivoDoErroDoServidor('snapshot oficial nao encontrado para esta avaliacao')).toBe('sem-snapshot');
    expect(motivoDoErroDoServidor('permission denied for function get_official_audit_report_data'))
      .toBe('acesso-negado');
    expect(motivoDoErroDoServidor('relation "x" does not exist')).toBe('dados');
    expect(motivoDoErroDoServidor('')).toBe('dados');
  });
});
