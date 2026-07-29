# Changelog

## 1.3.0 — Publicação Web no Vercel

### Microcorreção — contador de ações, nomes funcionais e Validações para Administração
- Contador de ações abertas (`ui_operations."openActions"`, aba Ações e cartão do
  Parceiro AACE) passa a incluir `waiting_partner`; `done`/`validated`/`cancelled_justified`
  continuam fora.
- Ficha do Parceiro AACE mostra o nome funcional do Gerente de Canal, do coordenador
  responsável e da coordenadoria (antes apareciam como "—" para Coordenação e Regional,
  por limite de leitura de `public.users`); Fila de validação mostra o nome do avaliador
  pelo mesmo mecanismo. Projeção nova e restrita ao escopo (`ui_operation_people`,
  `ui_evaluation_people` — migration 0026); `public.users` permanece fechado.
- Administração passa a ver a aba Validações — a mesma existente para Coordenação e
  Regional (mesma rota/componente/RPC), não uma tela nova. Gerente de Canal continua
  sem a aba.
- Rótulo "Índice médio" no painel passa a "Índice médio geral", com a cobertura
  "X de Y parceiros auditados" e uma nota curta explicando que parceiros sem auditoria
  aprovada entram como zero. A fórmula do índice não mudou.

- Inclusão de `react-dom` e `react-native-web`.
- Inclusão dos scripts `build`, `build:web` e `vercel-build`.
- Exportação web do Expo configurada no modo SPA (`single`).
- Inclusão de `vercel.json` com build, pasta `dist` e rewrite para `index.html`.
- Fixação do ambiente de build em Node.js 22.
- Documentação de publicação e diagnóstico de Root Directory.
- Atualização Android versionCode 4 e iOS buildNumber 4.

## 1.2.0 — Gestão Assistida
- Inclusão de metas e resultados por parceiro.
- Semáforo automático meta × realizado.
- Priorização automática para a visita.
- Diagnósticos padronizados por indicador.
- Plano de ação vinculado aos indicadores fora da meta.
- Objetivo e relatório da visita.
- Retroalimentação automática da visita anterior.
- Inclusão dos indicadores definidos para a gestão do parceiro e do Gerente de Canal.
- Atualização Android versionCode 3 e iOS buildNumber 3.

## 1.1.0 — Agenda e Prazos
- Agenda consolidada de auditorias e planos de ação.
- Filtros de prazo e atrasos.

## 1.0.0 — Fundação Mobile
- Estrutura inicial do aplicativo, auditorias, evidências, ações e validações.
