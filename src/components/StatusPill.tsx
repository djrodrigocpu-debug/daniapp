import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TrafficLight } from '../types';
import { radius, spacing } from '../theme';
import { trafficLightColor, trafficLightLabel, trafficLightSoftColor } from '../utils/format';

export function StatusPill({ status, compact = false }: { status: TrafficLight; compact?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: trafficLightSoftColor[status] }, compact && styles.compact]}>
      <View style={[styles.dot, { backgroundColor: trafficLightColor[status] }]} />
      <Text style={[styles.text, { color: trafficLightColor[status] }, compact && styles.compactText]}>{trafficLightLabel[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, alignSelf: 'flex-start' },
  compact: { paddingHorizontal: 9, paddingVertical: 5, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: '700' },
  compactText: { fontSize: 11 },
});
