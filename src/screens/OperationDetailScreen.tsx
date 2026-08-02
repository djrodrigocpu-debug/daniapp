import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { alertDialog } from '../utils/dialog';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { ProgressBar } from '../components/ProgressBar';
import { SectionTitle } from '../components/SectionTitle';
import { StatusPill } from '../components/StatusPill';
import { useEvaluations } from '../context/EvaluationsProvider';
import { useOperations } from '../context/OperationsProvider';
import { useOperationalUser } from '../context/useOperationalUser';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import { OperationPeople, scopeFromUser } from '../data/repositories/OperationsRepository';
import { decideOperationDetailState } from '../domain/operations/operationDetailState';
import { describeAuditStatus, describeCompetence } from '../domain/monthlyAudit/policy';
import type { MonthlyAuditSummary } from '../domain/monthlyAudit/types';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../types';
import { formatDate, getMaturity, trafficLightColor } from '../utils/format';

export function OperationDetailScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'OperationDetail'>) {
  const { operationId } = route.params;
  const { listByOperation, startEvaluation, getCurrentDraft } = useEvaluations();
  // A identidade canônica é public.operations.id, e é `useOperations()` (via
  // `ui_operations`) quem a busca de verdade — a mesma fonte que já preenche a
  // lista. `EvaluationsProvider.getOperation` lê do store local de
  // demonstração, nunca populado pelos dados reais em modo corporativo: um
  // Parceiro AACE recém-carregado aparecia na lista e "não existia" aqui.
  const { operations, loading, error } = useOperations();
  const operation = operations.find((o) => o.id === operationId);

  // Nomes funcionais (GC/coordenador/coordenadoria) via projeção `ui_operation_people`
  // (migration 0026): `public.users` só é legível pelo próprio usuário ou por
  // Administrador, então resolver por UUID direto mostrava "—" para Coordenação/Regional.
  const { operations: operationsRepo } = useRepositories();
  const currentUser = useOperationalUser();
  const [people, setPeople] = useState<OperationPeople | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!currentUser) { setPeople(null); return undefined; }
    void operationsRepo.getOperationPeople(scopeFromUser(currentUser), operationId).then((res) => {
      if (!cancelled) setPeople(res.ok ? res.value : null);
    });
    return () => { cancelled = true; };
  }, [operationsRepo, currentUser, operationId]);

  // Competências da Auditoria Mensal. Falha silenciosa é DELIBERADA aqui: o
  // adapter de demonstração recusa por princípio, e o detalhe do parceiro não
  // pode virar tela de erro por causa de um bloco secundário. A tela da própria
  // Auditoria Mensal é que explica a indisponibilidade, com a frase do motivo.
  const { monthlyAudit: monthlyRepo } = useRepositories();
  const [monthlyAudits, setMonthlyAudits] = useState<MonthlyAuditSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    void monthlyRepo.listAudits(operationId, 6).then((res) => {
      if (!cancelled) setMonthlyAudits(res.ok ? res.value : []);
    });
    return () => { cancelled = true; };
  }, [monthlyRepo, operationId]);

  const history = useMemo(() => listByOperation(operationId).slice(0, 5), [listByOperation, operationId]);

  const detailState = decideOperationDetailState({ loading, error, found: operation !== undefined });

  if (detailState === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centeredText}>Carregando Parceiro AACE…</Text>
        </View>
      </Screen>
    );
  }
  if (detailState === 'error') {
    return (
      <Screen>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
          <Text style={styles.centeredText}>Não foi possível carregar este Parceiro AACE.</Text>
        </View>
      </Screen>
    );
  }
  if (detailState === 'not_found' || !operation) return <Screen><Text>Parceiro AACE não encontrado.</Text></Screen>;
  const activeOperation = operation;
  const delta = activeOperation.currentScore - activeOperation.previousScore;

  async function launch(frequency: 'weekly' | 'monthly') {
    const existing = getCurrentDraft(activeOperation.id);
    if (existing && existing.frequency !== frequency) {
      alertDialog('Rascunho existente', 'Há uma avaliação em andamento para este Parceiro AACE. Finalize ou envie o rascunho atual antes de iniciar outro ciclo.');
      return;
    }
    const id = await startEvaluation(activeOperation.id, frequency);
    if (id) navigation.navigate('Evaluation', { operationId: activeOperation.id, evaluationId: id });
  }

  return (
    <Screen>
      <View style={styles.identityCard}>
        <View style={styles.identityTop}>
          <View style={styles.icon}><Ionicons name="business-outline" size={23} color={colors.primary} /></View>
          <View style={styles.identityText}>
            <Text style={styles.partner}>{operation.partnerName}</Text>
            <Text style={styles.office}>{operation.officeName} · {operation.city}/{operation.state}</Text>
          </View>
          <StatusPill status={operation.status} compact />
        </View>
        <View style={styles.scoreRow}>
          <View>
            <Text style={styles.scoreLabel}>Índice de excelência</Text>
            <Text style={[styles.score, { color: trafficLightColor[operation.status] }]}>{operation.currentScore}</Text>
          </View>
          <View style={styles.deltaBlock}>
            <Text style={styles.deltaLabel}>Evolução</Text>
            <Text style={[styles.delta, { color: delta >= 0 ? colors.success : colors.danger }]}>{delta >= 0 ? '+' : ''}{delta} pts</Text>
          </View>
        </View>
        <ProgressBar value={operation.currentScore} color={trafficLightColor[operation.status]} />
        <Text style={styles.maturity}>{getMaturity(operation.currentScore)}</Text>
        <Text style={styles.metricsNote}>
          O Índice de excelência mede a auditoria dos processos. Os indicadores operacionais medem
          resultados e não compõem esta nota.
        </Text>
      </View>

      <View style={styles.infoCard}>
        <InfoRow icon="person-outline" label="Gerente de canal" value={people?.managerName ?? 'Não atribuído'} />
        <InfoRow icon="people-outline" label="Coordenador(a)" value={people?.coordinatorName ?? 'Não atribuído'} />
        <InfoRow icon="git-network-outline" label="Coordenadoria" value={people?.coordinationName ?? 'Não atribuído'} />
        <InfoRow icon="calendar-outline" label="Última auditoria" value={formatDate(operation.lastAudit)} />
        <InfoRow icon="alarm-outline" label="Próxima auditoria" value={formatDate(operation.nextAudit)} last />
      </View>

      {/*
        A partir da 1.3.5 "Gestão Assistida" é o CICLO SEMANAL (decisão D1), com
        domínio próprio. A tela de Visita produtiva continua servindo o caminho
        de 1.3.4 e passa a se chamar pelo próprio nome: dois botões chamados
        "Gestão Assistida" mandariam o operador ao lugar errado.
      */}
      <View style={styles.blocoAtual}>
        <Text style={styles.blocoRotulo} accessibilityRole="header">Operação atual</Text>
      </View>
      <SectionTitle title="Gestão Assistida" subtitle="Ciclo semanal: o resultado é consultado no relatório oficial da operação (fonte externa), e o AAPEx calcula o status, registra o diagnóstico e o plano de ação." />
      <AppButton title="Abrir semana atual" onPress={() => navigation.navigate('AssistedCycle', { operationId: activeOperation.id })} style={{ marginBottom: spacing.xl }} />

      <SectionTitle title="Visita produtiva" subtitle="Metas, realizado, prioridades, diagnóstico, plano de ação e retroalimentação em um único fluxo." />
      <AppButton title="Abrir visita produtiva" variant="secondary" onPress={() => navigation.navigate('Performance', { operationId: activeOperation.id })} style={{ marginBottom: spacing.xl }} />

      {/*
        AUDITORIA MENSAL por competência (D4) — o módulo de PROCESSO. Fica junto
        da Gestão Assistida e SEPARADA do bloco legado abaixo, porque são três
        coisas diferentes e o Modelo Operacional §6 exige que a interface as
        distinga.
      */}
      <SectionTitle title="Auditoria Mensal" subtitle="Verifica se o processo que sustenta o resultado existe, está implantado e é executado." />
      <AppButton title="Abrir competência atual" onPress={() => navigation.navigate('MonthlyAudit', { operationId: activeOperation.id })} />
      {monthlyAudits.length > 0 && (
        <View style={styles.monthlyList}>
          {monthlyAudits.map((m) => (
            <View key={m.id} style={styles.monthlyRow}>
              <View style={styles.monthlyText}>
                <Text style={styles.monthlyLabel}>{describeCompetence(m.competence)}</Text>
                <Text style={styles.monthlyMeta}>
                  {describeAuditStatus(m.status)}
                  {m.nonConformCount > 0 ? ` · ${m.nonConformCount} não conforme(s)` : ''}
                </Text>
              </View>
              {/*
                O-12: TODA auditoria listada tem rota de abertura, e a aprovada
                recebe a ação explícita "Ver auditoria" — com semântica de botão,
                nome acessível e alvo de toque adequado. O achado nasceu de um
                cartão aprovado que não levava a lugar nenhum.
              */}
              <AppButton
                title={m.status === 'approved' ? 'Ver auditoria' : 'Continuar'}
                compact
                variant={m.status === 'approved' ? 'secondary' : 'primary'}
                onPress={() => navigation.navigate('MonthlyAudit', {
                  operationId: activeOperation.id, competence: m.competence,
                })}
              />
            </View>
          ))}
        </View>
      )}
      <View style={{ marginBottom: spacing.xl }} />

      {/*
        TERCEIRO BLOCO — o HISTÓRICO SEMANAL LEGADO, e ele é visualmente
        separado dos dois de cima. O Modelo Operacional §6 exige que a interface
        distinga três coisas, e a tabela de terminologia de §9 fixa o nome deste
        bloco — qualquer sinônimo informal está proibido, e confundi-lo com a
        Gestão Assistida, também.

        A faixa não é adorno: sem uma marca visual, "Auditoria semanal" (legado)
        e "Gestão Assistida" (atual) ficam a uma rolagem de distância e parecem
        dois nomes para a mesma coisa.
      */}
      <View style={styles.blocoLegado}>
        <Text style={styles.blocoRotulo} accessibilityRole="header">Histórico semanal legado</Text>
        <Text style={styles.blocoNota}>
          Modelo anterior à 1.3.5, preservado e somente leitura no que já foi aprovado.
          Não se confunde com a Gestão Assistida nem com a Auditoria Mensal.
        </Text>
      </View>
      <SectionTitle title="Checklists do modelo legado" subtitle="Permanecem disponíveis para os processos de excelência enquanto o cutover não ocorrer." />
      <View style={styles.buttonRow}>
        <AppButton title="Checklist semanal legado" onPress={() => void launch('weekly')} style={styles.flexButton} />
        <AppButton title="Checklist mensal legado" onPress={() => void launch('monthly')} variant="secondary" style={styles.flexButton} />
      </View>

      <SectionTitle title="Histórico legado recente" subtitle="Ciclos do modelo anterior registrados para este Parceiro AACE." />
      {history.length ? history.map((evaluation) => (
        <View key={evaluation.id} style={styles.historyCard}>
          <View style={styles.historyTop}>
            <View>
              <Text style={styles.historyTitle}>{evaluation.cycleLabel}</Text>
              <Text style={styles.historyMeta}>{evaluation.frequency === 'weekly' ? 'Semanal' : 'Mensal'} · {formatDate(evaluation.periodStart)} a {formatDate(evaluation.periodEnd)}</Text>
            </View>
            <Text style={styles.historyScore}>{evaluation.score}</Text>
          </View>
          <View style={styles.historyFooter}>
            <Text style={styles.historyStatus}>{evaluation.status === 'draft' ? 'Rascunho' : evaluation.status === 'submitted' ? 'Aguardando validação' : evaluation.status === 'approved' ? 'Aprovada' : 'Devolvida'}</Text>
            {/*
              O-12 no BLOCO LEGADO. Antes, só rascunho e devolvida tinham botão:
              uma avaliação aprovada ficava listada sem rota, exatamente o padrão
              que o achado descreve. Agora TODO item listado tem ação — o que
              muda é o verbo, e o `variant` diz se é leitura ou edição.
            */}
            <AppButton
              title={
                evaluation.status === 'returned' ? 'Corrigir'
                  : evaluation.status === 'draft' ? 'Continuar'
                    : 'Ver avaliação'
              }
              compact
              variant={['draft', 'returned'].includes(evaluation.status) ? 'primary' : 'secondary'}
              onPress={() => navigation.navigate('Evaluation', { operationId, evaluationId: evaluation.id })}
            />
          </View>
        </View>
      )) : <Text style={styles.noHistory}>Nenhuma avaliação registrada.</Text>}
    </Screen>
  );
}

