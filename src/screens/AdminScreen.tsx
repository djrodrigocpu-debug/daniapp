import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { useAdmin } from '../context/AdminProvider';
import { colors, radius, spacing } from '../theme';
import { UserRole } from '../types';
import { roleLabel } from '../utils/format';

const ROLES: UserRole[] = ['admin', 'regional', 'coordinator', 'channel_manager'];

export function AdminScreen() {
  const admin = useAdmin();
  const [mode, setMode] = useState<'users' | 'indicators'>('users');

  if (admin.loading && admin.users.length === 0 && admin.indicators.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Carregando administração…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Administração</Text>
        <Text style={styles.subtitle}>Usuários, perfis e indicadores versionados do programa.</Text>
        <View style={styles.tabs}>
          <Pressable onPress={() => setMode('users')} style={[styles.tab, mode === 'users' && styles.tabActive]}>
            <Text style={[styles.tabText, mode === 'users' && styles.tabTextActive]}>Usuários</Text>
          </Pressable>
          <Pressable onPress={() => setMode('indicators')} style={[styles.tab, mode === 'indicators' && styles.tabActive]}>
            <Text style={[styles.tabText, mode === 'indicators' && styles.tabTextActive]}>Indicadores</Text>
          </Pressable>
        </View>

        {mode === 'users' ? <UsersSection /> : <IndicatorsSection />}
      </ScrollView>
    </SafeAreaView>
  );
}

