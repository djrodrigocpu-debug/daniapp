/**
 * Identifica visualmente o ambiente de autenticação (Masterplan §8: o modo
 * demonstração precisa ser explicitamente identificado e separado do corporativo).
 * Consome o AuthProvider — é o ponto de UI que confirma qual backend está ativo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthProvider';
import { colors, radius, spacing } from '../theme';

const COPY: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string; tone: string; bg: string }> = {
  supabase: { icon: 'shield-checkmark', label: 'Autenticação corporativa (Supabase)', tone: colors.primary, bg: colors.primarySoft },
  demo: { icon: 'flask-outline', label: 'Ambiente de demonstração — dados fictícios', tone: '#9A6B00', bg: '#FFF6E5' },
  unconfigured: { icon: 'warning-outline', label: 'Sem backend: configure o Supabase (.env)', tone: '#8A1C1C', bg: '#FDECEC' },
};

export function AuthModeBanner() {
  const { mode } = useAuth();
  const c = COPY[mode] ?? COPY.unconfigured;
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]} accessibilityRole="text">
      <Ionicons name={c.icon} size={16} color={c.tone} />
      <Text style={[styles.text, { color: c.tone }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  text: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
});
