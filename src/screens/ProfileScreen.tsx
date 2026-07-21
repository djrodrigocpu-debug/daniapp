import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../theme';
import { roleLabel } from '../utils/format';

export function ProfileScreen() {
  const { currentUser, logout, resetDemo, visibleOperations } = useApp();
  if (!currentUser) return null;

  function confirmReset() {
    Alert.alert('Restaurar dados da demonstração?', 'Rascunhos, evidências e alterações locais serão substituídos pelos dados iniciais da versão 1.0.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', style: 'destructive', onPress: () => void resetDemo() },
    ]);
  }

  return (
    <Screen>
      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{currentUser.avatarInitials}</Text></View>
        <Text style={styles.name}>{currentUser.name}</Text>
        <Text style={styles.role}>{roleLabel[currentUser.role]}</Text>
        <Text style={styles.email}>{currentUser.email}</Text>
      </View>

      <View style={styles.infoCard}>
        <Info icon="map-outline" label="Área de atuação" value={currentUser.region} />
        <Info icon="business-outline" label="Operações visíveis" value={`${visibleOperations.length}`} />
        <Info icon="phone-portrait-outline" label="Versão do aplicativo" value="1.2.0" />
        <Info icon="cloud-offline-outline" label="Modo de dados" value="Demonstração local" last />
      </View>

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={22} color={colors.info} />
        <View style={styles.noticeText}>
          <Text style={styles.noticeTitle}>Escopo da versão 1.2</Text>
          <Text style={styles.noticeBody}>Gestão assistida com metas, resultado, semáforo automático, diagnóstico, plano de ação, retroalimentação e relatório local. Os dados permanecem no aparelho nesta versão.</Text>
        </View>
      </View>

      <AppButton title="Restaurar dados demonstrativos" variant="secondary" onPress={confirmReset} />
      <AppButton title="Sair" variant="ghost" onPress={() => void logout()} style={styles.logout} />

      <Text style={styles.footer}>AACE Excelência · Avaliar. Comprovar. Evoluir.</Text>
    </Screen>
  );
}

function Info({ icon, label, value, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Ionicons name={icon} size={19} color={colors.inkMuted} />
      <View style={styles.infoText}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  profileCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', padding: spacing.xl },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 24, fontWeight: '900' },
  name: { color: colors.ink, fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: spacing.md },
  role: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 4 },
  email: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  infoCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  infoRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoRowLast: { borderBottomWidth: 0 },
  infoText: { flex: 1 },
  infoLabel: { color: colors.inkMuted, fontSize: 10 },
  infoValue: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 3 },
  notice: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.infoSoft, borderRadius: radius.lg, padding: spacing.lg, marginVertical: spacing.lg },
  noticeText: { flex: 1 },
  noticeTitle: { color: colors.info, fontSize: 13, fontWeight: '900' },
  noticeBody: { color: colors.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  logout: { marginTop: spacing.sm },
  footer: { color: colors.inkMuted, fontSize: 10, textAlign: 'center', marginTop: spacing.xl },
});
