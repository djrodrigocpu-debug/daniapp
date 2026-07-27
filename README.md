# AAPEx

Aplicativo em React Native, Expo e TypeScript para avaliar se os Parceiros AACE do canal PR/SC estão cumprindo os indicadores definidos. (Nome anterior do produto: AACE Excelência Mobile — os identificadores técnicos, como slug e bundle id, permanecem os originais por compatibilidade.)

## Novidade da v1.3.0

A versão agora gera uma aplicação web estática compatível com o Vercel. Foram adicionados o suporte do React Native Web, o comando de build, a pasta de saída `dist` e a configuração de SPA no `vercel.json`.

## Executar localmente

```bash
npm ci
npm start
```

Para abrir diretamente no navegador:

```bash
npm run web
```

## Gerar a versão web

```bash
npm run build:web
```

O resultado será criado na pasta `dist`.

## Publicar no Vercel

1. Coloque **os arquivos deste projeto na raiz do repositório GitHub**. O `package.json` e o `vercel.json` precisam aparecer diretamente na página inicial do repositório.
2. No Vercel, importe esse repositório.
3. Em **Root Directory**, deixe `./` quando os arquivos estiverem na raiz.
4. O Vercel usará automaticamente:
   - instalação: `npm ci`;
   - build: `npm run build:web`;
   - saída: `dist`.
5. Faça o deploy.

Consulte também `docs/DEPLOY_VERCEL.md`.

## Modo de demonstração (desenvolvimento)

> **AAPEX V2:** a senha única de demonstração foi removida do bundle e do
> repositório (Masterplan §9.2, Anexo D — T30). O modo demonstração é
> exclusivo de desenvolvimento (`featureFlags.demoMode`) e não usa senha.
> A autenticação corporativa usa Supabase Auth — ver `.env.example` e
> `docs/OPERACAO_E_DEPLOY_AAPEX_V2.md`.

E-mails de demonstração (apenas dev): `regional@aace.app`, `coordenador@aace.app`, `gerente@aace.app`.

## Validação

```bash
npm run typecheck
npm run build:web
```

## Limite atual

Esta é uma versão demonstrativa e guarda os dados localmente no aparelho ou navegador. Ainda não há servidor, banco de dados compartilhado ou autenticação real de produção.
