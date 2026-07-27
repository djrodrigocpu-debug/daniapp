# Segurança da Informação e LGPD — AAPEX / AACE V2.0

> Modelo de ameaças resumido, controles e ciclo de vida de dados.
> Fonte normativa: Masterplan §13 (segurança), §14 (LGPD), §15 (auditoria).
> Referenciais: NIST CSF 2.0 [R3], OWASP ASVS 5.0 [R4], MASVS [R5], ISO 27001 [R7].

## 1. Princípios aplicados no código

| Princípio (Masterplan) | Onde é aplicado neste repositório |
| --- | --- |
| O cliente não decide o acesso (§5.1) | RLS em `supabase/migrations/0002_rls_policies.sql`; `policy.ts` apenas espelha |
| Deny-by-default (§13.3) | RLS habilitada/forçada em todas as tabelas; sem policy ⇒ negado |
| Nenhum segredo no cliente (§13.3) | `assertNoPrivilegedSecrets` (`src/config/env.ts`); varredura `no-demo-secret.test.ts`; `.gitignore` de `.env*` |
| Histórico imutável (§11.4) | Triggers `guard_approved_evaluation`, `official_snapshots` append-only; `addendum.ts` |
| Indicador usado não deletável (D-05) | Trigger `guard_indicator_delete`; `lifecycle.ts` |
| Trilha append-only (§15.1) | `audit_logs` + triggers de bloqueio de update/delete |
| Segregação (§5.3) | `can_validate` (SQL) e `canValidate` (domínio): sem autoaprovação |

## 2. Modelo de ameaças (STRIDE resumido)

| Ameaça (§13.2) | Vetor | Mitigação implementada | Status |
| --- | --- | --- | --- |
| Credencial compartilhada/comprometida | senha única no bundle | senha demo **removida**; login individual; MFA (P10) | Mitigado / P10 |
| Escalada de privilégio / falha de RLS | consulta direta ao banco | RLS deny-by-default + testes de isolamento (T01) | Mitigado (exec. real P09) |
| Chave de serviço exposta no cliente | bundle/repo | `assertNoPrivilegedSecrets` + varredura + `.gitignore` (T03) | Mitigado |
| Evidência por URL pública | link vazado | bucket privado + URL assinada curta (`evidence_files`, §11.5) | Projetado (storage P09) |
| Exportação excessiva | export sem controle | `exportGuard.ts`: escopo + marca d'água + admin p/ bruto (T16) | Mitigado |
| Alteração retroativa de avaliação | edição pós-aprovação | imutabilidade + adendo (T07) | Mitigado |
| Perda/roubo de dispositivo | dados locais | só o necessário no device; tokens em store seguro; expiração (§12.2) | Projetado |
| Dependência vulnerável | libs desatualizadas | `npm audit` no pipeline; inventário (§18.2) | Parcial (ver §6) |
| Recuperação de conta indevida | enumeração | reset sem revelar existência da conta (§13.2) | Mitigado |
| Vazamento em logs | payload sensível | `AppError.toLogRecord` sem stack/segredo; audit_logs sem token | Mitigado |
| Perda de backup | falha de restore | teste de restauração documentado (§19); execução P09 | Bloqueado (P09) |
| Dado de cliente em foto | evidência | política "sem dado de cliente" + validação MIME/tamanho | Projetado + política P08 |

## 3. Controles de identidade e autorização

- **Login individual** via Supabase Auth (`SupabaseAuthRepository`); sem senha no código.
- **MFA** obrigatório para Admin/Regional/Coordenador (política); GCs dependem de **P10**.
- **RBAC + escopo**: papéis `admin/regional/coordinator/channel_manager` + `user_scopes`
  com vigência; `subjectFromSession` deriva o escopo efetivo.
- **Segregação de funções**: `can_validate` (SQL) e `canValidate` (domínio) impedem
  autoaprovação (T02); aprovação em lote proibida no piloto.
- **Ciclo de acesso** (§5.4): convite → definição de senha → MFA → revisão → suspensão
  imediata em desligamento; autoria histórica preservada (usuário é inativado, não apagado).

## 4. Dados pessoais e LGPD (§14)

### 4.1 Categorias tratadas
Identidade/contato corporativo; papel/vínculo/unidade/operação; registros de visitas e
validações; evidências (imagens/documentos); logs de acesso; comentários e diagnósticos.
**Não** se coleta CPF, saúde, localização contínua ou dados de cliente final sem
necessidade aprovada.

### 4.2 Base legal e inventário — **BLOQUEADO (P07)**
A base legal, o inventário de tratamento e o aviso de privacidade são de responsabilidade
do DPO/Jurídico (P07). A equipe técnica **não** decide a base legal. Campos e finalidades
já estão descritos no Anexo C do Masterplan (dicionário de dados).

### 4.3 Retenção proposta (ratificação DPO — P08)

| Dado | Retenção proposta | Implementação |
| --- | --- | --- |
| Avaliações/snapshots oficiais | ciclo + política | imutáveis; sem expurgo automático |
| Evidências | 24 meses após fechamento | `evidence_files.retention_until` |
| Rascunhos abandonados | 90 dias | job de limpeza (reconciliação §15.4) |
| Logs de auditoria | mínimo regulatório | append-only |
| Exportações temporárias | 7 dias | link expirável |
| Conta inativa | preserva autoria; remove acesso | inativação, não delete |

### 4.4 Direitos dos titulares
Correção de dado histórico usa **retificação/adendo**, não apagamento da evidência de que
o registro existiu (§14.5). Solicitações seguem o processo corporativo.

## 5. Trilha de auditoria (§15.1)

Eventos mínimos registrados em `audit_logs` (append-only): login/logout/falha/MFA;
concessão/revogação de perfil; criação/submissão/devolução/aprovação; alteração de vínculo;
criação/inativação/versionamento de indicador; download de evidência sensível; exportação;
adendo; mudança de retenção; operação administrativa. O log guarda **quem, quando, ação,
objeto, resultado** — nunca senha, token ou payload sensível.

## 6. Pendências e riscos residuais de segurança

- **`npm audit`** reporta vulnerabilidades em dependências transitivas de ferramentas de
  build/teste (vitest/esbuild, cadeia Expo). Nenhuma no caminho de runtime corporativo
  identificada até aqui; **ação:** rodar `npm audit` no CI e tratar por severidade (§18.2).
- **Execução de RLS/restauração em banco real**: `BLOQUEADO POR DEP. EXTERNA` (P09/DEP-03).
- **MFA para GCs**: decisão **P10**.
- **Base legal / aviso / retenção**: decisões **P07/P08** (DPO).

## 7. Critérios de interrupção (Masterplan §26.1)

Pausar imediatamente em caso de: acesso entre escopos, evidência pública, perda de
avaliação aprovada, chave privilegiada exposta, incidente relevante de dados pessoais,
impossibilidade de restaurar ou risco operacional não controlado.
