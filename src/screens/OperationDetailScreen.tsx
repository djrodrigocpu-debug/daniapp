import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { ProgressBar } from '../components/ProgressBar';
import { SectionTitle } from '../components/SectionTitle';
import { StatusPill } from '../components/StatusPill';
import { useEvaluations } from '../context/EvaluationsProvider';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../types';
import { formatDate, getMaturity, trafficLightColor } from '../utils/format';

export function OperationDetailScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'OperationDetail'>) {
  const { operationId } = route.params;
  const { getOperation, getUser, listByOperation, startEvaluation, getCurrentDraft } = useEvaluations();
  const operation = getOperation(operationId);

  const history = useMemo(() => listByOperation(operationId).slice(0, 5), [listByOperation, operationId]);
  if (!operation) return <Screen><Text>Parceiro AACE não encontrado.</Text></Screen>;
  const activeOperation = operation;

  const manager = getUser(activeOperation.managerId);
  const coordinator = getUser(activeOperation.coordinatorId);
  const delta = activeOperation.currentScore - activeOperation.previousScore;

  async function launch(frequency: 'weekly' | 'monthly') {
    const existing = getCurrentDraft(activeOperation.id);
    if (existing && existing.frequency !== frequency) {
      Alert.alert('Rascunho existente', 'Há uma avaliação em andamento para este Parceiro AACE. Finalize ou envie o rascunho atual antes de iniciar outro ciclo.');
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
      </View>

      <View style={styles.infoCard}>
        <InfoRow icon="person-outline" label="Gerente de canal" value={manager?.name ?? '—'} />
        <InfoRow icon="people-outline" label="Coordenação" value={coordinator?.name ?? '—'} />
        <InfoRow icon="calendar-outline" label="Última auditoria" value={formatDate(operation.lastAudit)} />
        <InfoRow icon="alarm-outline" label="Próxima auditoria" value={formatDate(operation.nextAudit)} last />
      </View>

      <SectionTitle title="Visita produtiva" subtitle="Metas, realizado, prioridades, diagnóstico, plano de ação e retroalimentação em um único fluxo." />
      <AppButton title="Abrir Gestão Assistida" onPress={() => navigation.navigate('Performance', { operationId: activeOperation.id })} style={{ marginBottom: spacing.xl }} />

      <SectionTitle title="Avaliação operacional" subtitle="Checklists semanal e mensal permanecem disponíveis para os processos de excelência." />
      <View style={styles.buttonRow}>
        <AppButton title="Auditoria semanal" onPress={() => void launch('weekly')} style={styles.flexButton} />
        <AppButton title="Auditoria mensal" onPress={() => void launch('monthly')} variant="secondary" style={styles.flexButton} />
      </View>

      <SectionTitle title="Histórico recente" subtitle="Ciclos registrados para este Parceiro AACE." />
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
            {['draft', 'returned'].includes(evaluation.status) && <AppButton title={evaluation.status === 'returned' ? 'Corrigir' : 'Continuar'} compact onPress={() => navigation.navigate('Evaluation', { operationId, evaluationId: evaluation.id })} />}
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
});
