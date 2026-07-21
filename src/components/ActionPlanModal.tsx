import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionPlan } from '../types';
import { colors, radius, spacing } from '../theme';
import { AppButton } from './AppButton';

interface ActionPlanModalProps {
  visible: boolean;
  existing?: ActionPlan;
  defaultOwner?: string;
  onClose: () => void;
  onSave: (values: {
    problem: string;
    rootCause: string;
    action: string;
    owner: string;
    dueDate: string;
    priority: ActionPlan['priority'];
    expectedEvidence: string;
  }) => void;
}

export function ActionPlanModal({ visible, existing, defaultOwner, onClose, onSave }: ActionPlanModalProps) {
  const [problem, setProblem] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [action, setAction] = useState('');
  const [owner, setOwner] = useState(defaultOwner ?? '');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<ActionPlan['priority']>('high');
  const [expectedEvidence, setExpectedEvidence] = useState('');

  useEffect(() => {
    if (!visible) return;
    setProblem(existing?.problem ?? '');
    setRootCause(existing?.rootCause ?? '');
    setAction(existing?.action ?? '');
    setOwner(existing?.owner ?? defaultOwner ?? '');
    setDueDate(existing?.dueDate ?? '');
    setPriority(existing?.priority ?? 'high');
    setExpectedEvidence(existing?.expectedEvidence ?? '');
  }, [defaultOwner, existing, visible]);

  function handleSave() {
    if (!problem.trim() || !action.trim() || !owner.trim() || !dueDate.trim()) {
      Alert.alert('Campos obrigatórios', 'Preencha problema, ação, responsável e prazo.');
      return;
    }
    onSave({ problem: problem.trim(), rootCause: rootCause.trim(), action: action.trim(), owner: owner.trim(), dueDate: dueDate.trim(), priority, expectedEvidence: expectedEvidence.trim() });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{existing ? 'Editar plano de ação' : 'Novo plano de ação'}</Text>
            <Text style={styles.subtitle}>Registre a correção exigida para a não conformidade.</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.close}>Fechar</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Problema identificado *" value={problem} onChangeText={setProblem} multiline />
          <Field label="Causa raiz" value={rootCause} onChangeText={setRootCause} multiline />
          <Field label="Ação corretiva *" value={action} onChangeText={setAction} multiline />
          <Field label="Responsável *" value={owner} onChangeText={setOwner} />
          <Field label="Prazo * (AAAA-MM-DD)" value={dueDate} onChangeText={setDueDate} placeholder="2026-07-31" />
          <Text style={styles.label}>Prioridade</Text>
          <View style={styles.priorityRow}>
            {(['high', 'medium', 'low'] as const).map((item) => (
              <Pressable key={item} onPress={() => setPriority(item)} style={[styles.priority, priority === item && styles.priorityActive]}>
                <Text style={[styles.priorityText, priority === item && styles.priorityTextActive]}>{item === 'high' ? 'Alta' : item === 'medium' ? 'Média' : 'Baixa'}</Text>
              </Pressable>
            ))}
          </View>
          <Field label="Evidência esperada" value={expectedEvidence} onChangeText={setExpectedEvidence} multiline />
          <AppButton title="Salvar plano de ação" onPress={handleSave} style={styles.save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChangeText, multiline, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.neutral}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  title: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: 12, marginTop: 4, maxWidth: 260 },
  close: { color: colors.primary, fontWeight: '700', paddingTop: 4 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  field: { marginBottom: spacing.lg },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 14 },
  multiline: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  priority: { flex: 1, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  priorityActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  priorityText: { color: colors.inkMuted, fontWeight: '700' },
  priorityTextActive: { color: colors.primary },
  save: { marginTop: spacing.sm },
});
