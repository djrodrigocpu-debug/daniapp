import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/AppButton';
import { useActions } from '../context/ActionsProvider';
import { useOperationalUser } from '../context/useOperationalUser';
import { themes } from '../data/catalog';
import { colors, radius, spacing } from '../theme';
import { ActionStatus } from '../types';
import { actionStatusLabel, formatDate } from '../utils/format';

const filterOptions: Array<{ key: 'open' | 'overdue' | 'completed'; label: string }> = [
  { key: 'open', label: 'Em aberto' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'completed', label: 'Concluídas' },
];

const statusColor: Record<ActionStatus, string> = {
  not_started: colors.neutral,
  in_progress: colors.info,
  waiting_partner: colors.warning,
  waiting_internal: colors.warning,
  completed: colors.success,
  validated: colors.success,
  overdue: colors.danger,
};

export function ActionsScreen() {
  const { plans: scopedPlans, updateStatus, getOperation, loading, error, refresh } = useActions();
  const currentUser = useOperationalUser();
  const [filter, setFilter] = useState<'open' | 'overdue' | 'completed'>('open');

  const plans = useMemo(() => {
    return scopedPlans
      .filter((plan) => {
        const overdue = plan.status === 'overdue' || (new Date(`${plan.dueDate}T23:59:59`) < new Date() && !['completed', 'validated'].includes(plan.status));
        if (filter === 'overdue') return overdue;
        if (filter === 'completed') return ['completed', 'validated'].includes(plan.status);
        return !overdue && !['completed', 'validated'].includes(plan.status);
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [scopedPlans, filter]);

  const allowedStatuses: ActionStatus[] = currentUser?.role === 'channel_manager'
    ? ['not_started', 'in_progress', 'waiting_partner', 'waiting_internal', 'completed']
    : ['in_progress', 'waiting_partner', 'waiting_internal', 'completed', 'validated'];

  if (loading && scopedPlans.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centeredText}>Carregando planos de ação…</Text>
      </SafeAreaView>
    );
  }

  if (error && scopedPlans.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
        <Text style={styles.centeredText}>{error}</Text>
        <AppButton title="Tentar novamente" variant="secondary" onPress={refresh} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Planos de ação</Text>
        <Text style={styles.subtitle}>Acompanhe correções, responsáveis, prazos e validações.</Text>
        <View style={styles.filters}>
          {filterOptions.map((item) => (
            <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filter, filter === item.key && styles.filterActive]}>
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {plans.length ? plans.map((plan) => {
          const operation = getOperation(plan.operationId);
          const theme = themes.find((item) => item.id === plan.themeId);
          const isOverdue = plan.status === 'overdue' || (new Date(`${plan.dueDate}T23:59:59`) < new Date() && !['completed', 'validated'].includes(plan.status));
          const effectiveStatus: ActionStatus = isOverdue ? 'overdue' : plan.status;
          return (
            <View key={plan.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.statusIcon, { backgroundColor: `${statusColor[effectiveStatus]}18` }]}>
                  <Ionicons name={isOverdue ? 'alert-outline' : 'flag-outline'} size={20} color={statusColor[effectiveStatus]} />
                </View>
                <View style={styles.cardHeading}>
                  <Text style={styles.operation}>{operation?.partnerName ?? 'Parceiro AACE'}</Text>
                  <Text style={styles.theme}>{theme?.title ?? plan.themeId}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor[effectiveStatus]}18` }]}>
                  <Text style={[styles.statusText, { color: statusColor[effectiveStatus] }]}>{actionStatusLabel[effectiveStatus]}</Text>
                </View>
              </View>

              <Text style={styles.problem}>{plan.problem}</Text>
              <View style={styles.actionBox}>
                <Text style={styles.actionLabel}>AÇÃO CORRETIVA</Text>
                <Text style={styles.actionText}>{plan.action}</Text>
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}><Ionicons name="person-outline" size={15} color={colors.inkMuted} /><Text style={styles.metaText}>{plan.owner}</Text></View>
                <View style={styles.metaItem}><Ionicons name="calendar-outline" size={15} color={isOverdue ? colors.danger : colors.inkMuted} /><Text style={[styles.metaText, isOverdue && { color: colors.danger, fontWeight: '800' }]}>{formatDate(plan.dueDate)}</Text></View>
              </View>

              <Text style={styles.changeLabel}>Atualizar status</Text>
              <View style={styles.statusOptions}>
                {allowedStatuses.map((status) => (
                  <Pressable key={status} onPress={() => updateStatus(plan.id, status)} style={[styles.statusOption, plan.status === status && { borderColor: statusColor[status], backgroundColor: `${statusColor[status]}12` }]}>
                    <Text style={[styles.statusOptionText, plan.status === status && { color: statusColor[status] }]}>{actionStatusLabel[status]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }) : <EmptyState title="Nenhum plano nesta visão" description="Altere o filtro ou aguarde o registro de novas não conformidades." />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centeredText: { color: colors.inkMuted, fontSize: 13, textAlign: 'center' },
  content: { padding: spacing.lg, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  filters: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
  filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: colors.white },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardHeading: { flex: 1 },
  operation: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  theme: { color: colors.inkMuted, fontSize: 11, marginTop: 3 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontSize: 9, fontWeight: '900' },
  problem: { color: colors.ink, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: spacing.lg },
  actionBox: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  actionLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  actionText: { color: colors.ink, fontSize: 12, lineHeight: 18, marginTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  metaText: { color: colors.inkMuted, fontSize: 10, flexShrink: 1 },
  changeLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.lg, marginBottom: spacing.sm },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusOption: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 7 },
  statusOptionText: { color: colors.inkMuted, fontSize: 9, fontWeight: '800' },
});
