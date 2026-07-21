import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Operation } from '../types';
import { colors, radius, shadow, spacing } from '../theme';
import { formatDate, trafficLightColor } from '../utils/format';
import { StatusPill } from './StatusPill';

export function OperationCard({ operation, onPress }: { operation: Operation; onPress: () => void }) {
  const delta = operation.currentScore - operation.previousScore;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <View style={[styles.badge, { backgroundColor: `${trafficLightColor[operation.status]}18` }]}>
            <Text style={[styles.badgeText, { color: trafficLightColor[operation.status] }]}>{operation.officeName.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.partner}>{operation.partnerName}</Text>
            <Text style={styles.office}>{operation.officeName} · {operation.city}/{operation.state}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.inkMuted} />
      </View>

      <View style={styles.scoreRow}>
        <View>
          <Text style={styles.scoreLabel}>Índice de excelência</Text>
          <View style={styles.scoreValueRow}>
            <Text style={[styles.score, { color: trafficLightColor[operation.status] }]}>{operation.currentScore}</Text>
            <Text style={[styles.delta, { color: delta >= 0 ? colors.success : colors.danger }]}>{delta >= 0 ? '+' : ''}{delta} pts</Text>
          </View>
        </View>
        <StatusPill status={operation.status} compact />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Próxima: {formatDate(operation.nextAudit)}</Text>
        <Text style={[styles.footerText, operation.openActions > 0 && styles.alert]}>{operation.openActions} ações abertas</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, ...shadow },
  pressed: { opacity: 0.82 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.md },
  badge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '800', fontSize: 15 },
  textBlock: { flex: 1 },
  partner: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  office: { color: colors.inkMuted, fontSize: 12, marginTop: 3 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.lg },
  scoreLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: '600' },
  scoreValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  score: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  delta: { fontSize: 12, fontWeight: '700' },
  footer: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { color: colors.inkMuted, fontSize: 11 },
  alert: { color: colors.danger, fontWeight: '700' },
});
