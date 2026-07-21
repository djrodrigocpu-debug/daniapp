import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.icon}><Ionicons name="checkmark-done-outline" size={26} color={colors.primary} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xxl },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginBottom: spacing.md },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  description: { fontSize: 13, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 19 },
});
