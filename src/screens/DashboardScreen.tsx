import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { MetricCard } from '../components/MetricCard';
import { SectionTitle } from '../components/SectionTitle';
import { OperationCard } from '../components/OperationCard';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/AppButton';
import { useDashboard } from '../context/OperationsProvider';
import { useOperationalUser } from '../context/useOperationalUser';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../types';
import { getMaturity } from '../utils/format';

export function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentUser = useOperationalUser();
  const { metrics, loading, error, refresh } = useDashboard();

  if (!metrics && loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centeredText}>Carregando indicadores…</Text>
        </View>
      </Screen>
    );
  }

  if (!metrics) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
          <Text style={styles.errorTitle}>Não foi possível carregar o painel</Text>
          {error ? <Text style={styles.centeredText}>{error}</Text> : null}
          <AppButton title="Tentar novamente" variant="secondary" onPress={refresh} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.eyebrow}>{currentUser?.region}</Text>
            <Text style={styles.greeting}>Olá, {currentUser?.name.split(' ')[0]}</Text>
            <Text style={styles.heroText}>Visão consolidada dos Parceiros AACE visíveis para o seu perfil.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>{currentUser?.avatarInitials}</Text></View>
        </View>
        <View style={styles.heroScoreRow}>
          <View>
            <Text style={styles.heroScoreLabel}>Índice médio dos Parceiros AACE</Text>
            <Text style={styles.heroScore}>{metrics.average}</Text>
          </View>
          <View style={styles.maturity}><Ionicons name="ribbon-outline" size={17} color={colors.white} /><Text style={styles.maturityText}>{getMaturity(metrics.average)}</Text></View>
        </View>
        <ProgressBar value={metrics.average} color={colors.white} />
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Parceiros AACE" value={metrics.operationsCount} helper="visíveis para o seu perfil" />
        <MetricCard label="Em conformidade" value={metrics.compliantCount} helper="semáforo verde" tone={metrics.compliantCount ? 'success' : 'neutral'} />
        <MetricCard label="Em atenção" value={metrics.attentionCount} helper="semáforo amarelo" tone={metrics.attentionCount ? 'warning' : 'neutral'} />
        <MetricCard label="Críticos" value={metrics.criticalCount} helper="com nota abaixo de 70" tone={metrics.criticalCount ? 'danger' : 'success'} />
        <MetricCard label="Avaliações pendentes" value={metrics.pendingAuditsCount} helper="ciclos a realizar" tone={metrics.pendingAuditsCount ? 'warning' : 'success'} />
        <MetricCard label="Planos abertos" value={metrics.openActionsCount} helper={`${metrics.overdueActionsCount} vencidos`} tone={metrics.overdueActionsCount ? 'warning' : 'neutral'} />
      </View>

      <SectionTitle title="Próximas avaliações" subtitle="Parceiros AACE com ciclo mais próximo do vencimento." />
      {metrics.upcoming.length ? metrics.upcoming.map((operation) => (
        <OperationCard key={operation.id} operation={operation} onPress={() => navigation.navigate('OperationDetail', { operationId: operation.id })} />
      )) : <EmptyState title="Nenhum Parceiro AACE" description="Não há Parceiros AACE associados a este perfil." />}

      <SectionTitle title="Foco da semana" subtitle="Sinais que exigem atuação gerencial imediata." />
      <View style={styles.focusCard}>
        <FocusRow icon="alert-circle-outline" title="Parceiros críticos" value={`${metrics.criticalCount}`} tone={colors.danger} />
        <FocusRow icon="time-outline" title="Planos vencidos" value={`${metrics.overdueActionsCount}`} tone={colors.warning} />
        <FocusRow icon="shield-checkmark-outline" title="Validações pendentes" value={`${metrics.pendingValidationsCount}`} tone={colors.info} last />
      </View>
    </Screen>
  );
}

function FocusRow({ icon, title, value, tone, last }: { icon: keyof typeof Ionicons.glyphMap; title: string; value: string; tone: string; last?: boolean }) {
  return (
    <View style={[styles.focusRow, last && styles.focusRowLast]}>
      <View style={[styles.focusIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={icon} size={19} color={tone} /></View>
      <Text style={styles.focusTitle}>{title}</Text>
      <Text style={[styles.focusValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: 64 },
  centeredText: { color: colors.inkMuted, fontSize: 13, textAlign: 'center' },
  errorTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  hero: { backgroundColor: colors.primary, borderRadius: 24, padding: spacing.xl, marginBottom: spacing.lg },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg },
  eyebrow: { color: '#FFD4D6', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  greeting: { color: colors.white, fontSize: 25, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  heroText: { color: '#FFE9EA', fontSize: 12, marginTop: 5, maxWidth: 260 },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontWeight: '900' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  heroScoreLabel: { color: '#FFD4D6', fontSize: 11 },
  heroScore: { color: colors.white, fontSize: 40, lineHeight: 44, fontWeight: '900' },
  maturity: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.16)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill },
  maturityText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  focusCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  focusRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  focusRowLast: { borderBottomWidth: 0 },
  focusIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  focusTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', flex: 1 },
  focusValue: { fontSize: 17, fontWeight: '900' },
});
