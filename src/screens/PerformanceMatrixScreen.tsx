/**
 * Matriz de desempenho (AAPEX v2): cruza conformidade (auditoria aprovada) com
 * resultado (indicadores da Gestão Assistida), por Parceiro AACE. A tela NÃO
 * calcula nada — toda a regra mora em `domain/dashboard/performanceMatrix.ts`.
 *
 * Reuso obrigatório: `useOperations()` (já carregado, já no escopo) e
 * `usePerformance()` (indicadores e resultados já carregados) — sem consulta
 * nova, sem N+1, sem chamada por item renderizado.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { SectionTitle } from '../components/SectionTitle';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/AppButton';
import { useOperations } from '../context/OperationsProvider';
import { usePerformance } from '../context/usePerformance';
import {
  computePerformanceMatrix,
  EXCLUSION_REASON_LABEL,
  NO_DATA_LABEL,
  PerformanceMatrixEntry,
  Quadrant,
  QUADRANT_LABEL,
} from '../domain/dashboard/performanceMatrix';
import { colors, radius, spacing } from '../theme';

const QUADRANT_ORDER: Quadrant[] = ['healthy', 'ineffective_routine', 'result_without_process', 'critical'];

const QUADRANT_TONE: Record<Quadrant, string> = {
  healthy: colors.success,
  ineffective_routine: colors.warning,
  result_without_process: colors.warning,
  critical: colors.danger,
};

const QUADRANT_DESCRIPTION: Record<Quadrant, string> = {
  healthy: 'Conformidade alta e resultado dentro da meta.',
  ineffective_routine: 'Conformidade alta, mas o resultado não acompanha.',
  result_without_process: 'Resultado dentro da meta, sem conformidade que sustente.',
  critical: 'Conformidade baixa e resultado fora da meta.',
};

export function PerformanceMatrixScreen() {
  const { operations, loading: opsLoading, error: opsError, refresh: refreshOps } = useOperations();
  const { indicatorDefinitions, indicatorResults, loading: perfLoading, error: perfError } = usePerformance();

  const allResults = useMemo(
    () => operations.flatMap((operation) => indicatorResults(operation.id)),
    [operations, indicatorResults],
  );

  const matrix = useMemo(
    () => computePerformanceMatrix(operations, indicatorDefinitions, allResults),
    [operations, indicatorDefinitions, allResults],
  );

  const loading = (opsLoading || perfLoading) && operations.length === 0;
  const error = opsError ?? perfError;

  if (loading) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centeredText}>Carregando a matriz de desempenho…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
          <Text style={styles.errorTitle}>Não foi possível carregar a matriz</Text>
          <Text style={styles.centeredText}>{error}</Text>
          <AppButton title="Tentar novamente" variant="secondary" onPress={refreshOps} />
        </View>
      </Screen>
    );
  }

  if (operations.length === 0) {
    return (
      <Screen>
        <SectionTitle
          title="Matriz de desempenho"
          subtitle="Cruzamento entre conformidade da auditoria e resultado dos indicadores."
        />
        <EmptyState
          title="Nenhum Parceiro AACE visível"
          description="Não há Parceiros AACE associados a este perfil para cruzar."
        />
      </Screen>
    );
  }

  const excluded = matrix.entries.filter((entry) => entry.quadrant === null);

  return (
    <Screen>
      <SectionTitle
        title="Matriz de desempenho"
        subtitle="Cruza a conformidade da auditoria (Índice de excelência) com o resultado dos indicadores da Gestão Assistida — os dois eixos permanecem independentes; nenhuma nota é recalculada aqui."
      />

      <View style={styles.grid}>
        {QUADRANT_ORDER.map((quadrant) => (
          <View key={quadrant} style={[styles.quadrantCard, { borderLeftColor: QUADRANT_TONE[quadrant] }]}>
            <Text style={styles.quadrantCount}>{matrix.quadrantCounts[quadrant]}</Text>
            <Text style={styles.quadrantLabel}>{QUADRANT_LABEL[quadrant]}</Text>
            <Text style={styles.quadrantDescription}>{QUADRANT_DESCRIPTION[quadrant]}</Text>
            <PartnerList entries={matrix.entries.filter((entry) => entry.quadrant === quadrant)} />
          </View>
        ))}
      </View>

      <SectionTitle
        title={NO_DATA_LABEL}
        subtitle="Estes Parceiros AACE não entram em quadrante algum até que o dado que falta seja registrado."
      />
      {excluded.length === 0 ? (
        <EmptyState
          title="Todos os parceiros visíveis entraram na matriz"
          description="Nenhum Parceiro AACE está sem auditoria aprovada ou sem lançamento de indicador."
        />
      ) : (
        <View style={styles.excludedCard}>
          {excluded.map((entry, index) => (
            <View key={entry.operationId} style={[styles.excludedRow, index === excluded.length - 1 && styles.excludedRowLast]}>
              <Text style={styles.excludedName}>{entry.partnerName}</Text>
              <Text style={styles.excludedReason}>
                {entry.exclusionReasons.map((reason) => EXCLUSION_REASON_LABEL[reason]).join(' e ')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function PartnerList({ entries }: { entries: PerformanceMatrixEntry[] }) {
  if (entries.length === 0) {
    return <Text style={styles.quadrantEmpty}>Nenhum parceiro neste quadrante.</Text>;
  }
  return (
    <View style={styles.quadrantList}>
      {entries.map((entry) => (
        <Text key={entry.operationId} style={styles.quadrantPartner} numberOfLines={1}>
          {entry.partnerName}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: 64 },
  centeredText: { color: colors.inkMuted, fontSize: 13, textAlign: 'center' },
  errorTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  grid: { gap: spacing.md, marginBottom: spacing.xl },
  quadrantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.lg,
  },
  quadrantCount: { color: colors.ink, fontSize: 30, fontWeight: '900' },
  quadrantLabel: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  quadrantDescription: { color: colors.inkMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  quadrantEmpty: { color: colors.inkMuted, fontSize: 12, marginTop: spacing.sm, fontStyle: 'italic' },
  quadrantList: { marginTop: spacing.sm, gap: 4 },
  quadrantPartner: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  excludedCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  excludedRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2 },
  excludedRowLast: { borderBottomWidth: 0 },
  excludedName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  excludedReason: { color: colors.inkMuted, fontSize: 12 },
});
