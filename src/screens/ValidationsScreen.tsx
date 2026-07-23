import React, { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { useValidations } from '../context/ValidationsProvider';
import { colors, radius, spacing } from '../theme';
import { Evaluation, RootStackParamList } from '../types';
import { formatDateTime, getMaturity } from '../utils/format';

export function ValidationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { pending, validate, getOperation, getUser } = useValidations();
  const [selected, setSelected] = useState<Evaluation | null>(null);
  const [decision, setDecision] = useState<'approved' | 'returned'>('approved');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function openDecision(evaluation: Evaluation, value: 'approved' | 'returned') {
    setSelected(evaluation);
    setDecision(value);
    setNote('');
  }

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    const result = await validate(selected.id, decision, note.trim());
    setBusy(false);
    if (!result.ok) {
      Alert.alert('Não foi possível concluir', result.message);
      return;
    }
    setSelected(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Fila de validação</Text>
        <Text style={styles.subtitle}>Revise evidências, coerência do diagnóstico e planos de ação antes da decisão.</Text>
        <View style={styles.counter}><Text style={styles.counterValue}>{pending.length}</Text><Text style={styles.counterText}>avaliação(ões) aguardando validação</Text></View>

        {pending.length ? pending.map((evaluation) => {
          const operation = getOperation(evaluation.operationId);
          const evaluator = getUser(evaluation.evaluatorId);
          const redCount = evaluation.answers.filter((answer) => answer.status === 'red').length;
          const evidenceCount = evaluation.answers.reduce((sum, answer) => sum + answer.evidenceIds.length, 0);
          return (
            <View key={evaluation.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.icon}><Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} /></View>
                <View style={styles.heading}>
                  <Text style={styles.operation}>{operation?.partnerName}</Text>
                  <Text style={styles.office}>{operation?.officeName} · {evaluation.cycleLabel}</Text>
                </View>
                <View style={styles.scoreBlock}><Text style={styles.score}>{evaluation.score}</Text><Text style={styles.scoreLabel}>{getMaturity(evaluation.score)}</Text></View>
              </View>
              <View style={styles.metaBox}>
                <Meta label="Avaliador" value={evaluator?.name ?? '—'} />
                <Meta label="Enviado em" value={formatDateTime(evaluation.submittedAt)} />
                <Meta label="Não conformidades" value={`${redCount}`} />
                <Meta label="Evidências" value={`${evidenceCount}`} />
              </View>
              <View style={styles.actions}>
                <AppButton title="Revisar checklist" variant="secondary" compact onPress={() => navigation.navigate('Evaluation', { operationId: evaluation.operationId, evaluationId: evaluation.id })} style={styles.flex} />
                <AppButton title="Devolver" variant="danger" compact onPress={() => openDecision(evaluation, 'returned')} style={styles.flex} />
                <AppButton title="Aprovar" compact onPress={() => openDecision(evaluation, 'approved')} style={styles.flex} />
              </View>
            </View>
          );
        }) : <EmptyState title="Fila zerada" description="Não há avaliações aguardando validação neste momento." />}
      </ScrollView>

      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={[styles.decisionIcon, { backgroundColor: decision === 'approved' ? colors.successSoft : colors.dangerSoft }]}>
              <Ionicons name={decision === 'approved' ? 'checkmark-circle-outline' : 'return-down-back-outline'} size={27} color={decision === 'approved' ? colors.success : colors.danger} />
            </View>
            <Text style={styles.modalTitle}>{decision === 'approved' ? 'Aprovar avaliação' : 'Devolver para correção'}</Text>
            <Text style={styles.modalText}>{decision === 'approved' ? 'A nota aprovada atualizará o índice oficial da operação.' : 'O gerente de canal deverá corrigir o checklist e reenviar.'}</Text>
            <TextInput value={note} onChangeText={setNote} multiline placeholder="Registre uma observação para a decisão (opcional)." placeholderTextColor={colors.neutral} style={styles.noteInput} />
            <View style={styles.modalButtons}>
              <AppButton title="Cancelar" variant="secondary" onPress={() => setSelected(null)} style={styles.flex} />
              <AppButton title={decision === 'approved' ? 'Confirmar aprovação' : 'Confirmar devolução'} variant={decision === 'approved' ? 'primary' : 'danger'} loading={busy} onPress={() => void confirm()} style={styles.flex} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 40 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  counter: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.lg },
  counterValue: { color: colors.primary, fontSize: 23, fontWeight: '900' },
  counterText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1 },
  operation: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  office: { color: colors.inkMuted, fontSize: 11, marginTop: 3 },
  scoreBlock: { alignItems: 'flex-end', maxWidth: 88 },
  score: { color: colors.primary, fontSize: 25, fontWeight: '900' },
  scoreLabel: { color: colors.inkMuted, fontSize: 8, textAlign: 'right' },
  metaBox: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, rowGap: spacing.md },
  meta: { width: '50%' },
  metaLabel: { color: colors.inkMuted, fontSize: 9, fontWeight: '700' },
  metaValue: { color: colors.ink, fontSize: 11, fontWeight: '800', marginTop: 3 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modal: { width: '100%', maxWidth: 430, backgroundColor: colors.surface, borderRadius: 22, padding: spacing.xl },
  decisionIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  modalTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  modalText: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  noteInput: { minHeight: 95, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top', color: colors.ink, fontSize: 13, marginTop: spacing.lg },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
