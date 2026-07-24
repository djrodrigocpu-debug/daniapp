# AAPEx (AACE Excelência Mobile) 1.3.0

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

---

# Etapa "AAPEx v2 — Implantação Corporativa" (branch `aapex-v2-implantacao-corporativa`)

## Entregas

1. **Rename visível para AAPEx** — `app.json` (nome, título web, permissões), login, perfil, loading. Identificadores técnicos (slug, scheme, bundle id, package) preservados.
2. **Cadastro de Parceiros AACE** sobre `public.operations` (sem tabela nova): migration `0009_partners_admin.sql` com `app.normalize_text`, índices únicos normalizados (escritório único por unidade; estrutura organizacional idempotente), CHECK `operations_active_requires_gc` (parceiro ativo exige GC) e RPCs SECURITY DEFINER `admin_create_operation` / `admin_update_operation` / `admin_import_partners` (mínimo privilégio: EXECUTE só nas 3 RPCs).
3. **Aba Admin "Parceiros AACE"** — listar, pesquisar, filtrar (região/coordenação/GC), criar, editar, ativar/inativar (sem exclusão física), problemas de vínculo e **importação de planilha** transposta com simulação obrigatória antes da confirmação (relatório por linha; pessoas nunca são criadas pelo importador — resolução estrita por e-mail corporativo com papel/escopo ativos).
4. **Terminologia** — "Operações" → "Parceiros AACE" em toda a interface; o objeto avaliado é o Parceiro AACE, nunca o funcionário/GC.
5. **Dashboard** — KPIs sobre os parceiros visíveis ao perfil: total, em conformidade, em atenção, críticos, avaliações pendentes, planos abertos.
6. **Segurança** — visibilidade garantida no banco (RLS 0002 auditada por testes: admin/regional/coordenador/GC/sem escopo/anon); nenhuma chave privilegiada no cliente (teste estático + guard T03).

## Observações operacionais

- A planilha real (`DADOS APP.xlsx`) fica FORA do repositório (`.gitignore` reforça); os testes usam dados sintéticos com a mesma topologia.
- A importação real deve ser feita pela interface Admin, sempre com o relatório de simulação revisado antes da confirmação.
- Aplicar a migration 0009 no Supabase remoto de homologação (`supabase db push`) antes do teste em Preview.
