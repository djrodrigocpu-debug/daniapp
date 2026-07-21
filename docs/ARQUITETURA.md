# Arquitetura técnica — Versão 1.0

## Visão geral

A versão 1.0 adota uma arquitetura monolítica no dispositivo, adequada para prototipação e homologação do processo de negócio.

```text
Interface React Native
        ↓
Contexto de aplicação e regras de negócio
        ↓
AsyncStorage no dispositivo
        ↓
Arquivos locais selecionados ou capturados
```

## Camadas

### Apresentação

Telas React Native, navegação em abas e pilhas, componentes reutilizáveis e identidade visual.

### Aplicação

O `AppContext` concentra sessão, visibilidade hierárquica, criação de auditorias, atualização de respostas, evidências, planos e validações.

### Domínio

Tipos e regras relativas a usuários, operações, temas, auditorias, evidências, planos de ação, semáforos e pontuação.

### Persistência

O AsyncStorage grava um objeto serializado com os dados da demonstração. As URIs dos anexos apontam para arquivos do ambiente local do aplicativo.

## Decisões da versão 1.0

- Expo Managed Workflow para acelerar testes em Android e iOS.
- TypeScript para reduzir inconsistências de domínio.
- React Navigation para navegação nativa.
- AsyncStorage para persistência do MVP.
- Expo Image Picker para câmera.
- Expo Document Picker para arquivos.

## Arquitetura-alvo futura

```text
Aplicativo mobile
   ↓ HTTPS / OAuth 2.0
API corporativa
   ↓
Dataverse ou banco relacional
   ├─ Repositório corporativo de evidências
   ├─ Power BI
   ├─ Teams / Outlook / Push
   └─ Trilhas de auditoria e observabilidade
```

A migração para backend deverá preservar os identificadores de domínio e substituir a persistência local por repositórios e serviços autenticados.
