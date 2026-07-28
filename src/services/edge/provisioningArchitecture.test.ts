/**
 * Provas ESTÁTICAS da arquitetura de provisionamento sem convite.
 *
 * Os testes de comportamento exercitam portas injetadas — não conseguem provar
 * que o código real não chama o convite, porque o `index.ts` das Edge Functions
 * não é alcançável por nenhum runner (importa Deno e esm.sh). Estes testes leem
 * o FONTE e fecham exatamente essa lacuna.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..', '..');
const PROVISION = join(RAIZ, 'supabase', 'functions', 'admin-provision-users');

function ler(caminho: string): string {
  return readFileSync(caminho, 'utf8');
}

/**
 * Remove comentários antes de asseverar ausência.
 *
 * Sem isto a prova seria falsa nos DOIS sentidos: a documentação destes módulos
 * cita `inviteUserByEmail` e `auth.users` exatamente para registrar que NÃO são
 * usados, e o teste acusaria; e um dia alguém poderia "passar" no teste apenas
 * apagando um comentário. O que interessa é o código executável.
 */
function semComentarios(fonte: string): string {
  return fonte
    // Remove CR ANTES de tudo: em arquivo CRLF o `.*$` do strip de comentario
    // de linha para antes do CR, e o comentario sobreviveria inteiro — a prova
    // de ausencia passaria a ler o que a propria documentacao menciona.
    .replace(new RegExp(String.fromCharCode(13), 'g'), '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((linha) => linha.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const TROCA = join(RAIZ, 'supabase', 'functions', 'initial-password-change');

const indexProvision = semComentarios(ler(join(PROVISION, 'index.ts')));
const handlerProvision = semComentarios(ler(join(PROVISION, 'handler.ts')));
const indexTroca = semComentarios(ler(join(TROCA, 'index.ts')));
const handlerTroca = semComentarios(ler(join(TROCA, 'handler.ts')));
const adminRepository = semComentarios(ler(join(RAIZ, 'src', 'data', 'repositories', 'AdminRepository.ts')));
const loginScreen = semComentarios(ler(join(RAIZ, 'src', 'screens', 'LoginScreen.tsx')));
const telaGate = semComentarios(ler(join(RAIZ, 'src', 'screens', 'InitialPasswordScreen.tsx')));
const navegador = semComentarios(ler(join(RAIZ, 'src', 'navigation', 'AppNavigator.tsx')));

describe('admin-provision-users — ausência de convite e de e-mail', () => {
  it('inviteUserByEmail NÃO aparece em nenhum arquivo da função', () => {
    for (const fonte of [indexProvision, handlerProvision]) {
      expect(fonte).not.toContain('inviteUserByEmail');
    }
  });

  it('nenhum mecanismo de envio de e-mail é referenciado', () => {
    const proibidos = [
      'inviteUserByEmail',
      'resetPasswordForEmail',
      'generateLink',
      'signInWithOtp',
      'resend(',
      'smtp',
      'sendMail',
      'INVITE_REDIRECT_URL',
      'INVITE_REDIRECT_ALLOWLIST',
    ];
    for (const termo of proibidos) {
      expect(indexProvision.toLowerCase()).not.toContain(termo.toLowerCase());
      expect(handlerProvision.toLowerCase()).not.toContain(termo.toLowerCase());
    }
  });

  it('createUser é chamado com email_confirm: true', () => {
    expect(indexProvision).toContain('admin.auth.admin.createUser');
    expect(indexProvision).toMatch(/email_confirm:\s*true/);
  });

  it('a porta de Auth do handler declara apenas createUser e a busca em lote', () => {
    // Se alguém acrescentar convite à interface, este teste cai.
    const porta = handlerProvision.slice(
      handlerProvision.indexOf('export interface AuthAdminPort'),
      handlerProvision.indexOf('/** RPCs do Postgres'),
    );
    expect(porta).toContain('findExistingIdentities');
    expect(porta).toContain('createUser');
    expect(porta).not.toContain('invite');
  });

  it('a ativação usa a RPC existente, sem migration nova', () => {
    expect(indexProvision).toContain('admin_activate_confirmed_users');
    expect(indexProvision).toContain('admin_import_users');
    // Nenhuma migration 0013 foi criada para este fluxo.
    expect(existsSync(join(RAIZ, 'supabase', 'migrations', '0013_cpf_authentication.sql'))).toBe(false);
    const migrations = join(RAIZ, 'supabase', 'migrations');
    const arquivos = readFileSync(join(migrations, '0012_activate_self.sql'), 'utf8');
    expect(arquivos.length).toBeGreaterThan(0); // 0012 continua sendo a última
  });

  it('a paginação do Auth é reaproveitada, não reimplementada', () => {
    expect(indexProvision).toContain('buildIdentityIndex');
    expect(indexProvision).toContain('_shared/identityIndex.ts');
  });

  it('a função nova NÃO importa nada de dentro da pasta da função legada', () => {
    // Acoplamento invertido: a nova dependia do diretório da legada. Se alguém
    // remover `admin-invite-users`, esta função não pode quebrar junto.
    expect(indexProvision).not.toContain('admin-invite-users/');
    expect(handlerProvision).not.toContain('admin-invite-users/');
  });

  it('as DUAS funções consomem os módulos de _shared', () => {
    const indexInvite = semComentarios(
      ler(join(RAIZ, 'supabase', 'functions', 'admin-invite-users', 'index.ts')),
    );
    for (const fonte of [indexProvision, indexInvite]) {
      expect(fonte).toContain("from '../_shared/cors.ts'");
      expect(fonte).toContain("from '../_shared/identityIndex.ts'");
    }
    // Os módulos existem no lugar novo e não no antigo.
    expect(existsSync(join(RAIZ, 'supabase', 'functions', '_shared', 'cors.ts'))).toBe(true);
    expect(existsSync(join(RAIZ, 'supabase', 'functions', '_shared', 'identityIndex.ts'))).toBe(true);
    expect(existsSync(join(RAIZ, 'supabase', 'functions', 'admin-invite-users', 'cors.ts'))).toBe(false);
    expect(existsSync(join(RAIZ, 'supabase', 'functions', 'admin-invite-users', 'identityIndex.ts'))).toBe(false);
  });
});

describe('cliente — o caminho operacional não passa mais pelo convite', () => {
  it('AdminRepository invoca admin-provision-users e não admin-invite-users', () => {
    expect(adminRepository).toContain("functions.invoke('admin-provision-users'");
    expect(adminRepository).not.toContain("functions.invoke('admin-invite-users'");
  });

  it('nenhum resquício do método de convite ficou no repositório', () => {
    expect(adminRepository).not.toContain('inviteIdentities');
    expect(adminRepository).not.toContain('Convite incompleto');
  });

  it('a tela de login não dispara recuperação por e-mail', () => {
    // A infraestrutura continua existindo no contexto; a TELA é que não chama.
    expect(loginScreen).not.toContain('await requestPasswordReset');
    expect(loginScreen).not.toContain('requestPasswordReset(');
    expect(loginScreen).toContain('Solicite ao administrador');
  });

  it('a tela de login continua pedindo e-mail e senha', () => {
    expect(loginScreen).toContain('E-mail');
    expect(loginScreen).toContain('Senha');
    expect(loginScreen).toContain('signIn(');
    // Nada de CPF/CNPJ como credencial.
    expect(loginScreen.toLowerCase()).not.toContain('cpf');
    expect(loginScreen.toLowerCase()).not.toContain('cnpj');
  });
});

describe('contrato de fio das opções de provisionamento', () => {
  /**
   * A COSTURA CEGA do sistema. Os testes de comportamento injetam `options`
   * direto no handler, e os do repositório param no corpo enviado — ninguém
   * atravessa o `index.ts`, que é o único lugar onde as duas pontas se
   * encontram e não é alcançável por runner nenhum (importa Deno e esm.sh).
   *
   * Uma divergência aqui não quebra nada visivelmente: a função não acha as
   * opções, cai nos defaults seguros e simplesmente não marca ninguém, em
   * silêncio. Foi o que aconteceu de verdade — a carga inteira nasceria sem
   * troca obrigatória e só se descobriria no primeiro acesso de alguém.
   */
  it('as opções trafegam sob `options`, e as duas pontas concordam', () => {
    expect(indexProvision).toContain('options: body?.options');
    expect(adminRepository).toMatch(/body:\s*\{\s*rows,\s*options:\s*\{/);
  });

  it('nenhuma ponta lê as opções soltas na raiz do corpo', () => {
    expect(indexProvision).not.toContain('body?.requirePasswordChange');
    expect(indexProvision).not.toContain('body?.resetExistingPasswords');
  });

  it('o cadastro avulso leva a senha inicial adiante', () => {
    // Sem esta linha, criar usuário novo pela tela é recusado pelo servidor com
    // "senha inicial obrigatória" — o convite sumiu, a senha ficou obrigatória.
    expect(adminRepository).toContain('input.initialPassword');
  });
});

describe('versão do SDK fixada nas funções publicadas', () => {
  /**
   * As DUAS funções do deploy precisam da versão exata. Um import flutuante
   * (`@2`) resolveria para a mais recente a cada redeploy: a troca depende de
   * `updateUser({ current_password })`, e cair numa versão que ignore esse campo
   * trocaria a senha SEM validar a atual — o gate viraria enfeite.
   */
  it('as duas funções fixam 2.102.0', () => {
    for (const fonte of [indexProvision, indexTroca]) {
      expect(fonte).toContain('@supabase/supabase-js@2.102.0');
    }
  });

  it('nenhuma delas usa import flutuante', () => {
    for (const fonte of [indexProvision, indexTroca]) {
      // `@2` seguido de aspas é a forma flutuante; `@2.102.0` passa.
      expect(fonte).not.toMatch(/supabase-js@2['"]/);
    }
  });
});

describe('initial-password-change — sem convite, sem e-mail, sem atalho', () => {
  it('nenhum mecanismo de envio ou de recuperação é referenciado', () => {
    const proibidos = [
      'inviteUserByEmail',
      'resetPasswordForEmail',
      'generateLink',
      'signInWithOtp',
      'smtp',
      'sendMail',
      'INVITE_REDIRECT_URL',
    ];
    for (const termo of proibidos) {
      expect(indexTroca.toLowerCase()).not.toContain(termo.toLowerCase());
      expect(handlerTroca.toLowerCase()).not.toContain(termo.toLowerCase());
    }
  });

  it('a senha atual é provada por AUTENTICAÇÃO, não por campo enviado ao provedor', () => {
    // `current_password` no update depende de uma configuração do projeto que
    // estava DESLIGADA: uma troca com senha atual errada foi aceita com 200.
    // A prova precisa ser algo que não dependa de botão de painel.
    expect(indexTroca).toContain('grant_type=password');
    expect(indexTroca).not.toContain('current_password');
    // `updateUserById` é administrativo: trocaria a senha sem conferir nada.
    expect(indexTroca).not.toContain('updateUserById');
    expect(handlerTroca).not.toContain('updateUserById');
  });

  it('a troca NÃO passa pelo updateUser do SDK, que exige sessão carregada', () => {
    // Com apenas o cabeçalho Authorization o SDK falha antes de sair da função,
    // e a troca nunca acontecia. O endpoint do GoTrue aceita o JWT direto.
    expect(indexTroca).not.toContain('auth.updateUser(');
    expect(indexTroca).toContain('/auth/v1/user');
  });

  it('a conclusão é server-side e a prova por hash não voltou', () => {
    expect(indexTroca).toContain('service_complete_initial_password_change');
    for (const fonte of [indexTroca, handlerTroca]) {
      expect(fonte).not.toContain('encrypted_password');
      expect(fonte).not.toContain('initial_password_hash');
      expect(fonte.toLowerCase()).not.toContain('bcrypt');
    }
  });

  it('a identidade não é lida do corpo da requisição', () => {
    // O corpo é desestruturado com exatamente dois campos.
    expect(indexTroca).toContain('body?.currentPassword');
    expect(indexTroca).toContain('body?.newPassword');
    expect(indexTroca).not.toContain('body?.userId');
    expect(indexTroca).not.toContain('body?.email');
  });
});

describe('gate no cliente — a troca só acontece no servidor', () => {
  it('a tela do gate NÃO chama o SDK de autenticação', () => {
    for (const proibido of ['auth.updateUser', 'supabase', 'signInWithPassword', 'rpc(']) {
      expect(telaGate).not.toContain(proibido);
    }
  });

  it('a tela não persiste as senhas em lugar nenhum', () => {
    for (const proibido of ['AsyncStorage', 'localStorage', 'sessionStorage', 'SecureStore']) {
      expect(telaGate).not.toContain(proibido);
    }
  });

  it('o repositório chama a Edge Function, e só ela', () => {
    const repo = semComentarios(
      ler(join(RAIZ, 'src', 'services', 'supabase', 'SupabaseAuthRepository.ts')),
    );
    expect(repo).toContain("functions.invoke('initial-password-change'");
    expect(repo).toContain("rpc('password_change_status')");
    // A conclusão é exclusiva do service_role: o cliente não a alcança.
    expect(repo).not.toContain('service_complete_initial_password_change');
    expect(repo).not.toContain('complete_initial_password_change');
  });

  it('o navegador decide a superfície pelo módulo puro', () => {
    expect(navegador).toContain('decideSurface');
    expect(navegador).toContain('InitialPasswordScreen');
    // A comparação solta de status não pode voltar a decidir a navegação.
    expect(navegador).not.toContain("state.status !== 'authenticated'");
  });
});

describe('parceiro AACE não é usuário de login', () => {
  it('o domínio de CNPJ não toca identidade, perfil nem escopo', () => {
    const cnpj = semComentarios(ler(join(RAIZ, 'src', 'domain', 'partners', 'cnpj.ts')));
    for (const proibido of ['auth.users', 'public.users', 'user_scopes', 'createUser', 'authUserId']) {
      expect(cnpj).not.toContain(proibido);
    }
  });

  it('o handler recusa papel sem conta de acesso', () => {
    expect(handlerProvision).toContain('PAPEIS_COM_LOGIN');
    // Exatamente os quatro perfis com login.
    expect(handlerProvision).toMatch(
      /new Set\(\['admin', 'regional', 'coordinator', 'channel_manager'\]\)/,
    );
  });
});
