import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

interface MetricCardProps {
  label: string;
  value: string | number;
  helper?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

export function MetricCard({ label, value, helper, tone = 'neutral' }: MetricCardProps) {
  const accent = {
    neutral: colors.ink,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];

  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      {!!helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 145, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow },
  accent: { position: 'absolute', top: 0, left: 0, width: 5, bottom: 0 },
  label: { color: colors.inkMuted, fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  helper: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.xs },
});
