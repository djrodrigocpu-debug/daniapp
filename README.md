# AACE Excelência Mobile 1.2.0

Aplicativo móvel em React Native, Expo e TypeScript para apoiar a gestão dos parceiros AACE PR/SC.

## Principal novidade
A tela **Gestão Assistida** compara metas e resultados, calcula automaticamente o semáforo, prioriza a visita, registra diagnóstico, gera planos de ação e salva um relatório que retroalimenta a próxima visita.

## Executar
```bash
npm install
npm start
```

## Credenciais de demonstração
- `regional@aace.app`
- `coordenador@aace.app`
- `gerente@aace.app`
- Senha: `Aace@2026`

## Validação
```bash
npm run typecheck
npx expo export --platform android
npx expo export --platform ios
```

## Observação
Esta entrega contém o código-fonte do app. A geração de APK/AAB ou pacote iOS assinado depende das credenciais Expo, Google Play e Apple da organização.
