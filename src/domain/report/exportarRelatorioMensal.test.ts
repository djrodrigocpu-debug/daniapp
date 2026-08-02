/**
 * A ORDEM da exportação do relatório mensal, e o que cada falha significa.
 *
 * O que estes casos protegem é a promessa da trilha: ela só afirma exportações
 * que realmente chegaram ao usuário, e a falha dela nunca derruba um download
 * que já aconteceu.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DependenciasDaExportacaoMensal, MENSAGENS_MENSAL, MotivoDaFalhaMensal,
  exportarRelatorioMensal, motivoDoErroMensal,
} from './exportarRelatorioMensal';
import { monthlyReportInputFixture } from './monthlyAuditReportFixture';

function deps(over: Partial<DependenciasDaExportacaoMensal> = {}): DependenciasDaExportacaoMensal {
  return {
    obterDados: vi.fn(async () => ({ ok: true as const, value: monthlyReportInputFixture() })),
    renderizar: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
    entregar: vi.fn(async () => ({ ok: true as const, via: 'download' as const })),
    registrar: vi.fn(async () => true),
    ...over,
  };
}

describe('exportação do Relatório Oficial da Auditoria Mensal', () => {
  it('percorre dados → PDF → entrega → trilha, e devolve nome e código', async () => {
    const d = deps();
    const r = await exportarRelatorioMensal(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.via).toBe('download');
    expect(r.fileName).toMatch(/^AAPEx-Auditoria-Mensal-.+\.pdf$/);
    expect(r.integrityCode).toMatch(/^[0-9a-f]{64}$/);
    expect(r.registrado).toBe(true);
    expect(d.obterDados).toHaveBeenCalledOnce();
    expect(d.renderizar).toHaveBeenCalledOnce();
    expect(d.entregar).toHaveBeenCalledOnce();
    expect(d.registrar).toHaveBeenCalledOnce();
  });

  it('registra DEPOIS da entrega, com snapshot, versão 1.3.5 e código', async () => {
    const ordem: string[] = [];
    const d = deps({
      entregar: vi.fn(async () => { ordem.push('entrega'); return { ok: true as const, via: 'download' as const }; }),
      registrar: vi.fn(async () => { ordem.push('trilha'); return true; }),
    });
    await exportarRelatorioMensal(d);
    expect(ordem).toEqual(['entrega', 'trilha']);
    expect(d.registrar).toHaveBeenCalledWith(expect.objectContaining({
      evaluationId: '11111111-2222-3333-4444-555555555555',
      snapshotId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      reportVersion: '1.3.5',
    }));
    // E não a versão histórica.
    expect(d.registrar).not.toHaveBeenCalledWith(expect.objectContaining({ reportVersion: '1.3.3' }));
  });

  it('NUNCA registra sucesso quando os dados, a geração ou a entrega falham', async () => {
    const semDados = deps({
      obterDados: vi.fn(async () => ({
        ok: false as const, motivo: 'nao-aprovada' as const,
        message: MENSAGENS_MENSAL['nao-aprovada'],
      })),
    });
    expect((await exportarRelatorioMensal(semDados)).ok).toBe(false);
    expect(semDados.renderizar).not.toHaveBeenCalled();
    expect(semDados.registrar).not.toHaveBeenCalled();

    const semPdf = deps({ renderizar: vi.fn(() => { throw new Error('boom'); }) });
    const r2 = await exportarRelatorioMensal(semPdf);
    expect(r2).toMatchObject({ ok: false, motivo: 'geracao' });
    expect(semPdf.registrar).not.toHaveBeenCalled();

    const vazio = deps({ renderizar: vi.fn(() => new Uint8Array()) });
    expect(await exportarRelatorioMensal(vazio)).toMatchObject({ ok: false, motivo: 'geracao' });
    expect(vazio.registrar).not.toHaveBeenCalled();

    const semEntrega = deps({
      entregar: vi.fn(async () => ({
        ok: false as const, motivo: 'salvamento' as const, message: MENSAGENS_MENSAL.salvamento,
      })),
    });
    expect(await exportarRelatorioMensal(semEntrega)).toMatchObject({ ok: false, motivo: 'salvamento' });
    expect(semEntrega.registrar).not.toHaveBeenCalled();
  });

  it('entrega o documento mesmo quando a trilha falha, e diz que não registrou', async () => {
    const d = deps({ registrar: vi.fn(async () => { throw new Error('trilha fora do ar'); }) });
    const r = await exportarRelatorioMensal(d);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registrado).toBe(false);
  });
});

describe('as causas de falha', () => {
  it('classifica as exceções REAIS da 0051, e não repassa texto cru', () => {
    const casos: Array<[string, MotivoDaFalhaMensal]> = [
      ['auditoria inexistente ou fora do escopo', 'acesso-negado'],
      ['esta auditoria segue o modelo legado: use get_official_audit_report_data', 'modelo-legado'],
      ['a auditoria nao esta aprovada: nao ha relatorio oficial', 'nao-aprovada'],
      ['auditoria aprovada sem snapshot oficial: relatorio indisponivel', 'sem-snapshot'],
      ['permission denied for function get_monthly_audit_report_data', 'acesso-negado'],
      ['qualquer outra coisa vinda do servidor', 'dados'],
    ];
    for (const [servidor, esperado] of casos) {
      expect(`${servidor} -> ${motivoDoErroMensal(servidor)}`).toBe(`${servidor} -> ${esperado}`);
    }
  });

  it('nenhuma mensagem ao usuário carrega stack, SQL, UUID, caminho ou token', () => {
    for (const [motivo, texto] of Object.entries(MENSAGENS_MENSAL)) {
      expect(`${motivo}: ${/select |insert |update |errcode|at Object|\/home\/|eyJ/i.test(texto)}`)
        .toBe(`${motivo}: false`);
      expect(`${motivo}: ${/[0-9a-f]{8}-[0-9a-f]{4}/.test(texto)}`).toBe(`${motivo}: false`);
    }
  });

  it('a recusa por modelo legado NÃO é confundida com falta de acesso', () => {
    // São ações diferentes: uma manda usar o outro relatório, a outra manda
    // procurar quem tem acesso. Trocá-las mandaria o usuário ao lugar errado.
    expect(motivoDoErroMensal('esta auditoria segue o modelo legado')).toBe('modelo-legado');
    expect(MENSAGENS_MENSAL['modelo-legado']).toContain('modelo legado');
    expect(MENSAGENS_MENSAL['modelo-legado']).not.toContain('acesso');
  });
});