function InfoRow({ icon, label, value, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Ionicons name={icon} size={18} color={colors.inkMuted} />
      <View style={styles.infoText}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  blocoAtual: {
    borderLeftWidth: 4, borderLeftColor: colors.primary,
    paddingLeft: spacing.md, marginBottom: spacing.md,
  },
  blocoLegado: {
    borderLeftWidth: 4, borderLeftColor: colors.inkMuted,
    paddingLeft: spacing.md, marginTop: spacing.xl, marginBottom: spacing.md, gap: 4,
  },
  blocoRotulo: {
    color: colors.ink, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  blocoNota: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  centeredText: { color: colors.inkMuted, fontSize: 13, textAlign: 'center' },
  identityCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1 },
  partner: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  office: { color: colors.inkMuted, fontSize: 12, marginTop: 3 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xl, marginBottom: spacing.sm },
  scoreLabel: { color: colors.inkMuted, fontSize: 11 },
  score: { fontSize: 42, lineHeight: 46, fontWeight: '900' },
  deltaBlock: { alignItems: 'flex-end' },
  deltaLabel: { color: colors.inkMuted, fontSize: 11 },
  delta: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  maturity: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', marginTop: spacing.sm },
  metricsNote: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  infoCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  infoRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoRowLast: { borderBottomWidth: 0 },
  infoText: { flex: 1 },
  infoLabel: { color: colors.inkMuted, fontSize: 11 },
  infoValue: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 3 },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  flexButton: { flex: 1 },
  historyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  historyTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  historyMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 4 },
  historyScore: { color: colors.primary, fontSize: 26, fontWeight: '900' },
  historyFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  historyStatus: { color: colors.inkMuted, fontSize: 11, fontWeight: '700' },
  noHistory: { color: colors.inkMuted, fontSize: 13 },
  monthlyList: { marginTop: spacing.md, gap: spacing.sm },
  monthlyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    minHeight: 56,
  },
  monthlyText: { flex: 1 },
  monthlyLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  monthlyMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
});
