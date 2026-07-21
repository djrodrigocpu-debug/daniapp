# Registro de validação técnica — Versão 1.0.0

Data da validação: 09/07/2026

## Verificações concluídas

- TypeScript: `npm run typecheck` — aprovado sem erros.
- Configuração Expo: `npx expo config --type public` — processada com sucesso.
- Bundle Android: `npx expo export --platform android` — gerado com sucesso.
- Bundle iOS: `npx expo export --platform ios` — gerado com sucesso.
- Expo Doctor: 18 de 20 verificações aprovadas.

## Observação sobre o Expo Doctor

As duas verificações não concluídas dependem de consulta online ao serviço de schema da Expo e ao React Native Directory. O ambiente de validação não conseguiu acessar esses endpoints. As verificações locais de dependências, peer dependencies, lockfile, configuração comum, Metro e compatibilidade do SDK foram aprovadas.

## O que ainda exige homologação em aparelho

- Permissão e captura real pela câmera em Android e iOS.
- Seleção de documentos no aparelho.
- Comportamento da persistência após encerramento do aplicativo.
- Leitura e ergonomia em diferentes tamanhos de tela.
- Build assinado com as credenciais corporativas.
- Instalação por APK/TestFlight ou distribuição interna da organização.

## Dependências e auditoria npm

A auditoria registrou vulnerabilidades moderadas em dependências transitivas do toolchain Expo, sem ocorrências classificadas como altas ou críticas. A correção automática sugerida pelo npm exigiria downgrade incompatível do Expo e, por isso, não foi aplicada. Antes da publicação produtiva, o projeto deverá ser reavaliado com a versão estável mais recente do SDK e com as políticas de segurança da organização.
