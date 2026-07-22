# AUDITORIA_TECNICA_PRELIMINAR_AACE_V2

**Status: documento preliminar.** A responsável pelo aplicativo está preparando um novo Masterplan, mais completo. O PDF "AAPEX — Plano Master v1.0" (1 página) é tratado aqui apenas como **sumário preliminar**, não como especificação final. Nada nesta auditoria é decisão aprovada, exceto a única decisão funcional confirmada registrada na seção 2. A consolidação do MASTERPLAN_EXECUTIVO_AACE_V2 definitivo, a resolução de contradições, a arquitetura final, a matriz definitiva de permissões e a divisão em fases **aguardam o novo Masterplan**.

Nesta sessão nada foi implementado: nenhum arquivo do repositório editado, nenhum commit, push, branch, dependência ou alteração de deploy.

## 1. Confirmações do ambiente

1. Caminho local: `C:\Users\Asus\Documents\dani app\Nova pasta\AACE_Excelencia_Mobile_v1.3.0`
2. Topo do Git: o mesmo caminho (raiz do repositório)
3. Branch: `main`
4. HEAD: `3051ef3` — "Restaura npm ci com package-lock.json regenerado"
5. Origin: `https://github.com/djrodrigocpu-debug/daniapp.git` (daniapp confirmado)
6. Árvore: limpa
7. Projeto analisado: daniapp / AACE Excelência Mobile ✔
8. Nenhum arquivo do ler-4.1 / Ler Sem Vergonha foi acessado nem usado como referência ✔

Inventário: 65 arquivos rastreados; ~30 de código TypeScript com <4.000 linhas. O código foi lido integralmente nesta sessão, sem uso de agentes.

## 2. Única decisão funcional confirmada até agora

> **Somente o perfil Administrador pode incluir ou excluir indicadores avaliados. Para indicadores já usados em avaliações, "excluir" significa inativar para avaliações futuras, preservando integralmente o histórico.**

Implicação técnica registrada (não é decisão nova, apenas decorrência): o cadastro de indicadores precisará de um estado ativo/inativo e as avaliações passadas devem referenciar a definição vigente à época — exclusão física de indicadores usados fica proibida por regra de negócio.

## 3. Diagnóstico do código atual

### 3.1 O que funciona de verdade (dentro do aparelho)

- Checklist de auditoria semanal/mensal com 24 temas ([catalog.ts](src/data/catalog.ts)), semáforo por item, nota ponderada por peso ([scoring.ts](src/utils/scoring.ts)).
- Bloqueios reais de envio ([AppContext.tsx:224](src/context/AppContext.tsx:224)): 100% dos itens preenchidos, evidência obrigatória por tema, plano de ação obrigatório para item vermelho.
- Captura de evidências por câmera e anexo de documentos (Expo Image/Document Picker) — porém com URIs locais (ver riscos).
- Fila de validação com aprovar/devolver e atualização da nota oficial da operação ([ValidationsScreen.tsx](src/screens/ValidationsScreen.tsx)).
- Gestão assistida: 12 indicadores com meta × realizado, semáforo automático, atingimento, diagnóstico por chips, relatório de visita com retroalimentação da visita anterior ([PerformanceScreen.tsx](src/screens/PerformanceScreen.tsx), [performance.ts](src/data/performance.ts)).
- Planos de ação com estados, filtros e prazos ([ActionsScreen.tsx](src/screens/ActionsScreen.tsx)).
- Agenda derivada de auditorias + planos, com janelas hoje/7/30 dias e destaque de vencidos ([AgendaScreen.tsx](src/screens/AgendaScreen.tsx)).
- Dashboard com métricas derivadas reais (média, críticas, ações abertas, validações pendentes).
- Visibilidade hierárquica em 3 papéis (regional vê tudo; coordenador vê suas operações; gerente de canal vê as dele) — apenas no cliente.

### 3.2 O que é simulado ou fictício

