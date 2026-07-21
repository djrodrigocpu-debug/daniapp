# Publicação da v1.3.0 no Vercel

## Estrutura correta do repositório

Na página inicial do GitHub devem aparecer, entre outros:

- `package.json`
- `package-lock.json`
- `vercel.json`
- `app.json`
- `App.tsx`
- pasta `src`
- pasta `assets`

Não deixe todos esses arquivos dentro de uma pasta adicional como `AACE_Excelencia_Mobile_v1.3.0/`, salvo se configurar essa pasta como **Root Directory** no Vercel.

## Configuração automática incluída

O arquivo `vercel.json` define:

- Node.js 22 pelo `package.json`;
- instalação reproduzível com `npm ci`;
- build com `npm run build:web`;
- publicação da pasta `dist`;
- redirecionamento interno de rotas para `index.html`, necessário para a aplicação de página única.

## Como substituir o repositório anterior

1. Apague os arquivos antigos do repositório ou crie um repositório novo.
2. Envie o conteúdo desta versão para a raiz.
3. Confirme que `package.json` e `vercel.json` estão visíveis na raiz.
4. No Vercel, abra o projeto e escolha **Redeploy**.
5. Caso o projeto antigo tenha uma Root Directory errada, abra **Settings → Build and Deployment → Root Directory** e selecione a pasta correta ou `./`.

## Diagnóstico rápido

No log do Vercel devem aparecer mensagens equivalentes a:

- `npm ci`
- `npm run build:web`
- `Web Bundled`
- `Exported: dist`

Se o log disser que não encontrou `package.json`, a Root Directory está errada. Se publicar sem conteúdo, confira se a Output Directory é `dist`.
