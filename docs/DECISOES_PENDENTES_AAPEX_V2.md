# Decisões Pendentes — AAPEX / AACE V2.0

> Cada bloqueio indica: **o dado necessário, quem fornece, onde configurar, como validar e a funcionalidade dependente.**
> Nada aqui é preenchido por suposição. Fonte: Masterplan §28 (P01–P15) e §4.3 (gates).

## Decisões corporativas (Masterplan §28)

| ID | Decisão | Dono | Gate | O que depende disso | Onde será configurado | Como validar |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | Nome oficial do produto e relação AAPEX/AACE | Negócio | G0 | Textos de marca, título do app | `app.json`, telas de marca | Revisão de negócio |
| P02 | Identidade: SSO, domínio de e-mail ou Auth | TI/Segurança | G0 | `REQ-A-02` login individual | `.env` + config Supabase Auth | Login real de teste |
| P03 | Pessoa(s) com perfil Administrador | Patrocinador | G0 | Criação do 1º admin (runbook) | Função server-side / seed controlado | Primeiro acesso |
| P04 | Coordenador pode executar visita? | Negócio | G0 | `REQ-O-01`, policy de criação de visita | `authz/policy.ts` (flag) | Teste RBAC |
| P05 | Validade dos 24 temas e 12 indicadores | Negócio | G1 | `REQ-D-09` seeds de catálogo | `supabase/seed/0002_seed_catalog.sql` | Revisão de conteúdo |
| P06 | Regra exata de terça-feira e rodízio | Regional | G1 | `REQ-O-05` regras de calendário | `visit_rules` + `calendar.ts` | Teste de calendário |
| P07 | Base legal e aviso de privacidade | DPO/Jurídico | G1 | `REQ-SEC-05` | Documento + tela de aviso | Aprovação DPO |
| P08 | Evidências permitidas e retenção | DPO/Negócio | G1 | `REQ-SEC-04`, `evidence_files.retention_until` | Política + migration | Aprovação DPO |
| P09 | Fornecedor, região e plano contratado | TI/Compras | G1 | Todo o backend real (Supabase) | Projeto Supabase + `.env` | Conexão e restauração |
| P10 | MFA para GCs | Segurança/Negócio | G2 | `REQ-A-09` | Config Supabase Auth [R10] | Fluxo MFA |
| P11 | Ranking nominal pós-piloto | Comitê/Ética | G5 | `REQ-UX-05` (permanece off no piloto) | Feature flag | Revisão ética |
| P12 | Ferramenta de monitoramento | TI/Segurança | G2 | Observabilidade §15.2 | Integração externa | Dashboards |
| P13 | SLA e equipe de suporte | Patrocinador | G4 | Operação do piloto | Runbook | Plano de suporte |
| P14 | Critérios finais de sucesso | Comitê | pré-baseline | §21.3 limiares | Protocolo do piloto | Assinatura |
| P15 | Integrações e BI após piloto | Patrocinador | G5 | Escopo pós-piloto | — | Decisão de escala |

## Dependências externas de credencial/infra (bloqueios técnicos)

| ID | Dependência | Necessário para | Onde configurar | Como validar |
| --- | --- | --- | --- | --- |
| DEP-01 | `EXPO_PUBLIC_SUPABASE_URL` | Cliente Supabase | `.env` (ver `.env.example`) | App conecta e lê catálogo |
| DEP-02 | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase | `.env` | Login de teste |
| DEP-03 | Projeto Supabase provisionado | Migrations, RLS, Storage, Auth | Dashboard Supabase / CLI | `supabase db push` + testes RLS reais |
| DEP-04 | Bucket privado de evidências | `REQ-D-07`, `REQ-E-06` | Supabase Storage | Upload + URL assinada |
| DEP-05 | Service role key (somente servidor) | Funções privilegiadas `REQ-A-10` | Secret do provedor — **nunca** no repo | Criação de usuário via função |
| DEP-06 | Acesso Vercel | Deploy web de preview | Projeto Vercel | Build e deploy de preview |
| DEP-07 | E-mails corporativos dos usuários piloto | Seeds de acesso | Função server-side | Primeiro acesso |

## Contradições normativas registradas

| # | Tema | Descrição | Resolução adotada nesta implementação |
| --- | --- | --- | --- |
| C-01 | "Administrador = Gerente Regional" (sumário v1.0) × "Administrador é permissão" (§4.2, D-04) | O Masterplan V2 arbitra: perfis **distintos**. | Implementado como 4 perfis separados (`admin` ≠ `regional`). Prevalece Masterplan. |
| C-02 | Tipos atuais têm 3 papéis (`regional/coordinator/channel_manager`) × Masterplan exige 4 (+admin) | Código demonstrativo desatualizado | Adicionado `admin` ao modelo de papéis. |
| C-03 | Auditoria sugere Supabase (Alt. A) × decisão condicionada a Compras (D-08, P09) | Recomendação, não decisão fechada | Arquitetura implementada como referência; marcada `CONCLUÍDO COM RESSALVA` até P09. |
