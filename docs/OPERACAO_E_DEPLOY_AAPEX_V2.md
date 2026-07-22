# Operação e Deploy — AAPEX / AACE V2.0

> Runbook de configuração, deploy, backup, rollback e criação do primeiro
> administrador. Fonte: Masterplan §18 (DevSecOps), §19 (continuidade).

## 1. Pré-requisitos e credenciais

| Recurso | Necessário para | Estado |
| --- | --- | --- |
| Node 22.x+ / npm 11+ | build e testes | OK (validado v24 / npm 11) |
| Projeto Supabase | banco, RLS, storage, auth | **BLOQUEADO — P09/DEP-03** |
| Acesso Vercel | deploy web | **BLOQUEADO — DEP-06** |
| E-mails corporativos piloto | seeds de acesso | **BLOQUEADO — DEP-07** |

## 2. Configuração de ambiente

```bash
cp .env.example .env
# preencher EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Regras: variáveis públicas usam prefixo `EXPO_PUBLIC_`. A **service role key nunca**
entra no `.env` do cliente nem no repositório (bloqueada por `assertNoPrivilegedSecrets`
e pelo `.gitignore`). `.env` está git-ignored.

## 3. Provisionamento do Supabase (quando P09 aprovado)

1. Criar projeto na região aprovada (DPA/transferência internacional — §14.6).
2. Obter `Project URL` e `anon key` (Settings > API) → preencher `.env`.
3. A `service_role key` vive apenas nos secrets do provedor / funções server-side.

## 4. Migrations e seeds

Ordem de execução (via Supabase CLI ou SQL editor):

```bash
# esquema, RLS e integridade
psql "$DATABASE_URL" -f supabase/migrations/0001_core_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_rls_policies.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_integrity_triggers.sql
# seed de catálogo (apenas dev/homologação; produção exige revisão P05)
psql "$DATABASE_URL" -f supabase/seed/0001_seed_catalog.sql
```

Rollback do esquema (homologação): `supabase/migrations/0001_core_schema.down.sql`.
Alteração destrutiva em produção exige plano de migração aprovado (§18.3).

## 5. Criação do primeiro administrador (sem expor senha)

**Nunca** por senha embutida. Fluxo:

1. Criar o usuário no Supabase Auth (Dashboard > Authentication > Add user, ou
   função server-side com service role) usando o e-mail corporativo aprovado (P03).
2. Inserir o perfil e o escopo admin:
   ```sql
   insert into public.users (id, display_name, corporate_email, status)
     values ('<auth-user-id>', 'Administrador', 'admin@empresa', 'active');
   insert into public.user_scopes (user_id, role) values ('<auth-user-id>', 'admin');
   ```
3. Enviar convite/redefinição de senha; o admin define a senha no primeiro acesso e
   ativa MFA (P10).

## 6. Build e deploy web (Vercel)

```bash
npm ci
npm run typecheck
npm test
npm run build      # expo export --platform web  → dist/
```

`vercel.json` já aponta o build. Variáveis `EXPO_PUBLIC_*` são configuradas no painel da
Vercel (Environment Variables). Deploy de produção sujeito a aprovação (§18.2).

## 7. Build mobile (Expo / EAS)

```bash
npm run build:android:preview   # eas build --platform android --profile preview
npm run build:ios:preview
```

Upgrades de SDK Expo ocorrem em janela planejada com regressão de câmera/documentos/
storage/web (§18.4). Mantido SDK 57.

## 8. Backup e restauração (§17.5, §19)

- Backups automáticos conforme plano contratado (RPO ≤ 24 h; RTO ≤ 8 h no piloto).
- **Teste de restauração antes do piloto** (obrigatório, T19): restaurar em ambiente
  isolado, verificar contagem, integridade referencial, snapshots, usuários, logs e
  amostra de evidências; registrar RTO/RPO observados. **Bloqueado por P09.**

## 9. Rollback

- **Aplicação web**: redeploy da versão anterior na Vercel (tags de versão / changelog).
- **Schema**: aplicar `*.down.sql` correspondente em homologação; em produção, só com
  plano aprovado.
- **Dados**: restauração de backup (§8).

## 10. Observabilidade (§15.2)

Métricas: erro, latência, crashes, falhas de login, falhas de RLS, fila de sync, upload,
storage, jobs, disponibilidade, versões. Ferramenta a definir (**P12**). Telemetria sem
coleta excessiva de comportamento individual.

## 11. Checklist de produção

Ver Anexo K do Masterplan em
[`masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md`](masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md#anexo-k-checklist-para-autorização-do-piloto).

## 12. Comandos de validação local

```bash
npm ci
npm run typecheck
npm test
npm run build
```
