import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useOperations } from '../context/OperationsProvider';
import { useActions } from '../context/ActionsProvider';
import { colors, radius, spacing } from '../theme';
import { formatDate } from '../utils/format';
import { EmptyState } from '../components/EmptyState';
import type { RootStackParamList } from '../types';

type WindowKey = 'today' | 'week' | 'month';
type AgendaItem = {
  id: string;
  kind: 'audit' | 'action';
  operationId: string;
  title: string;
  subtitle: string;
  date: string;
  overdue: boolean;
  completed: boolean;
};

const windows: Array<{ key: WindowKey; label: string; days: number }> = [
  { key: 'today', label: 'Hoje', days: 0 },
  { key: 'week', label: '7 dias', days: 7 },
  { key: 'month', label: '30 dias', days: 30 },
];

function atDayStart(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function AgendaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Agenda compõe dois repositórios (operações + planos), ambos já no escopo do
  // usuário autenticado — sem AppContext/mock (§16).
  const { operations } = useOperations();
  const { plans } = useActions();
  const [windowKey, setWindowKey] = useState<WindowKey>('week');
  const [showCompleted, setShowCompleted] = useState(false);

  const items = useMemo(() => {
    const today = atDayStart(new Date());
    const selected = windows.find((item) => item.key === windowKey) ?? windows[1];
    const limit = new Date(today);
    limit.setDate(limit.getDate() + selected.days);

    const audits: AgendaItem[] = operations.map((operation) => {
      const date = atDayStart(new Date(`${operation.nextAudit}T12:00:00`));
      return {
        id: `audit_${operation.id}`,
        kind: 'audit',
        operationId: operation.id,
        title: `Auditoria — ${operation.partnerName}`,
        subtitle: `${operation.officeName} • ${operation.city}/${operation.state}`,
        date: operation.nextAudit,
        overdue: date < today,
        completed: false,
      };
    });

    const actions: AgendaItem[] = plans
      .map((plan) => {
        const operation = operations.find((item) => item.id === plan.operationId);
        const completed = ['completed', 'validated'].includes(plan.status);
        const date = atDayStart(new Date(`${plan.dueDate}T12:00:00`));
        return {
          id: `action_${plan.id}`,
          kind: 'action',
          operationId: plan.operationId,
          title: `Plano de ação — ${operation?.partnerName ?? 'Parceiro AACE'}`,
          subtitle: plan.action,
          date: plan.dueDate,
          overdue: date < today && !completed,
          completed,
        };
      });

    return [...audits, ...actions]
      .filter((item) => showCompleted || !item.completed)
      .filter((item) => {
        const date = atDayStart(new Date(`${item.date}T12:00:00`));
        if (item.overdue) return true;
        if (windowKey === 'today') return date.getTime() === today.getTime();
        return date >= today && date <= limit;
      })
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return a.date.localeCompare(b.date);
      });
  }, [plans, operations, showCompleted, windowKey]);

  const overdueCount = items.filter((item) => item.overdue).length;
  const auditCount = items.filter((item) => item.kind === 'audit').length;
  const actionCount = items.filter((item) => item.kind === 'action').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Agenda de excelência</Text>
        <Text style={styles.subtitle}>Auditorias, planos de ação e prazos críticos em uma única visão.</Text>

        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>{auditCount}</Text><Text style={styles.metricLabel}>Auditorias</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{actionCount}</Text><Text style={styles.metricLabel}>Ações</Text></View>
          <View style={[styles.metric, overdueCount > 0 && styles.metricDanger]}><Text style={[styles.metricValue, overdueCount > 0 && styles.dangerText]}>{overdueCount}</Text><Text style={[styles.metricLabel, overdueCount > 0 && styles.dangerText]}>Vencidos</Text></View>
        </View>

        <View style={styles.filters}>
          {windows.map((item) => (
            <Pressable key={item.key} onPress={() => setWindowKey(item.key)} style={[styles.filter, windowKey === item.key && styles.filterActive]}>
              <Text style={[styles.filterText, windowKey === item.key && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => setShowCompleted((value) => !value)} style={styles.toggleRow}>
          <Ionicons name={showCompleted ? 'checkbox' : 'square-outline'} size={20} color={showCompleted ? colors.primary : colors.inkMuted} />
          <Text style={styles.toggleText}>Exibir ações concluídas</Text>
        </Pressable>

        {items.length ? (
          <View style={styles.timeline}>
            {items.map((item) => (
              <Pressable key={item.id} onPress={() => navigation.navigate('OperationDetail', { operationId: item.operationId })} style={styles.item}>
                <View style={[styles.icon, item.overdue ? styles.iconDanger : item.kind === 'audit' ? styles.iconInfo : styles.iconWarning]}>
                  <Ionicons name={item.overdue ? 'alert-circle' : item.kind === 'audit' ? 'clipboard-outline' : 'flag-outline'} size={21} color={item.overdue ? colors.danger : item.kind === 'audit' ? colors.info : colors.warning} />
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={[styles.itemDate, item.overdue && styles.dangerText]}>{item.overdue ? 'Vencido • ' : ''}{formatDate(item.date)}</Text>
                  </View>
                  <Text style={styles.itemSubtitle} numberOfLines={2}>{item.subtitle}</Text>
                  <Text style={styles.itemLink}>Abrir parceiro <Ionicons name="chevron-forward" size={12} /></Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState title="Agenda em dia" description="Não há auditorias ou planos de ação para o período selecionado." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  metrics: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  metric: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  metricDanger: { backgroundColor: colors.dangerSoft, borderColor: '#F1B6B6' },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  dangerText: { color: colors.danger },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  filter: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: colors.white },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg },
  toggleText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  timeline: { gap: spacing.md },
  item: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconDanger: { backgroundColor: colors.dangerSoft },
  iconInfo: { backgroundColor: colors.infoSoft },
  iconWarning: { backgroundColor: colors.warningSoft },
  itemBody: { flex: 1 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  itemTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  itemDate: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  itemSubtitle: { color: colors.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  itemLink: { color: colors.primary, fontSize: 10, fontWeight: '900', marginTop: spacing.sm },
});
