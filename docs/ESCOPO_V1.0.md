# Escopo funcional — Versão 1.0

## Objetivo

Validar o uso do Programa de Excelência AACE em um aplicativo de celular, garantindo que o gerente de canal consiga executar a auditoria em campo e que a coordenação consiga acompanhar e validar o trabalho realizado.

## Usuários

### Gerência Regional

- Visualiza todas as operações demonstrativas.
- Consulta indicadores consolidados.
- Acompanha planos de ação.
- Revisa e valida auditorias enviadas.

### Coordenação

- Visualiza os gerentes e as operações vinculadas à sua estrutura.
- Acompanha auditorias, notas e planos.
- Aprova ou devolve avaliações.

### Gerente de Canal

- Visualiza somente as operações sob sua responsabilidade.
- Inicia auditorias semanais e mensais.
- Classifica indicadores, registra análise e anexa evidências.
- Cria e acompanha planos de ação.
- Envia a avaliação para validação.

## Fluxo principal

1. Usuário realiza login.
2. Seleciona uma operação AACE.
3. Inicia um ciclo semanal ou mensal.
4. Avalia todos os itens aplicáveis.
5. Anexa as comprovações exigidas.
6. Cria plano de ação para cada item vermelho.
7. Envia a auditoria.
8. Coordenação revisa o checklist.
9. Coordenação aprova ou devolve.
10. Quando aprovada, a nota atualiza o índice oficial demonstrativo da operação.

## Regras implementadas

- Verde vale 100% do peso do indicador.
- Amarelo vale 50% do peso.
- Vermelho vale 0%.
- Não aplicável é retirado do denominador.
- Não avaliado vale 0% enquanto o ciclo está em elaboração.
- Todos os itens devem ser classificados antes do envio.
- Evidências obrigatórias devem estar anexadas.
- Item vermelho exige plano de ação.
- Avaliação enviada fica bloqueada para edição.
- Avaliação devolvida volta a permitir correção e reenvio.
- Somente a aprovação altera o índice oficial da operação.

## Fora do escopo da versão 1.0

- Backend corporativo.
- Integração com bases de KPI.
- Sincronização em nuvem.
- Autenticação corporativa.
- Assinatura digital.
- Geolocalização obrigatória.
- Notificações push.
- Upload para SharePoint ou Dataverse.
- Dashboard Power BI incorporado.
- Uso offline com fila de sincronização de servidor.
