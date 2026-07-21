import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { MetricCard } from '../components/MetricCard';
import { SectionTitle } from '../components/SectionTitle';
import { OperationCard } from '../components/OperationCard';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../types';
import { getMaturity } from '../utils/format';

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { currentUser, visibleOperations, data } = useApp();

  const stats = useMemo(() => {
    const ids = new Set(visibleOperations.map((operation) => operation.id));
    const average = visibleOperations.length ? Math.round(visibleOperations.reduce((sum, operation) => sum + operation.currentScore, 0) / visibleOperations.length) : 0;
    const critical = visibleOperations.filter((operation) => operation.status === 'red');
    const actions = data.actionPlans.filter((plan) => ids.has(plan.operationId) && !['validated', 'completed'].includes(plan.status));
    const pending = data.evaluations.filter((evaluation) => ids.has(evaluation.operationId) && evaluation.status === 'submitted').length;
    const overdue = actions.filter((plan) => plan.status === 'overdue' || new Date(plan.dueDate) < new Date()).length;
    return { average, critical, actions, pending, overdue };
  }, [data.actionPlans, data.evaluations, visibleOperations]);

  const upcoming = [...visibleOperations].sort((a, b) => a.nextAudit.localeCompare(b.nextAudit)).slice(0, 3);

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.eyebrow}>{currentUser?.region}</Text>
            <Text style={styles.greeting}>Olá, {currentUser?.name.split(' ')[0]}</Text>
            <Text style={styles.heroText}>Visão consolidada do Programa de Excelência AACE.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{currentUser?.avatarInitials}</Text></View>
        </View>
        <View style={styles.heroScoreRow}>
          <View>
            <Text style={styles.heroScoreLabel}>Índice médio da estrutura</Text>
            <Text style={styles.heroScore}>{stats.average}</Text>
          </View>
          <View style={styles.maturity}><Ionicons name="ribbon-outline" size={17} color={colors.white} /><Text style={styles.maturityText}>{getMaturity(stats.average)}</Text></View>
        </View>
        <ProgressBar value={stats.average} color={colors.white} />
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Operações" value={visibleOperations.length} helper="sob sua responsabilidade" />
        <MetricCard label="Críticas" value={stats.critical.length} helper="com nota abaixo de 70" tone={stats.critical.length ? 'danger' : 'success'} />
        <MetricCard label="Ações abertas" value={stats.actions.length} helper={`${stats.overdue} vencidas`} tone={stats.overdue ? 'warning' : 'neutral'} />
        <MetricCard label="Validações" value={stats.pending} helper="aguardando decisão" tone={stats.pending ? 'warning' : 'success'} />
      </View>

      <SectionTitle title="Próximas auditorias" subtitle="Operações com ciclo mais próximo do vencimento." />
      {upcoming.length ? upcoming.map((operation) => (
        <OperationCard key={operation.id} operation={operation} onPress={() => navigation.navigate('OperationDetail', { operationId: operation.id })} />
      )) : <EmptyState title="Nenhuma operação" description="Não há operações associadas a este perfil." />}

      <SectionTitle title="Foco da semana" subtitle="Sinais que exigem atuação gerencial imediata." />
      <View style={styles.focusCard}>
        <FocusRow icon="alert-circle-outline" title="Operações críticas" value={`${stats.critical.length}`} tone={colors.danger} />
        <FocusRow icon="time-outline" title="Planos vencidos" value={`${stats.overdue}`} tone={colors.warning} />
        <FocusRow icon="clipboard-outline" title="Auditorias pendentes" value={`${visibleOperations.filter((operation) => !operation.lastAudit || operation.nextAudit <= new Date().toISOString().slice(0, 10)).length}`} tone={colors.info} last />
      </View>
    </Screen>
  );
}

function FocusRow({ icon, title, value, tone, last }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; tone: string; last?: boolean }) {
  return (
    <View style={[styles.focusRow, last && styles.focusRowLast]}>
      <View style={[styles.focusIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={icon} size={19} color={tone} /></View>
      <Text style={styles.focusTitle}>{title}</Text>
      <Text style={[styles.focusValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: 24, padding: spacing.xl, marginBottom: spacing.lg },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg },
  eyebrow: { color: '#FFD4D6', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  greeting: { color: colors.white, fontSize: 25, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  heroText: { color: '#FFE9EA', fontSize: 12, marginTop: 5, maxWidth: 260 },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '900' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  heroScoreLabel: { color: '#FFD4D6', fontSize: 11 },
  heroScore: { color: colors.white, fontSize: 40, lineHeight: 44, fontWeight: '900' },
  maturity: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.16)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill },
  maturityText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  focusCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  focusRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  focusRowLast: { borderBottomWidth: 0 },
  focusIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  focusTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', flex: 1 },
  focusValue: { fontSize: 17, fontWeight: '900' },
});
