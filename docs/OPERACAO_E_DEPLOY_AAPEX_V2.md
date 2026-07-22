# Operação e Deploy — AAPEX / AACE V2.0

> Runbook de configuração, deploy, backup, rollback e criação do primeiro administrador.
> Consolidado na Fase 18. Este arquivo é criado na Fase 0 e preenchido incrementalmente.

## Índice

1. Pré-requisitos e credenciais
2. Configuração de ambiente (`.env`)
3. Provisionamento do Supabase
4. Migrations e seeds
5. Criação do primeiro administrador (sem expor senha)
6. Build e deploy web (Vercel)
7. Build mobile (Expo / EAS)
8. Backup e restauração
9. Rollback
10. Observabilidade
11. Checklist de produção (Anexo K do Masterplan)

> Seções detalhadas são preenchidas ao longo das fases. Ver `IMPLEMENTATION_STATUS_AAPEX_V2.md`
> para o andamento e `DECISOES_PENDENTES_AAPEX_V2.md` para os bloqueios (P09, DEP-01..07).

## 1. Pré-requisitos e credenciais

- Node 22.x+ (validado com v24), npm 11+.
- Projeto Supabase provisionado (**pende P09/DEP-03**).
- Acesso Vercel (**pende DEP-06**).
- Variáveis de ambiente — ver `.env.example`.

## 2. Configuração de ambiente

Copie `.env.example` para `.env` e preencha. Nunca versionar `.env` (já em `.gitignore`).
As variáveis públicas usam prefixo `EXPO_PUBLIC_`. A **service role key nunca** vai ao
cliente nem ao repositório (DEP-05).

## 5. Criação do primeiro administrador (sem expor senha)

O primeiro admin é criado por **função server-side / convite Supabase**, nunca por senha
embutida no código. Fluxo previsto: administrador recebe convite por e-mail corporativo →
define a própria senha no primeiro acesso → MFA conforme política (P10). Detalhamento na
Fase 18.

## 11. Checklist de produção

Ver Anexo K do Masterplan em
[`masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md`](masterplan/MASTERPLAN_EXECUTIVO_CIENTIFICO_AAPEX_AACE_V2.md#anexo-k-checklist-para-autorização-do-piloto).
