import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { alertDialog } from '../utils/dialog';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { ActionPlanModal } from '../components/ActionPlanModal';
import { usePerformance } from '../context/usePerformance';
import { decideOperationDetailState } from '../domain/operations/operationDetailState';
import { parseDecimalInput } from '../domain/indicators/indicatorForm';
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
  const { loading, error, getOperation, indicatorResults, indicatorDefinitions, actionPlans, latestReport, saveIndicatorResult, saveActionPlan, createVisitReport } = usePerformance();
  const operation = getOperation(operationId);
  // Entrada de resultado: com `result` edita o existente; sem `result` registra
  // o PRIMEIRO valor do indicador para esta operação.
  const [entryFor, setEntryFor] = useState<{ definition: IndicatorDefinition; result?: IndicatorResult } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<{ definition: IndicatorDefinition; result: IndicatorResult } | null>(null);
  const [objective, setObjective] = useState('Evoluir os indicadores críticos e garantir execução do plano de ação.');
  const [showAll, setShowAll] = useState(false);

  const operationActionPlans = actionPlans(operationId);
  const items = useMemo(() => indicatorResults(operationId)
    .map((result) => {
      // Resultado sem definição correspondente é descartado — antes o `!`
      // derrubava a tela inteira em vez de simplesmente não exibir o card.
      const definition = indicatorDefinitions.find((item) => item.id === result.indicatorId);
      if (!definition) return null;
      const status = calculateIndicatorStatus(definition, result);
      return { definition, result, status, achievement: achievement(definition, result) };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.definition.weight - a.definition.weight), [indicatorResults, indicatorDefinitions, operationId]);

  // Indicadores cadastrados AINDA sem resultado nesta operação: estado próprio —
  // "sem resultado" não é meta atingida, não é meta perdida e não é zero.
  const pendingDefinitions = useMemo(
    () => indicatorDefinitions.filter((definition) => !items.some((item) => item.definition.id === definition.id)),
    [indicatorDefinitions, items],
  );

  // Mesma regra pura do detalhe do parceiro: carregando e erro de rede/RLS
  // NUNCA aparecem como inexistência.
  const detailState = decideOperationDetailState({ loading, error, found: !!operation });
  if (detailState === 'loading') {
    return (
      <Screen>
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>Carregando a Gestão Assistida…</Text>
        </View>
      </Screen>
    );
  }
  if (detailState === 'error') {
    return (
      <Screen>
        <View style={styles.stateBox}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
          <Text style={styles.stateText}>Não foi possível carregar a Gestão Assistida.</Text>
        </View>
      </Screen>
    );
  }
  if (!operation) {
    return (
      <Screen>
        <View style={styles.stateBox}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.inkMuted} />
          <Text style={styles.stateText}>Parceiro AACE não encontrado.</Text>
        </View>
      </Screen>
    );
  }
  const critical = items.filter((item) => item.status === 'red');
  const attention = items.filter((item) => item.status === 'yellow');
  const healthy = items.filter((item) => item.status === 'green');
  const visible = showAll ? items : items.filter((item) => item.status !== 'green');
  const openPlans = operationActionPlans.filter((plan) => !['completed', 'validated'].includes(plan.status));
  const previousReport = latestReport(operationId);
  const selectedPlanExisting = selectedPlan
    ? operationActionPlans.find((plan) => plan.themeId === selectedPlan.definition.id && !['completed', 'validated'].includes(plan.status))
    : undefined;

  function savePlan(input: Omit<ActionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
    saveActionPlan(input);
    setSelectedPlan(null);
  }

  async function saveEntry(definition: IndicatorDefinition, result: IndicatorResult | undefined, values: { target: number; actual: number; diagnosis?: string; observation?: string }) {
    const res = await saveIndicatorResult({
      operationId,
      indicatorId: definition.id,
      // Edição preserva o período do resultado; criação deixa o servidor
      // aplicar o mês corrente.
      period: result?.period,
      ...values,
    });
    if (!res.ok) {
      alertDialog('Não foi possível salvar', res.error.message);
      return;
    }
    setEntryFor(null);
    alertDialog('Resultado salvo', 'O valor foi registrado no servidor para este Parceiro AACE.');
  }

  function finishVisit() {
    // Planos operacionais da Gestão Assistida: vinculados à OPERAÇÃO, sem
    // avaliação (evaluation_id nulo no servidor → '' na projeção).
    const plans = operationActionPlans.filter((plan) => !plan.evaluationId);
    const summary = `${critical.length} indicador(es) crítico(s), ${attention.length} em atenção e ${healthy.length} dentro da meta. ${plans.length} plano(s) de ação vinculado(s).`;
    createVisitReport({
      operationId,
      objective,
      summary,
      criticalIndicators: critical.map((item) => item.definition.id),
      actionPlanIds: plans.map((plan) => plan.id),
      nextReviewDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    });
    alertDialog('Visita registrada', 'O diagnóstico foi salvo e já ficará disponível para retroalimentar a próxima visita.');
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
        <Text style={styles.metricsNote}>
          O Índice de excelência mede a auditoria dos processos. Os indicadores operacionais medem
          resultados e não compõem esta nota.
        </Text>
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
        const isEditing = entryFor?.result?.id === result.id;
        const existingPlan = operationActionPlans.find((plan) => plan.themeId === definition.id && !['completed', 'validated'].includes(plan.status));
        return (
          <View key={result.id} style={[styles.indicatorCard, { borderLeftColor: trafficLightColor[indicatorStatus] }]}>
            <View style={styles.indicatorTop}>
              <View style={styles.flex}>
                {!!definition.category && <Text style={styles.category}>{definition.category}</Text>}
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
              <ResultEntry
                definition={definition}
                result={result}
                onCancel={() => setEntryFor(null)}
                onSave={(values) => void saveEntry(definition, result, values)}
              />
            ) : (
              <>
                {result.diagnosis && <Text style={styles.diagnosis}>Diagnóstico: {result.diagnosis}</Text>}
                <View style={styles.actionsRow}>
                  <AppButton title="Diagnosticar" compact variant="secondary" onPress={() => setEntryFor({ definition, result })} style={styles.flex} />
                  {indicatorStatus !== 'green' && <AppButton title={existingPlan ? 'Editar ação' : 'Gerar ação'} compact onPress={() => setSelectedPlan({ definition, result })} style={styles.flex} />}
                </View>
              </>
            )}
          </View>
        );
      })}

      {/* Indicadores cadastrados sem resultado NESTA operação: aqui nasce o
          primeiro valor — antes não existia caminho algum de criação. */}
      {pendingDefinitions.map((definition) => {
        const isRegistering = !!entryFor && !entryFor.result && entryFor.definition.id === definition.id;
        return (
          <View key={definition.id} style={[styles.indicatorCard, { borderLeftColor: trafficLightColor.not_evaluated }]}>
            <View style={styles.indicatorTop}>
              <View style={styles.flex}>
                {!!definition.category && <Text style={styles.category}>{definition.category}</Text>}
                <Text style={styles.indicatorTitle}>{definition.title}</Text>
              </View>
              <View style={[styles.status, { backgroundColor: `${trafficLightColor.not_evaluated}18` }]}>
                <View style={[styles.dot, { backgroundColor: trafficLightColor.not_evaluated }]} />
                <Text style={[styles.statusText, { color: trafficLightColor.not_evaluated }]}>Sem resultado</Text>
              </View>
            </View>
            <Text style={styles.diagnosis}>Nenhum resultado registrado — sem valor não há semáforo nem atingimento.</Text>
            {isRegistering ? (
              <ResultEntry
                definition={definition}
                onCancel={() => setEntryFor(null)}
                onSave={(values) => void saveEntry(definition, undefined, values)}
              />
            ) : (
              <View style={styles.actionsRow}>
                <AppButton title="Registrar resultado" compact onPress={() => setEntryFor({ definition })} style={styles.flex} />
              </View>
            )}
          </View>
        );
      })}

      {/* Três ausências DIFERENTES: catálogo vazio, catálogo sem medição para
          este parceiro e tudo dentro da meta. Só a terceira é boa notícia —
          declarar "dentro da meta" sem indicador algum seria dado falso; e um
          indicador SEM resultado também impede a declaração. */}
      {!visible.length && (
        !indicatorDefinitions.length ? (
          <View style={styles.emptyCard}>
            <Ionicons name="stats-chart-outline" size={28} color={colors.inkMuted} />
            <Text style={styles.emptyText}>Nenhum indicador cadastrado no programa. Sem catálogo não há prioridades a calcular para esta visita.</Text>
          </View>
        ) : !items.length ? (
          <View style={styles.emptyCard}>
            <Ionicons name="stats-chart-outline" size={28} color={colors.inkMuted} />
            <Text style={styles.emptyText}>Nenhum resultado de indicador registrado para este Parceiro AACE. Registre o primeiro valor nos cartões acima.</Text>
          </View>
        ) : !pendingDefinitions.length ? (
          <View style={styles.allGood}><Ionicons name="checkmark-circle" size={28} color={colors.success} /><Text style={styles.allGoodText}>Todos os indicadores estão dentro da meta.</Text></View>
        ) : null
      )}

      <View style={styles.reportCard}>
        <Text style={styles.reportTitle}>Relatório automático da visita</Text>
        <Text style={styles.reportText}>{critical.length} críticos · {attention.length} em atenção · {healthy.length} na meta · {openPlans.length} ações abertas.</Text>
        <Text style={styles.reportHint}>Ao finalizar, o resumo fica salvo no histórico do parceiro e aparece na próxima visita.</Text>
        <AppButton title="Finalizar e salvar relatório" onPress={finishVisit} style={styles.finishButton} />
      </View>

      <ActionPlanModal
        visible={!!selectedPlan}
        existing={selectedPlanExisting}
        defaultOwner="Gerente de canal / parceiro"
        onClose={() => setSelectedPlan(null)}
        // Vínculo canônico do plano operacional: OPERAÇÃO por UUID, sem
        // avaliação (evaluationId vazio → NULL no servidor). Reeditar reaproveita
        // o `id` do plano aberto — clique repetido atualiza, não duplica.
        onSave={(plan) => selectedPlan && savePlan({ ...plan, id: selectedPlanExisting?.id, operationId, evaluationId: '', themeId: selectedPlan.definition.id, problem: `${selectedPlan.definition.title}: realizado ${formatValue(selectedPlan.result.actual, selectedPlan.definition.unit)} versus meta ${formatValue(selectedPlan.result.target, selectedPlan.definition.unit)}.`, rootCause: selectedPlan.result.diagnosis ?? plan.rootCause, status: 'not_started' })}
      />
    </Screen>
  );
}