function UsersSection() {
  const { users, createUser, setUserActive, updateUserRole } = useAdmin();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [role, setRole] = useState<UserRole>('channel_manager');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await createUser({ name, email, region, role });
    setBusy(false);
    if (!res.ok) {
      Alert.alert('Não foi possível criar', res.message);
      return;
    }
    setName('');
    setEmail('');
    setRegion('');
  }

  async function cycleRole(userId: string, current: UserRole) {
    const next = ROLES[(ROLES.indexOf(current) + 1) % ROLES.length];
    const res = await updateUserRole(userId, next);
    if (!res.ok) Alert.alert('Falha', res.message);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo usuário</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Nome" placeholderTextColor={colors.neutral} style={styles.input} />
        <TextInput value={email} onChangeText={setEmail} placeholder="E-mail corporativo" placeholderTextColor={colors.neutral} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <TextInput value={region} onChangeText={setRegion} placeholder="Área de atuação" placeholderTextColor={colors.neutral} style={styles.input} />
        <Text style={styles.fieldLabel}>Perfil</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} style={[styles.chip, role === r && styles.chipActive]}>
              <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{roleLabel[r]}</Text>
            </Pressable>
          ))}
        </View>
        <AppButton title="Criar usuário" onPress={() => void submit()} loading={busy} style={styles.mt} />
      </View>

      <Text style={styles.listTitle}>{users.length} usuário(s)</Text>
      {users.map((user) => {
        const active = user.active !== false;
        return (
          <View key={user.id} style={styles.row}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{user.avatarInitials}</Text></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>{user.name}</Text>
              <Text style={styles.rowMeta}>{user.email}</Text>
              <Pressable onPress={() => void cycleRole(user.id, user.role)}>
                <Text style={styles.rowRole}>{roleLabel[user.role]} · alterar</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => void setUserActive(user.id, !active)} style={[styles.statusToggle, active ? styles.statusOn : styles.statusOff]}>
              <Text style={[styles.statusToggleText, { color: active ? colors.success : colors.danger }]}>{active ? 'Ativo' : 'Inativo'}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function IndicatorsSection() {
  const { indicators, createIndicator, addIndicatorVersion, deactivateIndicator, removeIndicator } = useAdmin();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await createIndicator(code, name, {
      unit: '%', direction: 'higher_better', target: Number(target) || 0, yellowTolerance: 0, weight: Number(weight) || 1, effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    setBusy(false);
    if (!res.ok) {
      Alert.alert('Não foi possível criar', res.message);
      return;
    }
    setCode('');
    setName('');
    setTarget('');
    setWeight('');
  }

  async function newVersion(indicatorId: string, lastTarget: number, lastWeight: number) {
    const res = await addIndicatorVersion(indicatorId, {
      unit: '%', direction: 'higher_better', target: lastTarget, yellowTolerance: 0, weight: lastWeight, effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    if (!res.ok) Alert.alert('Falha', res.message);
  }

  async function tryRemove(indicatorId: string) {
    const res = await removeIndicator(indicatorId);
    if (!res.ok) Alert.alert('Exclusão bloqueada', res.message);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo indicador</Text>
        <TextInput value={code} onChangeText={setCode} placeholder="Código (ex.: IND-050)" placeholderTextColor={colors.neutral} autoCapitalize="characters" style={styles.input} />
        <TextInput value={name} onChangeText={setName} placeholder="Nome do indicador" placeholderTextColor={colors.neutral} style={styles.input} />
        <View style={styles.inlineRow}>
          <TextInput value={target} onChangeText={setTarget} placeholder="Meta" placeholderTextColor={colors.neutral} keyboardType="numeric" style={[styles.input, styles.flex]} />
          <TextInput value={weight} onChangeText={setWeight} placeholder="Peso" placeholderTextColor={colors.neutral} keyboardType="numeric" style={[styles.input, styles.flex]} />
        </View>
        <AppButton title="Criar indicador" onPress={() => void submit()} loading={busy} style={styles.mt} />
      </View>

      <Text style={styles.listTitle}>{indicators.length} indicador(es)</Text>
      {indicators.length ? indicators.map((ind) => {
        const last = ind.versions[ind.versions.length - 1];
        return (
          <View key={ind.id} style={styles.card}>
            <View style={styles.indHeader}>
              <View style={styles.flex}>
                <Text style={styles.indCode}>{ind.code}</Text>
                <Text style={styles.indName}>{ind.name}</Text>
              </View>
              <View style={[styles.lifeBadge, ind.lifecycle === 'active' ? styles.statusOn : styles.statusOff]}>
                <Text style={[styles.statusToggleText, { color: ind.lifecycle === 'active' ? colors.success : colors.inkMuted }]}>{ind.lifecycle === 'active' ? 'Ativo' : 'Inativo'}</Text>
              </View>
            </View>
            <Text style={styles.indMeta}>v{last?.versionNumber ?? 1} · meta {last?.target} · peso {last?.weight} · {ind.versions.length} versão(ões) · {ind.usageCount} uso(s)</Text>
            <View style={styles.indActions}>
              <AppButton title="Nova versão" compact variant="secondary" onPress={() => void newVersion(ind.id, last?.target ?? 0, last?.weight ?? 1)} style={styles.flex} />
              {ind.lifecycle === 'active' && <AppButton title="Inativar" compact variant="secondary" onPress={() => void deactivateIndicator(ind.id)} style={styles.flex} />}
              <AppButton title="Excluir" compact variant="danger" onPress={() => void tryRemove(ind.id)} style={styles.flex} />
            </View>
          </View>
        );
      }) : <EmptyState title="Nenhum indicador" description="Cadastre o primeiro indicador versionado." />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.inkMuted, fontSize: 13 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: colors.white },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginBottom: spacing.md },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FAFAFB', paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13, marginBottom: spacing.sm },
  inlineRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: spacing.sm, marginBottom: spacing.sm },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: colors.white },
  mt: { marginTop: spacing.md },
  listTitle: { color: colors.inkMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '900', fontSize: 12 },
  rowBody: { flex: 1 },
  rowName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  rowMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  rowRole: { color: colors.primary, fontSize: 10, fontWeight: '800', marginTop: 3 },
  statusToggle: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1 },
  statusOn: { backgroundColor: colors.successSoft, borderColor: '#A9D8B8' },
  statusOff: { backgroundColor: colors.dangerSoft, borderColor: '#F1B6B6' },
  statusToggleText: { fontSize: 10, fontWeight: '900' },
  indHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  indCode: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  indName: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  lifeBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  indMeta: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.sm },
  indActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
