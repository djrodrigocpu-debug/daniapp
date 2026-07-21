# AACE Excelência Mobile 1.3.0

## Nome da versão

**Publicação Web no Vercel**

## Propósito

Disponibilizar o MVP Expo também pelo navegador, sem retirar a compatibilidade com Android e iOS, e eliminar a página vazia observada no deploy anterior.

## Entregas centrais

1. Suporte a React Native Web.
2. Build de produção web para a pasta `dist`.
3. Configuração de SPA no Vercel.
4. Instalação determinística com `npm ci`.
5. Node.js 22 definido para o ambiente de build.
6. Layout centralizado para uso em telas maiores.
7. Preservação das funcionalidades da v1.2.0.

## Definição de pronto

A versão está pronta quando uma instalação limpa concluir o typecheck, gerar `dist/index.html` e o bundle web sem referências ausentes, com `vercel.json` na raiz do repositório.
