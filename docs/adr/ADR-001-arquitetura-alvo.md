# ADR-001 — Arquitetura-alvo Expo + Supabase + Vercel

- **Status:** proposto (condicionado a P09 — aprovação de Compras/Segurança/Privacidade)
- **Data:** 2026-07-22
- **Decisores:** Responsável técnico (proposta) · aprovação pendente do Comitê AAPEX

## Contexto

O aplicativo AACE Excelência Mobile é hoje um protótipo demonstrativo: autenticação por
senha única no bundle (`Aace@2026`), dados em AsyncStorage local, evidências por URI de
dispositivo e permissões apenas na interface (ver `docs/auditorias/`). O Masterplan V2
(§9, §10) exige camada de dados central, autenticação individual, RBAC/RLS no servidor,
histórico imutável e evidências privadas. O domínio é relacional e histórico (usuários →
escopos; operações → coordenadores/GCs; avaliações → versões de template; medições →
versões de indicador; snapshots e consolidações).

## Opções consideradas

1. **Supabase** — PostgreSQL + Auth + RLS + Storage privado + funções server-side.
2. **Firebase/Firestore** — offline nativo robusto, porém NoSQL dificulta rankings/
   consolidações e as security rules são menos expressivas para hierarquia de 4 níveis.
3. **API própria** (Node + Postgres em Vercel Functions/Neon ou VPS) — controle total,
   mas cria infraestrutura e código desproporcionais a 20–25 usuários.

## Decisão

Adotar **Supabase** como backend de referência, mantendo o front Expo/React Native
(Android/iOS/Web) e o deploy web na **Vercel**. Justificativa (Masterplan §10.2): o
caráter relacional-histórico favorece PostgreSQL; RLS leva a matriz de permissões ao
servidor [R8]; Storage privado com URL assinada atende evidências [R9]; manutenção mínima
para a escala do piloto.

A decisão é **condicionada** à aprovação corporativa de fornecedor, região de dados,
contrato/DPA e transferência internacional (D-08, P09). Enquanto pendente, o repositório
implementa migrations versionadas, cliente tipado, contratos de repositório, políticas RLS
em SQL e testes — tudo executável assim que o projeto real for provisionado.

## Consequências positivas

- Autorização real no servidor (RLS deny-by-default), não cosmética.
- Histórico imutável e versionamento suportados por SQL e constraints.
- Portabilidade: esquema SQL versionado no repositório reduz lock-in.

## Consequências negativas e riscos

- Dependência de BaaS (mitigação: export lógico, migrations versionadas, plano de saída §19.4).
- Free tier inadequado para produção (R10 — exige plano contratado, P09).
- Service role **jamais** no cliente (mitigado por guarda de teste e revisão).

## Evidências e revisão

- Testes de RLS positivos/negativos por perfil (Anexo D: T01, T02, T03).
- Revisão no Gate 1 (dados/privacidade) e Gate 2 (fundação técnica).
- Reavaliar se P09 recomendar outro provedor.