- **Login**: senha única `Aace@2026` exportada em [mock.ts:5](src/data/mock.ts:5) e exibida na tela de login; botões de "perfis demonstrativos". Não há autenticação real.
- **Dados**: 6 usuários e 6 operações fictícios; resultados de indicadores gerados por fórmula (`previousActual = actual × 0,9`); datas fixas de julho/2026; `nextAudit` é campo estático, sem regra de calendário.
- **Persistência**: um único JSON no AsyncStorage do aparelho (`@aace_excelencia:data:v1.2`). Não existe banco compartilhado, API nem sincronização — cada dispositivo é um mundo isolado. O próprio app declara "Modo de dados: Demonstração local" no perfil.
- **Multiusuário**: o fluxo GC→coordenador só funciona trocando de login no mesmo aparelho.
- Detalhe menor: o perfil exibe versão "1.2.0" hardcoded ([ProfileScreen.tsx:33](src/screens/ProfileScreen.tsx:33)) embora o app seja 1.3.0.

### 3.3 O que está apenas desenhado / ausente

Ausentes por completo: perfil Administrador; gestão de usuários e operações (tudo hardcoded); boas práticas; rankings; "Como começar" por cargo; versionamento e inativação de indicadores; snapshots históricos; avaliação de desempenho de GCs; visão consolidada de coordenadores; visão regional de evolução; regra de calendário (terças / 1ª segunda do mês); offline com sincronização (o que existe é "tudo local", que não é sincronização); trilha de auditoria; export de relatórios.

### 3.4 Controle de permissões

Existe e funciona, mas 100% no cliente (`visibleOperations` no [AppContext.tsx:99](src/context/AppContext.tsx:99); aba Validações oculta para GC no [AppNavigator.tsx:38](src/navigation/AppNavigator.tsx:38)). Sem servidor, não há enforcement real: qualquer pessoa com o app tem acesso a tudo que estiver no aparelho.

### 3.5 Veredito de arquitetura

A arquitetura atual (monólito no dispositivo + AsyncStorage) **não suporta** os requisitos centrais (base compartilhada, autenticação individual, RBAC, histórico central). Porém o código é limpo, tipado e consistente; a limitação é de camada de dados, não de qualidade.

## 4. Partes reaproveitáveis × substituíveis (avaliação preliminar)

**Reaproveitáveis com alto valor:**
- Todos os 9 componentes visuais (`src/components/`): AppButton, OperationCard, MetricCard, StatusPill, ProgressBar, ActionPlanModal, Screen, SectionTitle, EmptyState.
- Tema e identidade visual (`src/theme/`).
- As 10 telas como base de UI (a lógica de dados muda, o layout permanece).
- Regras de domínio: `calculateScore`, `completionRate`, `calculateIndicatorStatus`, `achievement`, helpers de `format.ts`.
- Conteúdo dos catálogos (24 temas, 12 indicadores) como **seed** de um futuro banco.
- Navegação, configuração Expo/Vercel ([vercel.json](vercel.json), build web funcionando).

**A substituir quando houver decisão:**
- `mock.ts` (dados fictícios e senha demo — a senha deve sair do código em qualquer cenário).
- Autenticação e persistência do `AppContext` (AsyncStorage-como-banco).
- Elementos demonstrativos da tela de login.

**Avaliação preliminar (não decidida):** reconstrução completa parece desnecessária; refatoração profunda da camada de dados com reaproveitamento da interface parece o caminho de menor risco. **Aguarda o novo Masterplan.**

## 5. Riscos técnicos identificados

1. **Senha demo no bundle**: `Aace@2026` está no código-fonte público do app e do repositório; qualquer publicação atual é insegura por definição.
2. **Evidências com URIs locais**: fotos/documentos apontam para cache do aparelho; perdem-se entre sessões/dispositivos e não funcionam de forma durável na web (blob URLs).
3. **Permissões só no cliente**: sem servidor, qualquer regra de visibilidade é cosmética.
4. **Sem histórico imutável**: editar meta/indicador hoje sobrescreve o valor — incompatível com a decisão confirmada da seção 2; exigirá versionamento/inativação no modelo futuro.
5. **Datas mockadas**: agenda e "próxima auditoria" não seguem a rotina real (terças / 1ª segunda); há risco de o piloto confiar em datas fictícias.
6. **Expo SDK 57**: AGENTS.md do repo exige consultar as docs versionadas (v57) antes de qualquer código novo; APIs mudaram entre SDKs.
7. **Web × câmera**: captura de foto no navegador tem comportamento distinto do nativo; upload de arquivo já existe como alternativa.
8. **Free tiers**: se a escolha recair sobre BaaS gratuito, considerar pausas por inatividade e limites de storage para evidências.