function Summary({ value, label, color }: { value: number; label: string; color: string }) { return <View style={styles.summary}><Text style={[styles.summaryValue, { color }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }
function ValueBox({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <View style={styles.valueBox}><Text style={styles.valueLabel}>{label}</Text><Text style={[styles.valueText, strong && styles.valueStrong]}>{value}</Text></View>; }
function NumericField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (text: string) => void }) { return <View style={styles.flex}><Text style={styles.label}>{label}</Text><TextInput keyboardType="decimal-pad" value={value} onChangeText={onChangeText} style={styles.numericInput} /></View>; }

/**
 * Entrada bufferizada de resultado: nada é gravado por tecla — o valor só vai
 * ao servidor no salvar, validado (NaN e vazio recusados; zero preservado).
 * Sem `result` é o registro do PRIMEIRO valor do indicador nesta operação.
 */
function ResultEntry({ definition, result, onCancel, onSave }: {
  definition: IndicatorDefinition;
  result?: IndicatorResult;
  onCancel: () => void;
  onSave: (values: { target: number; actual: number; diagnosis?: string; observation?: string }) => void;
}) {
  const [target, setTarget] = useState(result ? String(result.target) : String(definition.defaultTarget));
  const [actual, setActual] = useState(result ? String(result.actual) : '');
  const [diagnosis, setDiagnosis] = useState<string | undefined>(result?.diagnosis);
  const [observation, setObservation] = useState(result?.observation ?? '');

  function handleSave() {
    const parsedTarget = parseDecimalInput(target);
    if (parsedTarget === null) {
      alertDialog('Meta inválida', 'Informe uma meta numérica. Zero é válido; campo vazio não.');
      return;
    }
    const parsedActual = parseDecimalInput(actual);
    if (parsedActual === null) {
      alertDialog('Realizado inválido', 'Informe o valor realizado. Zero é válido; campo vazio não.');
      return;
    }
    onSave({ target: parsedTarget, actual: parsedActual, diagnosis, observation: observation.trim() || undefined });
  }

  return (
    <View style={styles.editArea}>
      <View style={styles.editRow}>
        <NumericField label={`Meta (${definition.unit})`} value={target} onChangeText={setTarget} />
        <NumericField label={`Realizado (${definition.unit})`} value={actual} onChangeText={setActual} />
      </View>
      {/* O catálogo corporativo não tem opções de diagnóstico; sem
          elas a observação livre continua sendo o registro. */}
      {definition.diagnosticOptions.length > 0 && (
        <>
          <Text style={styles.label}>Diagnóstico</Text>
          <View style={styles.chips}>
            {definition.diagnosticOptions.map((option) => (
              <Pressable key={option} onPress={() => setDiagnosis(option)} style={[styles.chip, diagnosis === option && styles.chipActive]}>
                <Text style={[styles.chipText, diagnosis === option && styles.chipTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <TextInput value={observation} onChangeText={setObservation} placeholder="Observação objetiva da visita" placeholderTextColor={colors.neutral} multiline style={styles.observation} />
      <View style={styles.editRow}>
        <AppButton title="Cancelar" compact variant="secondary" onPress={onCancel} style={styles.flex} />
        <AppButton title={result ? 'Salvar resultado' : 'Registrar resultado'} compact onPress={handleSave} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl }, eyebrow: { color: '#FCA5A5', fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 5 }, subtitle: { color: '#D1D5DB', fontSize: 12, marginTop: 4 },
  metricsNote: { color: '#9CA3AF', fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', marginTop: spacing.xl, gap: spacing.sm }, summary: { flex: 1, backgroundColor: '#FFFFFF10', borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' }, summaryValue: { fontSize: 22, fontWeight: '900' }, summaryLabel: { color: '#D1D5DB', fontSize: 9, marginTop: 2 },
  feedbackCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.infoSoft, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md }, feedbackTitle: { color: colors.info, fontSize: 13, fontWeight: '900' }, feedbackText: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: 4 }, feedbackMeta: { color: colors.inkMuted, fontSize: 10, marginTop: 5 }, flex: { flex: 1 },
  objectiveCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md }, label: { color: colors.ink, fontSize: 11, fontWeight: '800', marginBottom: 6 }, objectiveInput: { color: colors.ink, fontSize: 13, minHeight: 56, textAlignVertical: 'top' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xl, marginBottom: spacing.md }, sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' }, sectionSubtitle: { color: colors.inkMuted, fontSize: 10, marginTop: 3 }, link: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  indicatorCard: { backgroundColor: colors.surface, borderWidth: 1, borderLeftWidth: 5, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md }, indicatorTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }, category: { color: colors.inkMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, indicatorTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 2 }, status: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99 }, dot: { width: 7, height: 7, borderRadius: 4 }, statusText: { fontSize: 9, fontWeight: '900' },
  valueRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }, valueBox: { flex: 1, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm }, valueLabel: { color: colors.inkMuted, fontSize: 9 }, valueText: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 3 }, valueStrong: { fontSize: 16, fontWeight: '900' }, diagnosis: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.md }, actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  editArea: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }, editRow: { flexDirection: 'row', gap: spacing.md }, numericInput: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.ink, marginBottom: spacing.md }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 }, chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, chipText: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' }, chipTextActive: { color: colors.primary }, observation: { minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.ink, textAlignVertical: 'top', marginBottom: spacing.md },
  allGood: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.successSoft, borderRadius: radius.lg, padding: spacing.lg }, allGoodText: { color: colors.success, fontWeight: '800' },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg }, emptyText: { flex: 1, color: colors.inkMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  stateBox: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl * 2 }, stateText: { color: colors.inkMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  reportCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.lg, marginBottom: spacing.xl }, reportTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, reportText: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: spacing.sm }, reportHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 5 }, finishButton: { marginTop: spacing.lg },
});
