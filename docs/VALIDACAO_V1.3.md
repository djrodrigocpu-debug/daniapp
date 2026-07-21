# Validação técnica — v1.3.0

Data: 20/07/2026

## Resultado

A versão 1.3.0 foi preparada para publicação como aplicação web Expo no Vercel.

## Verificações executadas

- Instalação limpa com `npm ci`: aprovada.
- TypeScript com `npm run typecheck`: aprovado, sem erros.
- Configuração pública do Expo: versão 1.3.0, saída web `single`, bundler `metro`.
- Build de produção com `npm run build:web`: aprovado.
- Pasta gerada: `dist`.
- Arquivo principal gerado: `dist/index.html`.
- Bundle JavaScript web gerado em `dist/_expo/static/js/web/`.
- Referências do `index.html`: nenhuma referência local ausente.
- `vercel.json`: build, saída e rewrite de SPA incluídos.

## Auditoria de dependências

O `npm audit --omit=dev` não encontrou vulnerabilidades altas ou críticas. Foram reportadas vulnerabilidades moderadas em dependências transitivas da cadeia Expo; não foi aplicado `npm audit fix --force`, pois isso poderia atualizar componentes de forma incompatível com o SDK utilizado.

## Expo Doctor

As verificações locais essenciais passaram. Duas verificações que dependem da API externa do Expo podem falhar quando o ambiente de validação não consegue acessar `exp.host`; isso não impediu a instalação, o typecheck ou o build web.

## Limite funcional

O aplicativo continua sendo um MVP demonstrativo com persistência local. A publicação no Vercel torna a interface acessível pela web, mas não adiciona backend, banco compartilhado ou autenticação de produção.
