import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { ActionPlanModal } from '../components/ActionPlanModal';
import { useApp } from '../context/AppContext';
import { achievement, calculateIndicatorStatus } from '../data/performance';
import { colors, radius, spacing } from '../theme';
import { ActionPlan, IndicatorDefinition, IndicatorResult, RootStackParamList, TrafficLight } from '../types';
import { trafficLightColor, trafficLightLabel } from '../utils/format';

const statusOrder: Record<TrafficLight, number> = { red: 0, yellow: 1, green: 2, not_evaluated: 3, not_applicable: 4 };

function formatValue(value: number, unit: string) {
  if (unit === 'R$') return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`;
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit === '%' || unit === 'p.p.' ? unit : ` ${unit}`}`;
}

export function PerformanceScreen({ route }: NativeStackScreenProps<RootStackParamList, 'Performance'>) {
  const { operationId } = route.params;
  const { data, getOperation, updateIndicatorResult, saveActionPlan, createVisitReport, currentUser } = useApp();
  const operation = getOperation(operationId);
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<{ definition: IndicatorDefinition; result: IndicatorResult } | null>(null);
  const [objective, setObjective] = useState('Evoluir os indicadores críticos e garantir execução do plano de ação.');
  const [showAll, setShowAll] = useState(false);

  const items = useMemo(() => data.indicatorResults
    .filter((result) => result.operationId === operationId)
    .map((result) => {
      const definition = data.indicatorDefinitions.find((item) => item.id === result.indicatorId)!;
      const status = calculateIndicatorStatus(definition, result);
      return { definition, result, status, achievement: achievement(definition, result) };
    })
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.definition.weight - a.definition.weight), [data.indicatorDefinitions, data.indicatorResults, operationId]);

  if (!operation) return <Screen><Text>Operação não encontrada.</Text></Screen>;
  const critical = items.filter((item) => item.status === 'red');
  const attention = items.filter((item) => item.status === 'yellow');
  const healthy = items.filter((item) => item.status === 'green');
  const visible = showAll ? items : items.filter((item) => item.status !== 'green');
  const openPlans = data.actionPlans.filter((plan) => plan.operationId === operationId && !['completed', 'validated'].includes(plan.status));
  const previousReport = data.visitReports.find((report) => report.operationId === operationId);

  function savePlan(input: Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    saveActionPlan(input);
    setSelectedPlan(null);
  }

  function finishVisit() {
    const plans = data.actionPlans.filter((plan) => plan.operationId === operationId && plan.evaluationId === `PERF_${operationId}`);
    const summary = `${critical.length} indicador(es) crítico(s), ${attention.length} em atenção e ${healthy.length} dentro da meta. ${plans.length} plano(s) de ação vinculado(s).`;
    createVisitReport({
      operationId,
      objective,
      summary,
      criticalIndicators: critical.map((item) => item.definition.id),
      actionPlanIds: plans.map((plan) => plan.id),
      nextReviewDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    });
    Alert.alert('Visita registrada', 'O diagnóstico foi salvo e já ficará disponível para retroalimentar a próxima visita.');
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>GESTÃO ASSISTIDA · V1.2</Text>
        <Text style={styles.title}>{operation.partnerName}</Text>
        <Text style={styles.subtitle}>{operation.officeName} · {operation.city}/{operation.state}</Text>
        <View style={styles.summaryRow}>
          <Summary value={critical.length} label="Críticos" color={colors.danger} />
          <Summary value={attention.length} label="Atenção" color={colors.warning} />
          <Summary value={healthy.length} label="Na meta" color={colors.success} />
          <Summary value={openPlans.length} label="Ações" color={colors.info} />
        </View>
      </View>

      {previousReport && (
        <View style={styles.feedbackCard}>
          <Ionicons name="refresh-circle-outline" size={24} color={colors.info} />
          <View style={styles.flex}>
            <Text style={styles.feedbackTitle}>Retroalimentação da última visita</Text>
            <Text style={styles.feedbackText}>{previousReport.summary}</Text>
            <Text style={styles.feedbackMeta}>Próxima revisão: {new Date(`${previousReport.nextReviewDate}T12:00:00`).toLocaleDateString('pt-BR')}</Text>
          </View>
        </View>
      )}

      <View style={styles.objectiveCard}>
        <Text style={styles.label}>Objetivo da visita</Text>
        <TextInput value={objective} onChangeText={setObjective} multiline style={styles.objectiveInput} />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Prioridades automáticas</Text>
          <Text style={styles.sectionSubtitle}>Meta × realizado define o semáforo e a ordem da visita.</Text>
        </View>
        <Pressable onPress={() => setShowAll((value) => !value)}><Text style={styles.link}>{showAll ? 'Só prioridades' : 'Ver todos'}</Text></Pressable>
      </View>

      {visible.map(({ definition, result, status: indicatorStatus, achievement: pct }) => {
        const isEditing = editing === result.id;
        const existingPlan = data.actionPlans.find((plan) => plan.operationId === operationId && plan.themeId === definition.id && !['completed', 'validated'].includes(plan.status));
        return (
          <View key={result.id} style={[styles.indicatorCard, { borderLeftColor: trafficLightColor[indicatorStatus] }]}>
            <View style={styles.indicatorTop}>
              <View style={styles.flex}>
                <Text style={styles.category}>{definition.category}</Text>
                <Text style={styles.indicatorTitle}>{definition.title}</Text>
              </View>
              <View style={[styles.status, { backgroundColor: `${trafficLightColor[indicatorStatus]}18` }]}>
                <View style={[styles.dot, { backgroundColor: trafficLightColor[indicatorStatus] }]} />
                <Text style={[styles.statusText, { color: trafficLightColor[indicatorStatus] }]}>{trafficLightLabel[indicatorStatus]}</Text>
              </View>
            </View>

            <View style={styles.valueRow}>
              <ValueBox label="Meta" value={formatValue(result.target, definition.unit)} />
              <ValueBox label="Realizado" value={formatValue(result.actual, definition.unit)} strong />
              <ValueBox label="Atingimento" value={`${Math.round(pct)}%`} />
            </View>

            {isEditing ? (
              <View style={styles.editArea}>
                <View style={styles.editRow}>
                  <NumericField label="Meta" value={result.target} onChange={(value) => updateIndicatorResult(result.id, { target: value })} />
                  <NumericField label="Realizado" value={result.actual} onChange={(value) => updateIndicatorResult(result.id, { actual: value })} />
                </View>
                <Text style={styles.label}>Diagnóstico</Text>
                <View style={styles.chips}>
                  {definition.diagnosticOptions.map((option) => (
                    <Pressable key={option} onPress={() => updateIndicatorResult(result.id, { diagnosis: option })} style={[styles.chip, result.diagnosis === option && styles.chipActive]}>
                      <Text style={[styles.chipText, result.diagnosis === option && styles.chipTextActive]}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput value={result.observation ?? ''} onChangeText={(observation) => updateIndicatorResult(result.id, { observation })} placeholder="Observação objetiva da visita" placeholderTextColor={colors.neutral} multiline style={styles.observation} />
                <AppButton title="Concluir diagnóstico" compact onPress={() => setEditing(null)} />
              </View>
            ) : (
              <>
                {result.diagnosis && <Text style={styles.diagnosis}>Diagnóstico: {result.diagnosis}</Text>}
                <View style={styles.actionsRow}>
                  <AppButton title="Diagnosticar" compact variant="secondary" onPress={() => setEditing(result.id)} style={styles.flex} />
                  {indicatorStatus !== 'green' && <AppButton title={existingPlan ? 'Editar ação' : 'Gerar ação'} compact onPress={() => setSelectedPlan({ definition, result })} style={styles.flex} />}
                </View>
              </>
            )}
          </View>
        );
      })}

      {!visible.length && <View style={styles.allGood}><Ionicons name="checkmark-circle" size={28} color={colors.success} /><Text style={styles.allGoodText}>Todos os indicadores estão dentro da meta.</Text></View>}

      <View style={styles.reportCard}>
        <Text style={styles.reportTitle}>Relatório automático da visita</Text>
        <Text style={styles.reportText}>{critical.length} críticos · {attention.length} em atenção · {healthy.length} na meta · {openPlans.length} ações abertas.</Text>
        <Text style={styles.reportHint}>Ao finalizar, o resumo fica salvo no histórico do parceiro e aparece na próxima visita.</Text>
        <AppButton title="Finalizar e salvar relatório" onPress={finishVisit} style={styles.finishButton} />
      </View>

      <ActionPlanModal
        visible={!!selectedPlan}
        existing={selectedPlan ? data.actionPlans.find((plan) => plan.operationId === operationId && plan.themeId === selectedPlan.definition.id) : undefined}
        defaultOwner="Gerente de canal / parceiro"
        onClose={() => setSelectedPlan(null)}
        onSave={(plan) => selectedPlan && savePlan({ ...plan, operationId, evaluationId: `PERF_${operationId}`, themeId: selectedPlan.definition.id, problem: `${selectedPlan.definition.title}: realizado ${formatValue(selectedPlan.result.actual, selectedPlan.definition.unit)} versus meta ${formatValue(selectedPlan.result.target, selectedPlan.definition.unit)}.`, rootCause: selectedPlan.result.diagnosis ?? plan.rootCause, status: 'not_started' })}
      />
    </Screen>
  );
}

function Summary({ value, label, color }: { value: number; label: string; color: string }) { return <View style={styles.summary}><Text style={[styles.summaryValue, { color }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }
function ValueBox({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <View style={styles.valueBox}><Text style={styles.valueLabel}>{label}</Text><Text style={[styles.valueText, strong && styles.valueStrong]}>{value}</Text></View>; }
function NumericField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <View style={styles.flex}><Text style={styles.label}>{label}</Text><TextInput keyboardType="decimal-pad" value={String(value)} onChangeText={(text) => onChange(Number(text.replace(',', '.')) || 0)} style={styles.numericInput} /></View>; }

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl }, eyebrow: { color: '#FCA5A5', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 5 }, subtitle: { color: '#D1D5DB', fontSize: 12, marginTop: 4 },
  summaryRow: { flexDirection: 'row', marginTop: spacing.xl, gap: spacing.sm }, summary: { flex: 1, backgroundColor: '#FFFFFF10', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' }, summaryValue: { fontSize: 22, fontWeight: '900' }, summaryLabel: { color: '#D1D5DB', fontSize: 9, marginTop: 2 },
  feedbackCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.infoSoft, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md }, feedbackTitle: { color: colors.info, fontSize: 13, fontWeight: '900' }, feedbackText: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: 4 }, feedbackMeta: { color: colors.inkMuted, fontSize: 10, marginTop: 5 }, flex: { flex: 1 },
  objectiveCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md }, label: { color: colors.ink, fontSize: 11, fontWeight: '800', marginBottom: 6 }, objectiveInput: { color: colors.ink, fontSize: 13, minHeight: 56, textAlignVertical: 'top' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xl, marginBottom: spacing.md }, sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' }, sectionSubtitle: { color: colors.inkMuted, fontSize: 10, marginTop: 3 }, link: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  indicatorCard: { backgroundColor: colors.surface, borderWidth: 1, borderLeftWidth: 5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }, indicatorTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }, category: { color: colors.inkMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, indicatorTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 2 }, status: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99 }, dot: { width: 7, height: 7, borderRadius: 4 }, statusText: { fontSize: 9, fontWeight: '900' },
  valueRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }, valueBox: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm }, valueLabel: { color: colors.inkMuted, fontSize: 9 }, valueText: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 3 }, valueStrong: { fontSize: 16, fontWeight: '900' }, diagnosis: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.md }, actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  editArea: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, editRow: { flexDirection: 'row', gap: spacing.md }, numericInput: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.ink, marginBottom: spacing.md }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 }, chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, chipText: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' }, chipTextActive: { color: colors.primary }, observation: { minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.ink, textAlignVertical: 'top', marginBottom: spacing.md },
  allGood: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.successSoft, borderRadius: radius.lg, padding: spacing.lg }, allGoodText: { color: colors.success, fontWeight: '800' },
  reportCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.xl }, reportTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, reportText: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: spacing.sm }, reportHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 5 }, finishButton: { marginTop: spacing.lg },
});
