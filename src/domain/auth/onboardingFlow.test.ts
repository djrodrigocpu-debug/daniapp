/**
 * Máquina de estados do onboarding por link. Dados fictícios (§23); nenhuma
 * senha real — os valores são marcadores sintéticos.
 */
import { describe, it, expect } from 'vitest';
import {
  CompletionDeps,
  INITIAL_PROGRESS,
  completePasswordSetup,
  decidePhase,
} from './onboardingFlow';

const SENHA = 'senha-sintetica-forte-1';

function deps(over: Partial<{ senhaOk: boolean; ativarOk: boolean; senhaMsg: string; ativarMsg: string }> = {}) {
  const chamadas: string[] = [];
  const d: CompletionDeps = {
    async updatePassword() {
      chamadas.push('updatePassword');
      return over.senhaOk === false
        ? { ok: false, message: over.senhaMsg }
        : { ok: true };
    },
    async activateSelf() {
      chamadas.push('activateSelf');
      return over.ativarOk === false
        ? { ok: false, message: over.ativarMsg }
        : { ok: true };
    },
  };
  return { d, chamadas };
}

describe('decidePhase — o status do servidor manda, não o type da URL', () => {
  it('perfil invited vai para definição de senha E exige ativação', () => {
    expect(decidePhase('invited')).toEqual({
      phase: 'password_setup', message: null, needsActivation: true,
    });
  });

  it('perfil active (recuperação) troca a senha SEM ativar de novo', () => {
    expect(decidePhase('active')).toEqual({
      phase: 'password_setup', message: null, needsActivation: false,
    });
  });

  it('perfil suspended não é reativado por link', () => {
    const r = decidePhase('suspended');
    expect(r.phase).toBe('blocked');
    expect(r.needsActivation).toBe(false);
    expect(r.message).toMatch(/suspenso ou inativo/i);
  });

  it('perfil inactive também é bloqueado', () => {
    expect(decidePhase('inactive').phase).toBe('blocked');
  });

  it('sessão sem perfil corporativo não libera acesso operacional', () => {
    const r = decidePhase(null);
    expect(r.phase).toBe('no_profile');
    expect(r.message).toMatch(/perfil corporativo/i);
  });
});

describe('completePasswordSetup — convite', () => {
  it('caminho feliz: troca a senha e ativa, nessa ordem', async () => {
    const { d, chamadas } = deps();
    const r = await completePasswordSetup(d, SENHA, true);

    expect(r.ok).toBe(true);
    expect(r.progress).toEqual({ passwordSet: true, activated: true });
    expect(chamadas).toEqual(['updatePassword', 'activateSelf']);
    expect(r.message).toMatch(/Acesso liberado/i);
  });

  it('falha ao trocar a senha NÃO chama ativação', async () => {
    const { d, chamadas } = deps({ senhaOk: false, senhaMsg: 'senha fraca' });
    const r = await completePasswordSetup(d, SENHA, true);

    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
    expect(chamadas).toEqual(['updatePassword']);
    expect(r.progress).toEqual(INITIAL_PROGRESS);
  });

  it('FALHA INTERMEDIÁRIA: senha trocada + ativação falha não declara sucesso', async () => {
    const { d } = deps({ ativarOk: false });
    const r = await completePasswordSetup(d, SENHA, true);

    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
    expect(r.progress).toEqual({ passwordSet: true, activated: false });
    expect(r.message).toMatch(/senha foi definida/i);
    expect(r.message).toMatch(/não será alterada/i);
  });

  it('RETRY após falha de ativação NÃO troca a senha de novo', async () => {
    const primeira = deps({ ativarOk: false });
    const r1 = await completePasswordSetup(primeira.d, SENHA, true);
    expect(r1.progress.passwordSet).toBe(true);

    // Segunda tentativa, agora com o servidor saudável, reaproveitando o progresso.
    const segunda = deps();
    const r2 = await completePasswordSetup(segunda.d, SENHA, true, r1.progress);

    expect(r2.ok).toBe(true);
    expect(segunda.chamadas).toEqual(['activateSelf']); // updatePassword NÃO repetiu
    expect(r2.progress).toEqual({ passwordSet: true, activated: true });
  });

  it('retry repetido continua sem repetir a senha', async () => {
    const p = { passwordSet: true, activated: false };
    const { d, chamadas } = deps({ ativarOk: false });
    await completePasswordSetup(d, SENHA, true, p);
    await completePasswordSetup(d, SENHA, true, p);
    expect(chamadas).toEqual(['activateSelf', 'activateSelf']);
  });
});

describe('completePasswordSetup — recuperação (perfil já active)', () => {
  it('troca a senha e NÃO chama activateSelf', async () => {
    const { d, chamadas } = deps();
    const r = await completePasswordSetup(d, SENHA, false);

    expect(r.ok).toBe(true);
    expect(chamadas).toEqual(['updatePassword']);
    expect(r.progress).toEqual({ passwordSet: true, activated: false });
    expect(r.message).toMatch(/Senha atualizada/i);
  });

  it('falha na troca é retomável e não ativa nada', async () => {
    const { d, chamadas } = deps({ senhaOk: false });
    const r = await completePasswordSetup(d, SENHA, false);
    expect(r.ok).toBe(false);
    expect(chamadas).toEqual(['updatePassword']);
  });

  it('nenhuma mensagem devolvida contém a senha', async () => {
    for (const over of [{}, { senhaOk: false }, { ativarOk: false }]) {
      const { d } = deps(over);
      const r = await completePasswordSetup(d, SENHA, true);
      expect(r.message).not.toContain(SENHA);
    }
  });
});