## 6. Perguntas ainda não respondidas (para o novo Masterplan)

1. Quem recebe a permissão de Administrador no início? O admin também executa visitas?
2. Operações/parceiros terão login próprio (5º nível de acesso) ou são apenas registros?
3. Os 24 temas e 12 indicadores atuais estão corretos/atualizados? (A regra de inclusão/exclusão já está confirmada — seção 2; falta validar o conteúdo.)
4. Avaliação dos GCs: derivada automaticamente das operações, qualitativa pelo coordenador, ou ambas?
5. Boas práticas: publicação livre ou com aprovação prévia? Quem pode publicar?
6. Rankings de pessoas (GCs, coordenadores): visíveis a todos ou restritos por nível? (Potencial tensão com a cláusula de ética do sumário: "vedado uso para constrangimento ou exposição indevida".)
7. Visita semanal de terça: todas as operações toda terça, ou rodízio?
8. E-mails de login: corporativos ou pessoais? Haverá domínio restrito?
9. Evidências podem conter dados de clientes finais? Qual o prazo de retenção?
10. Confirma-se que não há dados reais a migrar (tudo hoje é demonstração)?
11. "Administrador (Gerente Regional)" no sumário × "admin como permissão" no briefing: o novo Masterplan deve arbitrar.
12. O que exatamente se espera de "Business Intelligence" (V2.0 do sumário)? Dashboards internos + export podem bastar para 20–25 usuários.

## 7. Alternativas arquiteturais preliminares (nenhuma decidida)

Contexto: 20–25 usuários, base central, rascunhos locais, offline com sincronização posterior, evidências em nuvem, web na Vercel, baixa manutenção e baixo custo.

- **Alternativa A — Supabase (Postgres + Auth + RLS + Storage)**: banco relacional favorece rankings, snapshots e consolidações via SQL; RLS permite levar a matriz de permissões para o servidor; storage com URL assinada para evidências; sem servidor próprio; free tier compatível com a escala. Offline resolvido de forma simples: rascunhos locais (modelo atual preservado) + fila de envio + cache de leitura.
- **Alternativa B — Firebase/Firestore**: offline nativo robusto (ponto forte), autenticação pronta; porém modelagem NoSQL dificulta rankings/consolidações, e as security rules são menos expressivas que RLS para hierarquia em 4–5 níveis.
- **Alternativa C — API própria (Node + Postgres, Vercel Functions + Neon ou VPS)**: controle total, mas cria código e infraestrutura para manter — desproporcional à escala de 20–25 usuários.

Inclinação preliminar da auditoria: **Alternativa A**, por aderência ao caráter gerencial-relacional do produto e manutenção mínima. **Não é decisão** — a escolha final depende do novo Masterplan (especialmente do escopo de offline e do 5º nível de acesso).

Em qualquer alternativa: o front Expo (Android/iOS/Web) e o deploy web na Vercel permanecem válidos e reaproveitados.

## 8. Pendências que aguardam o novo Masterplan

- Revisão dos requisitos e resolução das contradições apontadas (admin × cargo; rankings × ética; política LGPD; sobreposição checklist × indicadores).
- Definição da arquitetura final.
- Matriz definitiva de cargos e permissões.
- Modelo de dados definitivo.
- Divisão da implementação em fases com testes e critérios de aprovação.
- Produção do **MASTERPLAN_EXECUTIVO_AACE_V2 definitivo**.

---

## Ação única proposta após aprovação (nada mais será executado)

Publicar este documento como **Artefato privado** intitulado `AUDITORIA_TECNICA_PRELIMINAR_AACE_V2` (fora do repositório Git), claramente marcado como preliminar. Nenhum arquivo do repositório será tocado; sem commit, push, branch, dependências ou deploy. Se preferir mantê-lo apenas como documento local (sem Artefato), basta indicar na aprovação.