/**
 * Indicador de estado de sincronização/persistência (§17). Reflete o salvamento
 * real: "Salvando…" durante a escrita, "Salvo neste dispositivo" em modo local.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../context/SyncProvider';
import { colors, radius, spacing } from '../theme';

export function SyncBadge() {
  const { state, label, source } = useSync();
  const saving = state === 'saving';
  const tone = saving ? colors.warning : source === 'local' ? colors.info : colors.success;
  return (
    <View style={[styles.badge, { backgroundColor: `${tone}14` }]} accessibilityRole="text" accessibilityLabel={`Estado de dados: ${label}`}>
      {saving ? (
        <ActivityIndicator size="small" color={tone} />
      ) : (
        <Ionicons name={source === 'local' ? 'phone-portrait-outline' : 'cloud-done-outline'} size={15} color={tone} />
      )}
      <Text style={[styles.text, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  text: { fontSize: 11, fontWeight: '800' },
});
