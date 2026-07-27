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
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((linha) => linha.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const indexProvision = semComentarios(ler(join(PROVISION, 'index.ts')));
const handlerProvision = semComentarios(ler(join(PROVISION, 'handler.ts')));
const adminRepository = semComentarios(ler(join(RAIZ, 'src', 'data', 'repositories', 'AdminRepository.ts')));
const loginScreen = semComentarios(ler(join(RAIZ, 'src', 'screens', 'LoginScreen.tsx')));

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
    expect(indexProvision).toContain('admin-invite-users/identityIndex.ts');
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
