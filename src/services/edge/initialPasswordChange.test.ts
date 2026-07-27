/**
 * Edge Function `initial-password-change` — núcleo exercitado por MOCK.
 *
 * Prova a ordem obrigatória (identidade → obrigação → validação em memória →
 * provedor → conclusão) e o sigilo das duas senhas. O GoTrue real não é tocado.
 * Senhas fictícias (§23).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AuthPort,
  ChangeError,
  DbPort,
  HandlerDeps,
  MIN_NEW_PASSWORD_LENGTH,
  handleInitialPasswordChange,
} from '../../../supabase/functions/initial-password-change/handler';

const TOKEN = 'jwt-fic-do-usuario';
const OUTRO_TOKEN = 'jwt-fic-de-outro';
const UUID = '00000000-0000-0000-0000-0000000070a1';
const UUID_OUTRO = '00000000-0000-0000-0000-0000000070a2';
const EMAIL = 'pessoa.sintetica@sint.test';
const SENHA_TEMP = 'TempoRaria2026';
const SENHA_NOVA = 'NovaSenhaForte2026';

interface FakeOptions {
  required?: boolean;
  senhaAtualCorreta?: string;
  falhaProvedor?: boolean;
  falhasNaConclusao?: number;
  hasServiceRole?: boolean;
  tokenInvalido?: boolean;
}

function deps(options: FakeOptions = {}) {
  const logs: string[] = [];
  const concluidos: string[] = [];
  let tentativasConclusao = 0;

  const auth: AuthPort = {
    resolveCaller: vi.fn(async (token: string) => {
      if (options.tokenInvalido) return null;
      if (token === TOKEN) return { id: UUID, email: EMAIL };
      if (token === OUTRO_TOKEN) return { id: UUID_OUTRO, email: 'outro@sint.test' };
      return null;
    }),
    updateOwnPassword: vi.fn(async (_t: string, atual: string, _nova: string) => {
      logs.push('updateOwnPassword');
      if (options.falhaProvedor) return { ok: false as const, invalidCurrent: false };
      const esperada = options.senhaAtualCorreta ?? SENHA_TEMP;
      if (atual !== esperada) return { ok: false as const, invalidCurrent: true };
      return { ok: true as const };
    }),
  };

  const db: DbPort = {
    isChangeRequired: vi.fn(async () => options.required ?? true),
    completeForUser: vi.fn(async (userId: string) => {
      tentativasConclusao += 1;
      if (tentativasConclusao <= (options.falhasNaConclusao ?? 0)) return { ok: false };
      concluidos.push(userId);
      return { ok: true };
    }),
  };

  return {
    auth,
    db,
    hasServiceRole: options.hasServiceRole ?? true,
    logs,
    concluidos,
    get tentativasConclusao() { return tentativasConclusao; },
  } satisfies HandlerDeps & Record<string, unknown>;
}

const call = (d: HandlerDeps, over: Record<string, unknown> = {}) =>
  handleInitialPasswordChange(
    { accessToken: TOKEN, currentPassword: SENHA_TEMP, newPassword: SENHA_NOVA, ...over },
    d,
  );

describe('identidade e obrigação', () => {
  it('1 — sem Authorization é 401', async () => {
    const d = deps();
    await expect(call(d, { accessToken: null })).rejects.toMatchObject({ status: 401 });
    expect(d.auth.updateOwnPassword).not.toHaveBeenCalled();
  });

  it('2 — JWT inválido é 401', async () => {
    const d = deps({ tokenInvalido: true });
    await expect(call(d)).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(d.auth.updateOwnPassword).not.toHaveBeenCalled();
  });

  it('3 — sem troca pendente a função recusa', async () => {
    const d = deps({ required: false });
    await expect(call(d)).rejects.toMatchObject({ status: 409, code: 'not_required' });
    expect(d.auth.updateOwnPassword).not.toHaveBeenCalled();
  });

  it('4 — sem service role no ambiente recusa antes de tudo', async () => {
    const d = deps({ hasServiceRole: false });
    await expect(call(d)).rejects.toBeInstanceOf(ChangeError);
    expect(d.auth.resolveCaller).not.toHaveBeenCalled();
  });
});

describe('validação em memória, ANTES do provedor', () => {
  const semTocarProvedor = async (over: Record<string, unknown>, code: string) => {
    const d = deps();
    await expect(call(d, over)).rejects.toMatchObject({ code });
    expect(d.auth.updateOwnPassword).not.toHaveBeenCalled();
  };

  it('5 — senha atual ausente', () => semTocarProvedor({ currentPassword: '' }, 'missing_current'));
  it('6 — nova senha ausente', () => semTocarProvedor({ newPassword: '' }, 'missing_new'));

  it('7 — nova IGUAL à atual é recusada antes de chamar o Auth', () =>
    semTocarProvedor({ newPassword: SENHA_TEMP }, 'same_password'));

  it(`8 — nova com menos de ${MIN_NEW_PASSWORD_LENGTH} caracteres`, () =>
    semTocarProvedor({ newPassword: 'Curta2026' }, 'too_short'));

  it('9 — nova sem letra ou sem número', async () => {
    await semTocarProvedor({ newPassword: '123456789012345' }, 'needs_letter_and_digit');
    await semTocarProvedor({ newPassword: 'SomenteLetrasAqui' }, 'needs_letter_and_digit');
  });

  it('10 — nova contendo o e-mail ou a parte local', async () => {
    await semTocarProvedor({ newPassword: `X1${EMAIL}` }, 'contains_email');
    await semTocarProvedor({ newPassword: 'pessoa.sintetica2026' }, 'contains_email');
  });
});

describe('troca e conclusão', () => {
  it('11 — senha atual errada: o provedor recusa e nada é concluído', async () => {
    const d = deps();
    await expect(call(d, { currentPassword: 'ErradaTotal2026' }))
      .rejects.toMatchObject({ status: 400, code: 'invalid_current' });
    expect(d.concluidos).toEqual([]);
  });

  it('12 — falha genérica do provedor não conclui', async () => {
    const d = deps({ falhaProvedor: true });
    await expect(call(d)).rejects.toMatchObject({ code: 'provider_failed' });
    expect(d.concluidos).toEqual([]);
  });

  it('13 — troca bem-sucedida conclui com o UUID DO TOKEN', async () => {
    const d = deps();
    expect(await call(d)).toEqual({ ok: true, required: false });
    expect(d.concluidos).toEqual([UUID]);
  });

  it('14 — o UUID nunca vem do corpo da requisição', async () => {
    const d = deps();
    // Mesmo que o corpo tente injetar outro usuário, a conclusão usa o do token.
    await handleInitialPasswordChange(
      {
        accessToken: TOKEN,
        currentPassword: SENHA_TEMP,
        newPassword: SENHA_NOVA,
        // @ts-expect-error — campo inexistente no contrato, de propósito
        userId: UUID_OUTRO,
        email: 'vitima@sint.test',
      },
      d,
    );
    expect(d.concluidos).toEqual([UUID]);
    expect(d.concluidos).not.toContain(UUID_OUTRO);
  });

  it('15 — a ordem é validar, trocar e só então concluir', async () => {
    const d = deps();
    await call(d);
    const ordem = [
      (d.auth.resolveCaller as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
      (d.db.isChangeRequired as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
      (d.auth.updateOwnPassword as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
      (d.db.completeForUser as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    ];
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  it('16 — conclusão instável é repetida um número limitado de vezes', async () => {
    const d = deps({ falhasNaConclusao: 2 });
    expect(await call(d)).toEqual({ ok: true, required: false });
    expect(d.tentativasConclusao).toBe(3);
  });

  it('17 — conclusão que nunca funciona NÃO libera: erro recuperável', async () => {
    const d = deps({ falhasNaConclusao: 99 });
    await expect(call(d)).rejects.toMatchObject({ status: 503, code: 'completion_failed' });
    expect(d.concluidos).toEqual([]);
    // A senha JÁ mudou; o gate continua, e a conclusão é idempotente na volta.
    expect(d.auth.updateOwnPassword).toHaveBeenCalledTimes(1);
  });
});

describe('sigilo das senhas', () => {
  it('18 — nenhuma mensagem de erro ecoa qualquer das senhas', async () => {
    const casos: Array<Record<string, unknown>> = [
      { currentPassword: '' },
      { newPassword: '' },
      { newPassword: SENHA_TEMP },
      { newPassword: 'Curta2026' },
      { newPassword: '123456789012345' },
      { newPassword: `X1${EMAIL}` },
      { currentPassword: 'ErradaTotal2026' },
    ];
    for (const over of casos) {
      const d = deps();
      const erro = await call(d, over).catch((e: unknown) => e) as ChangeError;
      const serial = `${erro.message} ${JSON.stringify(erro)}`;
      for (const segredo of [SENHA_TEMP, SENHA_NOVA, 'ErradaTotal2026', 'Curta2026']) {
        expect(serial).not.toContain(segredo);
      }
    }
  });

  it('19 — a resposta de sucesso não devolve senha nem token', async () => {
    const d = deps();
    const res = await call(d);
    const serial = JSON.stringify(res);
    expect(Object.keys(res).sort()).toEqual(['ok', 'required']);
    for (const segredo of [SENHA_TEMP, SENHA_NOVA, TOKEN, EMAIL, UUID]) {
      expect(serial).not.toContain(segredo);
    }
  });

  it('20 — a porta de Auth não expõe caminho administrativo de senha', () => {
    const d = deps();
    expect(Object.keys(d.auth).sort()).toEqual(['resolveCaller', 'updateOwnPassword']);
    expect((d.auth as unknown as Record<string, unknown>).updateUserById).toBeUndefined();
    expect((d.auth as unknown as Record<string, unknown>).inviteUserByEmail).toBeUndefined();
  });
});
