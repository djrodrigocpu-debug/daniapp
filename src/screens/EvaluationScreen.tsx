import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { ActionPlanModal } from '../components/ActionPlanModal';
import { ProgressBar } from '../components/ProgressBar';
import { useEvaluations } from '../context/EvaluationsProvider';
import { themes } from '../data/catalog';
import { colors, radius, spacing } from '../theme';
import { ActionPlan, AssessmentAnswer, RootStackParamList, Theme, TrafficLight } from '../types';
import { completionRate } from '../utils/scoring';
import { trafficLightColor, trafficLightLabel, trafficLightSoftColor } from '../utils/format';

const selectableStatuses: TrafficLight[] = ['green', 'yellow', 'red', 'not_applicable'];

export function EvaluationScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Evaluation'>) {
  const {
    getEvaluation, getOperation, getActionPlan, getEvidences, saveAnswer, addEvidence, removeEvidence, saveActionPlan, submit,
  } = useEvaluations();
  const evaluation = route.params.evaluationId ? getEvaluation(route.params.evaluationId) : undefined;
  const operation = getOperation(route.params.operationId);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (!evaluation) return [];
    const mapped = evaluation.answers
      .map((answer) => ({ answer, theme: themes.find((theme) => theme.id === answer.themeId) }))
      .filter((item): item is { answer: AssessmentAnswer; theme: Theme } => !!item.theme);
    return Array.from(new Set(mapped.map((item) => item.theme.pillar))).map((pillar) => ({
      pillar,
      items: mapped.filter((item) => item.theme.pillar === pillar),
    }));
  }, [evaluation]);

  if (!evaluation || !operation) return <Screen><Text>Avaliação não encontrada.</Text></Screen>;
  const activeEvaluation = evaluation;
  const activeOperation = operation;
  const readOnly = activeEvaluation.status === 'submitted' || activeEvaluation.status === 'approved';
  const progress = completionRate(activeEvaluation.answers);
  const existingPlan = selectedThemeId ? getActionPlan(activeEvaluation.id, selectedThemeId) : undefined;

  async function takePhoto(themeId: string) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso à câmera para registrar a comprovação.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.72, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    addEvidence(activeEvaluation.id, themeId, {
      name: asset.fileName ?? `Foto_${themeId}_${Date.now()}.jpg`,
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      type: 'photo',
    });
  }

  async function pickDocument(themeId: string) {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    addEvidence(activeEvaluation.id, themeId, {
      name: asset.name,
      uri: asset.uri,
      mimeType: asset.mimeType,
      type: 'document',
    });
  }

  async function handleSubmit() {
    const result = await submit(activeEvaluation.id);
    if (!result.ok) {
      Alert.alert('Avaliação incompleta', result.message);
      return;
    }
    Alert.alert('Avaliação enviada', 'O ciclo foi encaminhado para validação da coordenação.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  function savePlan(values: { problem: string; rootCause: string; action: string; owner: string; dueDate: string; priority: ActionPlan['priority']; expectedEvidence: string }) {
    if (!selectedThemeId) return;
    saveActionPlan({
      id: existingPlan?.id,
      operationId: activeOperation.id,
      evaluationId: activeEvaluation.id,
      themeId: selectedThemeId,
      problem: values.problem,
      rootCause: values.rootCause,
      action: values.action,
      owner: values.owner,
      dueDate: values.dueDate,
      priority: values.priority,
      expectedEvidence: values.expectedEvidence,
      status: existingPlan?.status ?? 'not_started',
      completionNote: existingPlan?.completionNote,
    });
  }

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <View style={styles.summary}>
        <Text style={styles.eyebrow}>{evaluation.frequency === 'weekly' ? 'AUDITORIA SEMANAL' : 'AUDITORIA MENSAL'}</Text>
        <Text style={styles.title}>{operation.partnerName}</Text>
        <Text style={styles.subtitle}>{operation.officeName} · {evaluation.cycleLabel}</Text>
        <View style={styles.summaryRow}>
          <View><Text style={styles.summaryLabel}>Conclusão</Text><Text style={styles.summaryValue}>{progress}%</Text></View>
          <View style={styles.alignRight}><Text style={styles.summaryLabel}>Nota projetada</Text><Text style={styles.summaryValue}>{evaluation.score}</Text></View>
        </View>
        <ProgressBar value={progress} />
        {readOnly && <View style={styles.readOnly}><Ionicons name="lock-closed-outline" size={16} color={colors.info} /><Text style={styles.readOnlyText}>Avaliação enviada. O conteúdo está em modo de consulta.</Text></View>}
      </View>

      <View style={styles.legend}>
        {selectableStatuses.map((status) => (
          <View key={status} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: trafficLightColor[status] }]} /><Text style={styles.legendText}>{trafficLightLabel[status]}</Text></View>
        ))}
      </View>

      {grouped.map((group) => (
        <View key={group.pillar} style={styles.group}>
          <Text style={styles.groupTitle}>{group.pillar}</Text>
          <Text style={styles.groupSubtitle}>{group.items.length} item(ns) deste ciclo</Text>
          {group.items.map(({ theme, answer }) => {
            const evidenceItems = getEvidences(answer.evidenceIds);
            const plan = getActionPlan(activeEvaluation.id, theme.id);
            return (
              <View key={theme.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemNumber}><Text style={styles.itemNumberText}>{theme.id.replace('T', '')}</Text></View>
                  <View style={styles.itemHeading}>
                    <Text style={styles.itemTitle}>{theme.title}</Text>
                    <Text style={styles.itemKpi}>{theme.kpi}</Text>
                  </View>
                </View>
                <View style={styles.targetBox}>
                  <Text style={styles.targetLabel}>META / CRITÉRIO</Text>
                  <Text style={styles.targetText}>{theme.target}</Text>
                </View>

                <Text style={styles.fieldLabel}>Classificação</Text>
                <View style={styles.statusGrid}>
                  {selectableStatuses.map((status) => {
                    const active = answer.status === status;
                    return (
                      <Pressable
                        key={status}
                        disabled={readOnly}
                        onPress={() => saveAnswer(evaluation.id, theme.id, { status })}
                        style={[styles.statusButton, active && { borderColor: trafficLightColor[status], backgroundColor: trafficLightSoftColor[status] }, readOnly && styles.disabled]}
                      >
                        <View style={[styles.statusDot, { backgroundColor: trafficLightColor[status] }]} />
                        <Text style={[styles.statusText, active && { color: trafficLightColor[status] }]}>{trafficLightLabel[status]}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Resultado observado</Text>
                <TextInput
                  value={answer.measuredValue}
                  editable={!readOnly}
                  onChangeText={(value) => saveAnswer(evaluation.id, theme.id, { measuredValue: value })}
                  placeholder="Ex.: 82% da meta, 14 oportunidades, 1,2% de churn"
                  placeholderTextColor={colors.neutral}
                  style={[styles.input, readOnly && styles.readOnlyInput]}
                />

                <Text style={styles.fieldLabel}>Análise do gerente de canal</Text>
                <TextInput
                  value={answer.observation}
                  editable={!readOnly}
                  onChangeText={(value) => saveAnswer(evaluation.id, theme.id, { observation: value })}
                  placeholder="Registre o diagnóstico, a prática encontrada e os principais riscos."
                  placeholderTextColor={colors.neutral}
                  multiline
                  style={[styles.input, styles.multiline, readOnly && styles.readOnlyInput]}
                />

                <View style={styles.evidenceHeader}>
                  <View>
                    <Text style={styles.fieldLabelNoMargin}>Comprovações {theme.evidenceRequired ? '*' : ''}</Text>
                    <Text style={styles.evidenceHint}>{theme.evidenceHint}</Text>
                  </View>
                  <Text style={styles.evidenceCount}>{evidenceItems.length}</Text>
                </View>

                {!readOnly && (
                  <View style={styles.evidenceButtons}>
                    <AppButton title="Tirar foto" compact variant="secondary" onPress={() => void takePhoto(theme.id)} style={styles.flexButton} />
                    <AppButton title="Anexar arquivo" compact variant="secondary" onPress={() => void pickDocument(theme.id)} style={styles.flexButton} />
                  </View>
                )}

                {evidenceItems.map((evidence) => evidence && (
                  <View key={evidence.id} style={styles.evidenceItem}>
                    <Ionicons name={evidence.type === 'photo' ? 'camera-outline' : 'document-attach-outline'} size={18} color={colors.primary} />
                    <Text style={styles.evidenceName} numberOfLines={1}>{evidence.name}</Text>
                    {!readOnly && <Pressable onPress={() => removeEvidence(evaluation.id, evidence.id)}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable>}
                  </View>
                ))}

                {answer.status === 'red' && (
                  <View style={styles.planAlert}>
                    <View style={styles.planTextBlock}>
                      <Text style={styles.planTitle}>{plan ? 'Plano de ação registrado' : 'Plano de ação obrigatório'}</Text>
                      <Text style={styles.planText}>{plan ? `${plan.owner} · prazo ${plan.dueDate}` : 'Itens não conformes precisam de responsável, prazo e evidência esperada.'}</Text>
                    </View>
                    {!readOnly && <AppButton title={plan ? 'Editar' : 'Criar'} compact onPress={() => setSelectedThemeId(theme.id)} />}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {!readOnly && (
        <View style={styles.submitCard}>
          <Text style={styles.submitTitle}>Finalizar auditoria</Text>
          <Text style={styles.submitText}>O envio exige todos os itens classificados, evidências obrigatórias e plano de ação para cada não conformidade.</Text>
          <AppButton title="Enviar para validação" onPress={() => void handleSubmit()} style={styles.submitButton} />
        </View>
      )}

      <ActionPlanModal
        visible={!!selectedThemeId}
        existing={existingPlan}
        defaultOwner="Liderança da operação"
        onClose={() => setSelectedThemeId(null)}
        onSave={savePlan}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 4 },
  subtitle: { color: colors.inkMuted, fontSize: 12, marginTop: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  summaryLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
  summaryValue: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 2 },
  alignRight: { alignItems: 'flex-end' },
  readOnly: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  readOnlyText: { color: colors.info, fontSize: 11, flex: 1, lineHeight: 16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginVertical: spacing.lg, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.inkMuted, fontSize: 10, fontWeight: '700' },
  group: { marginBottom: spacing.xl },
  groupTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  groupSubtitle: { color: colors.inkMuted, fontSize: 11, marginTop: 3, marginBottom: spacing.md },
  itemCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  itemHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  itemNumber: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  itemNumberText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  itemHeading: { flex: 1 },
  itemTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  itemKpi: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  targetBox: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  targetLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  targetText: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 4 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },
  fieldLabelNoMargin: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusButton: { width: '48%', minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  disabled: { opacity: 0.75 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FAFAFB', paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13 },
  multiline: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: 'top' },
  readOnlyInput: { backgroundColor: colors.background, color: colors.inkMuted },
  evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'flex-start', marginTop: spacing.lg },
  evidenceHint: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 3, maxWidth: 270 },
  evidenceCount: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, color: colors.primary, textAlign: 'center', textAlignVertical: 'center', fontSize: 11, fontWeight: '900', paddingTop: 5 },
  evidenceButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flexButton: { flex: 1 },
  evidenceItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  evidenceName: { flex: 1, color: colors.ink, fontSize: 11 },
  planAlert: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  planTextBlock: { flex: 1 },
  planTitle: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  planText: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, marginTop: 3 },
  submitCard: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl },
  submitTitle: { color: colors.white, fontSize: 19, fontWeight: '900' },
  submitText: { color: '#D1D5DB', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  submitButton: { marginTop: spacing.lg },
});
