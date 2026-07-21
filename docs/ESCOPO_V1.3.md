# Escopo v1.3.0 — Publicação Web no Vercel

## Incluído

- Adaptação do projeto Expo para web.
- Dependências `react-dom` e `react-native-web`.
- Scripts de build web.
- Configuração `expo.web` em modo SPA.
- Configuração de build e rotas no Vercel.
- Documentação de publicação.
- Ajustes mínimos de responsividade e tipagem.

## Não incluído

- Backend ou API.
- Banco de dados central.
- Login corporativo real.
- Sincronização entre aparelhos ou navegadores.
- Hospedagem de arquivos de evidência em nuvem.
- Migração para Expo Router.

## Critério de aceite

O Vercel deve conseguir executar `npm ci`, `npm run build:web` e publicar a pasta `dist`, exibindo a tela de login do aplicativo.
