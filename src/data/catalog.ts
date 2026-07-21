import { Theme } from '../types';

export const themes: Theme[] = [
  {
    id: 'T01', pillar: 'Resultado e portfólio', title: 'Domínio de portfólio',
    kpi: 'Índice de domínio do portfólio AACE', target: '≥ 85% de acerto na avaliação', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Formulário ou relatório da avaliação aplicada.',
    validationMethod: 'Aplicação de avaliação estruturada com amostragem da equipe.', weight: 5, strategic: false,
  },
  {
    id: 'T02', pillar: 'Resultado e portfólio', title: 'Venda de Soluções Digitais',
    kpi: '% de vendas de SD sem Claro Monitor', target: 'Meta definida para a operação', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Relatório de produção por solução e vendedor.',
    validationMethod: 'Confronto entre produção, carteira e rotina comercial.', weight: 5, strategic: false,
  },
  {
    id: 'T03', pillar: 'Resultado e portfólio', title: 'Venda de soluções avançadas',
    kpi: 'Atingimento da meta de soluções avançadas', target: '≥ 100% da meta do mês', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Relatório de ativação e funil de oportunidades.',
    validationMethod: 'Verificação de produção, pipeline e plano de conversão.', weight: 5, strategic: false,
  },
  {
    id: 'T04', pillar: 'Expansão e capilaridade', title: 'Capilaridade de novos parceiros',
    kpi: 'Funil de prospecção de parceiros', target: 'Cobertura mínima definida por praça', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Funil com estágio, responsável e próxima ação.',
    validationMethod: 'Reunião semanal de capilaridade e conferência do funil.', weight: 4, strategic: false,
  },
  {
    id: 'T05', pillar: 'Execução comercial', title: 'BCC',
    kpi: 'Produtividade por HC BCC', target: 'Meta regional vigente', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Relatório de produtividade nominal.',
    validationMethod: 'Comparação de produtividade, presença e capacidade instalada.', weight: 4, strategic: false,
  },
  {
    id: 'T06', pillar: 'Resultado e portfólio', title: 'Convergência',
    kpi: 'Novo; Novo; Cliente Base', target: 'Mix mínimo definido pela regional', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Dashboard de convergência por operação.',
    validationMethod: 'Análise de mix e aderência à oferta convergente.', weight: 5, strategic: false,
  },
  {
    id: 'T07', pillar: 'Qualidade e retenção', title: 'Churn',
    kpi: 'Taxa de churn de 1%', target: '≤ 1,0%', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Dashboard de churn e plano de contenção.',
    validationMethod: 'War room semanal e análise de causas recorrentes.', weight: 5, strategic: false,
  },
  {
    id: 'T08', pillar: 'Qualidade e retenção', title: 'Percentual de quebra',
    kpi: 'Queda de 10% na quebra de clientes ausentes', target: 'Redução ≥ 10% no ciclo', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Relatório de qualidade com base de casos.',
    validationMethod: 'Amostragem de contratos e validação de ações corretivas.', weight: 5, strategic: false,
  },
  {
    id: 'T09', pillar: 'Pessoas e liderança', title: 'Vendedores',
    kpi: 'Plano de crescimento por vendedor', target: '100% dos vendedores com plano vigente', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Plano individual, PDI ou ata de acompanhamento.',
    validationMethod: 'Revisão nominal de produtividade, gaps e compromissos.', weight: 4, strategic: false,
  },
  {
    id: 'T10', pillar: 'Rentabilidade', title: 'Delta Ticket',
    kpi: 'Positivar o delta ticket na regional', target: 'Delta ticket positivo', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Relatório de renovação e ticket.',
    validationMethod: 'Comparação com período anterior e mix comercial.', weight: 4, strategic: false,
  },
  {
    id: 'T11', pillar: 'Qualidade e retenção', title: 'Renovação',
    kpi: 'Atingir meta Playbook da regional', target: '≥ 100% da meta', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Relatório de renovação por carteira e vendedor.',
    validationMethod: 'Validação de cadência, conversão e ofertas complementares.', weight: 5, strategic: false,
  },
  {
    id: 'T12', pillar: 'Resultado e portfólio', title: 'Aparelhos',
    kpi: 'Representação da receita regional', target: 'Meta mensal vigente', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Relatório de aparelhos, receita e margem.',
    validationMethod: 'Análise de penetração, margem e aderência à estratégia.', weight: 3, strategic: false,
  },
  {
    id: 'T13', pillar: 'Pessoas e liderança', title: 'Líderes do AACE',
    kpi: 'Liderança presente na operação', target: 'Rotina de gestão implantada', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Agenda, ata ou registro da rotina de liderança.',
    validationMethod: 'Entrevista estruturada e observação da gestão em campo.', weight: 4, strategic: false,
  },
  {
    id: 'T14', pillar: 'Rentabilidade', title: 'Projeto Rentabilização',
    kpi: 'Percentual de tratamento do mailing', target: '100% da base priorizada tratada', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Dash do mailing, contatos e conversões.',
    validationMethod: 'Conferência de tratamento, cadência e resultado.', weight: 4, strategic: false,
  },
  {
    id: 'T15', pillar: 'Projetos estratégicos', title: 'Projeto Samurai',
    kpi: 'Execução do plano estratégico da operação', target: 'Marcos do ciclo concluídos', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Plano, entregas e evidências dos marcos.',
    validationMethod: 'Revisão de marcos, responsáveis, riscos e resultados.', weight: 5, strategic: true,
  },
  {
    id: 'T16', pillar: 'Pessoas e liderança', title: 'One-on-One',
    kpi: 'Cobertura de reuniões individuais', target: '100% da liderança no ciclo', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Ata sintética com pauta, compromissos e prazo.',
    validationMethod: 'Amostragem das atas e checagem de follow-up.', weight: 3, strategic: true,
  },
  {
    id: 'T17', pillar: 'Execução comercial', title: 'Gestão de prospecção',
    kpi: 'Disciplina de prospecção e cobertura', target: 'Rotina diária e funil mínimo ativos', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Agenda de prospecção, contatos e funil atualizado.',
    validationMethod: 'Análise da golden hour, conversões e aging.', weight: 5, strategic: true,
  },
  {
    id: 'T18', pillar: 'Execução comercial', title: 'Venda de avançadas — rotina',
    kpi: 'Cadência de oportunidades avançadas', target: 'Pipeline com cobertura mínima', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Funil nominal e plano de avanço.',
    validationMethod: 'Revisão de estágio, valor, próximo passo e data.', weight: 4, strategic: true,
  },
  {
    id: 'T19', pillar: 'Execução comercial', title: 'Venda de SD — rotina',
    kpi: 'Oferta de SD nas oportunidades elegíveis', target: 'Aderência mínima definida', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Amostra de oportunidades e ofertas realizadas.',
    validationMethod: 'Amostragem de propostas e coaching com vendedores.', weight: 4, strategic: true,
  },
  {
    id: 'T20', pillar: 'Execução comercial', title: 'Carteira Prospect',
    kpi: 'Tratamento da carteira prospect', target: '100% da carteira priorizada com próxima ação', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Carteira com status, responsável e próxima ação.',
    validationMethod: 'Checagem de cobertura, aging e conversão.', weight: 4, strategic: true,
  },
  {
    id: 'T21', pillar: 'Resultado e portfólio', title: 'TV',
    kpi: 'Penetração de TV em clientes elegíveis', target: 'Meta regional vigente', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Relatório de produção e elegibilidade.',
    validationMethod: 'Análise de oferta, conversão e impedimentos.', weight: 3, strategic: true,
  },
  {
    id: 'T22', pillar: 'Execução comercial', title: 'Gestão de funil',
    kpi: 'Cobertura, aging e conversão do funil', target: 'Cobertura mínima e aging dentro da regra', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Print ou relatório do funil atualizado.',
    validationMethod: 'Revisão por etapa, oportunidade e próxima ação.', weight: 5, strategic: true,
  },
  {
    id: 'T23', pillar: 'Pessoas e liderança', title: 'Domínio de portfólio — coaching',
    kpi: 'Coaching aplicado sobre gaps de conhecimento', target: '100% dos gaps críticos tratados', frequency: 'monthly',
    evidenceRequired: true, evidenceHint: 'Plano de coaching e lista de presença.',
    validationMethod: 'Reavaliação após coaching e comparação de evolução.', weight: 3, strategic: true,
  },
  {
    id: 'T24', pillar: 'Governança', title: 'Visão das agendas Teams',
    kpi: 'Aderência à agenda de gestão e visitas', target: '≥ 90% da agenda executada', frequency: 'weekly',
    evidenceRequired: true, evidenceHint: 'Agenda Teams ou relatório de compromissos.',
    validationMethod: 'Comparação entre agenda planejada, realizada e evidências.', weight: 3, strategic: true,
  },
];

export const pillars = Array.from(new Set(themes.map((theme) => theme.pillar)));
