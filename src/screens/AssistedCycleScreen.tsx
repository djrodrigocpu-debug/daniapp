/**
 * GESTÃO ASSISTIDA SEMANAL — tela operacional do Gerente de Canal.
 *
 * O fluxo do Modelo Operacional §2.1, sem etapa oculta:
 *
 *   1. o GC consulta o RELATÓRIO OFICIAL DA OPERAÇÃO (fonte externa);
 *   2. abre a semana aqui — o servidor garante um ciclo só;
 *   3. informa, por indicador, o resultado, o período da fonte e a data da
 *      consulta;
 *   4. o AAPEx CALCULA o status contra a meta que a região configurou;
 *   5. onde houver desvio, registra diagnóstico e plano com responsável e prazo;
 *   6. conclui — e a regra fica materializada.
 *
 * QUATRO COISAS QUE A TELA PRECISA DEIXAR CLARAS (escopo §25), e que estão
 * escritas nela, não só neste comentário:
 *   · o resultado foi consultado FORA do AAPEx;
 *   · a meta já estava configurada — o GC não a edita;
 *   · o status foi calculado pelo servidor;
 *   · plano é obrigatório quando há desvio.
 *
 * ACESSIBILIDADE. Todo controle é `Pressable` com `accessibilityRole`; nenhum
 * status é comunicado só por cor (há sempre a palavra e um ícone); erros de
 * campo são associados ao campo por `accessibilityLabel`; e a ordem de leitura
 * segue a ordem visual. Os achados O-12 e O-13 nasceram de controles sem
 * semântica de botão — o padrão não se repete aqui.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { SectionTitle } from '../components/SectionTitle';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import {
  AssistedCycle,
  AssistedEntry,
  AssistedIndicatorStatus,
} from '../domain/assisted/types';
import {
  closeBlocks,
  countByStatus,
  describeCloseBlock,
  describeStatus,
  describeWeek,
  groupByTheme,
  isDeviation,
  parseActual,
  todayInBusinessTimezone,
  validateEntryPatch,
  weekStartOf,
} from '../domain/assisted/policy';
import { decideAssistedScreenState } from '../domain/assisted/screenState';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AssistedCycle'>;

/** Cor E ícone E palavra. Nunca só cor (§25). */
const STATUS_VISUAL: Record<AssistedIndicatorStatus, { color: string; soft: string; icon: keyof typeof Ionicons.glyphMap }> = {
  conforme: { color: colors.success, soft: colors.successSoft, icon: 'checkmark-circle-outline' },
  atencao: { color: colors.warning, soft: colors.warningSoft, icon: 'alert-circle-outline' },
  nao_conforme: { color: colors.danger, soft: colors.dangerSoft, icon: 'close-circle-outline' },
  sem_dado: { color: colors.inkMuted, soft: colors.background, icon: 'help-circle-outline' },
};

export function AssistedCycleScreen({ route, navigation }: Props) {
  const { operationId } = route.params;
  const { assisted } = useRepositories();

  const [weekStartDate, setWeekStartDate] = useState(() =>
    weekStartOf(route.params.weekStartDate ?? todayInBusinessTimezone()));
  const [cycle, setCycle] = useState<AssistedCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Erro da ÚLTIMA ação (salvar, plano, concluir) — separado do erro de carga. */
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const res = await assisted.getCycle(operationId, weekStartDate);
    if (res.ok) setCycle(res.value);
    else { setCycle(null); setErrorMessage(res.error.message); }
    setLoading(false);
  }, [assisted, operationId, weekStartDate]);

  useEffect(() => { void load(); }, [load]);

  const state = useMemo(
    () => decideAssistedScreenState({ loading, errorMessage, cycle }),
    [loading, errorMessage, cycle],
  );

  /**
   * Abrir é IDEMPOTENTE no servidor. Se outra sessão abriu a mesma semana entre
   * a leitura e o clique, o servidor devolve o MESMO ciclo — não há conflito a
   * resolver aqui, e é por isso que este botão não precisa de confirmação.
   */
  async function open() {
    setBusy(true);
    setActionError(null);
    const res = await assisted.openCycle(operationId, weekStartDate);
    if (res.ok) setCycle(res.value);
    else setActionError(res.error.message);
    setBusy(false);
  }

  async function close(current: AssistedCycle) {
    setBusy(true);
    setActionError(null);
    const res = await assisted.closeCycle(current.id);
    if (res.ok) setCycle(res.value);
    else { setActionError(res.error.message); await load(); }
    setBusy(false);
  }

  function shiftWeek(days: number) {
    const at = new Date(`${weekStartDate}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + days);
    setWeekStartDate(at.toISOString().slice(0, 10));
  }

  const header = (
    <View style={styles.weekBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Semana anterior"
        onPress={() => shiftWeek(-7)}
        style={styles.weekNav}
      >
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
      </Pressable>
      <View style={styles.weekLabel}>
        <Text style={styles.weekCaption}>Semana</Text>
        <Text style={styles.weekValue} accessibilityRole="header">{describeWeek(weekStartDate)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Próxima semana"
        onPress={() => shiftWeek(7)}
        style={styles.weekNav}
      >
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
      </Pressable>
    </View>
  );

  if (state.kind === 'loading') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centeredText}>Carregando a semana…</Text>
        </View>
      </Screen>
    );
  }

  if (state.kind === 'unavailable' || state.kind === 'unauthorized' || state.kind === 'error') {
    const visual = {
      unavailable: { icon: 'cube-outline' as const, title: 'Gestão Assistida indisponível neste ambiente' },
      unauthorized: { icon: 'lock-closed-outline' as const, title: 'Sem permissão para este parceiro' },
      error: { icon: 'cloud-offline-outline' as const, title: 'Não foi possível carregar a semana' },
    }[state.kind];
    return (
      <Screen>
        {header}
        <View style={styles.noticeCard} accessibilityRole="alert">
          <Ionicons name={visual.icon} size={26} color={colors.inkMuted} />
          <Text style={styles.noticeTitle}>{visual.title}</Text>
          <Text style={styles.noticeBody}>{state.message}</Text>
        </View>
        {state.kind === 'error' && <AppButton title="Tentar novamente" onPress={() => void load()} />}
      </Screen>
    );
  }

  if (state.kind === 'not-opened') {
    return (
      <Screen>
        {header}
        <View style={styles.noticeCard}>
          <Ionicons name="calendar-outline" size={26} color={colors.primary} />
          <Text style={styles.noticeTitle}>Semana ainda não iniciada</Text>
          <Text style={styles.noticeBody}>
            Consulte os resultados no relatório oficial da operação e abra a semana para registrá-los.
            O AAPEx não busca esses números — ele os registra, compara e acompanha.
          </Text>
        </View>
        {actionError && <ActionError message={actionError} />}
        <AppButton title="Abrir semana" onPress={() => void open()} loading={busy} />
      </Screen>
    );
  }

  if (state.kind === 'no-catalog') {
    return (
      <Screen>
        {header}
        <View style={styles.noticeCard} accessibilityRole="alert">
          <Ionicons name="file-tray-outline" size={26} color={colors.inkMuted} />
          <Text style={styles.noticeTitle}>Nenhum indicador aplicável</Text>
          <Text style={styles.noticeBody}>
            A região deste parceiro ainda não publicou nenhuma configuração de indicador para a
            Gestão Assistida. A adoção é decisão da região — existir no catálogo não ativa nada.
          </Text>
        </View>
      </Screen>
    );
  }

  const current = state.cycle;
  const readOnly = state.kind === 'closed';
  const groups = groupByTheme(current.entries);
  const counts = countByStatus(current.entries);
  const blocks = closeBlocks(current);

  return (
    <Screen>
      {header}

      <View style={styles.summaryCard}>
        <Text style={styles.partner}>{current.partnerName}</Text>
        <View style={styles.cycleStateRow}>
          <Ionicons
            name={readOnly ? 'lock-closed-outline' : 'create-outline'}
            size={14}
            color={readOnly ? colors.success : colors.info}
          />
          <Text style={[styles.cycleState, { color: readOnly ? colors.success : colors.info }]}>
            {readOnly ? 'Concluída' : 'Em preenchimento'}
          </Text>
        </View>
        <View style={styles.countRow}>
          {(Object.keys(counts) as AssistedIndicatorStatus[]).map((s) => (
            <View key={s} style={styles.countChip} accessibilityLabel={`${describeStatus(s)}: ${counts[s]}`}>
              <Ionicons name={STATUS_VISUAL[s].icon} size={13} color={STATUS_VISUAL[s].color} />
              <Text style={styles.countValue}>{counts[s]}</Text>
              <Text style={styles.countLabel}>{describeStatus(s)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.sourceNote}>
          Os resultados são consultados no <Text style={styles.strong}>relatório oficial da operação</Text> e
          informados aqui. As metas já estão configuradas pela região e não são editáveis nesta tela.
          O status é calculado pelo AAPEx.
        </Text>
      </View>

      {actionError && <ActionError message={actionError} />}

      {groups.map((group) => (
        <View key={group.themeId}>
          <SectionTitle title={group.themeName} subtitle={`${group.entries.length} indicador(es)`} />
          {group.entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              readOnly={readOnly}
              operationId={operationId}
              onChanged={(updated) => setCycle((c) => (c ? {
                ...c,
                entries: c.entries.map((e) => (e.id === updated.id ? updated : e)),
              } : c))}
              onPlanSaved={() => void load()}
              onError={setActionError}
            />
          ))}
        </View>
      ))}

      {!readOnly && (
        <View style={styles.closeBlock}>
          {blocks.length > 0 && (
            <View style={styles.blockList} accessibilityRole="alert">
              <Text style={styles.blockTitle}>Para concluir a semana, ainda falta:</Text>
              {blocks.map((b, i) => (
                <Text key={`${b.reason}-${i}`} style={styles.blockItem}>• {describeCloseBlock(b)}</Text>
              ))}
            </View>
          )}
          <AppButton
            title="Concluir semana"
            onPress={() => void close(current)}
            loading={busy}
            disabled={blocks.length > 0}
          />
        </View>
      )}

      {readOnly && (
        <View style={styles.closedNote}>
          <Text style={styles.closedNoteText}>
            Semana concluída{current.closedAt ? ` em ${current.closedAt.slice(0, 10).split('-').reverse().join('/')}` : ''}.
            Os valores e o status ficaram materializados: alterar a meta depois disso não reescreve
            este registro. Os planos de ação continuam evoluindo em Planos.
          </Text>
        </View>
      )}

      <AppButton
        title="Ver planos de ação"
        variant="secondary"
        onPress={() => navigation.navigate('Main')}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <View style={styles.actionError} accessibilityRole="alert">
      <Ionicons name="warning-outline" size={16} color={colors.danger} />
      <Text style={styles.actionErrorText}>{message}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Um indicador
// ---------------------------------------------------------------------------

interface EntryCardProps {
  entry: AssistedEntry;
  readOnly: boolean;
  operationId: string;
  onChanged: (entry: AssistedEntry) => void;
  onPlanSaved: () => void;
  onError: (message: string) => void;
}

function EntryCard({ entry, readOnly, operationId, onChanged, onPlanSaved, onError }: EntryCardProps) {
  const { assisted } = useRepositories();
  const [actual, setActual] = useState(entry.actual === null ? '' : String(entry.actual));
  const [period, setPeriod] = useState(entry.source.period);
  const [consultedAt, setConsultedAt] = useState(entry.source.consultedAt ?? '');
  const [reference, setReference] = useState(entry.source.reference);
  const [observation, setObservation] = useState(entry.observation);
  const [diagnosis, setDiagnosis] = useState(entry.diagnosis);
  const [saving, setSaving] = useState(false);

  const [planAction, setPlanAction] = useState(entry.plan?.action ?? '');
  const [planOwner, setPlanOwner] = useState(entry.plan?.owner ?? '');
  const [planDue, setPlanDue] = useState(entry.plan?.dueDate ?? '');
  const [savingPlan, setSavingPlan] = useState(false);

  const fieldErrors = validateEntryPatch({ actual, sourcePeriod: period, sourceConsultedAt: consultedAt });
  const errorFor = (field: 'actual' | 'sourcePeriod' | 'sourceConsultedAt') =>
    fieldErrors.find((e) => e.field === field)?.message ?? null;

  const visual = STATUS_VISUAL[entry.status];
  const deviation = isDeviation(entry.status);

  async function save() {
    if (fieldErrors.length > 0) return;
    setSaving(true);
    const res = await assisted.saveEntry(entry.id, {
      actual: parseActual(actual),
      sourcePeriod: period,
      sourceConsultedAt: consultedAt === '' ? null : consultedAt,
      sourceReference: reference,
      observation,
      diagnosis,
    });
    if (res.ok) onChanged(res.value);
    else onError(res.error.message);
    setSaving(false);
  }

  async function savePlan() {
    setSavingPlan(true);
    const res = await assisted.savePlan(operationId, entry.id, {
      ...(entry.plan ? { id: entry.plan.id } : {}),
      action: planAction,
      problem: diagnosis,
      owner: planOwner,
      dueDate: planDue,
      priority: entry.status === 'nao_conforme' ? 'high' : 'medium',
    });
    if (res.ok) onPlanSaved();
    else onError(res.error.message);
    setSavingPlan(false);
  }

  const planIncomplete = planAction.trim() === '' || planOwner.trim() === '' || planDue.trim() === '';

  return (
    <View style={styles.entryCard}>
      <View style={styles.entryTop}>
        <View style={styles.entryIdentity}>
          <Text style={styles.entryCode}>{entry.indicatorCode}</Text>
          <Text style={styles.entryName}>{entry.indicatorName}</Text>
        </View>
        <View
          style={[styles.statusPill, { backgroundColor: visual.soft, borderColor: visual.color }]}
          accessibilityLabel={`Status calculado: ${describeStatus(entry.status)}`}
        >
          <Ionicons name={visual.icon} size={14} color={visual.color} />
          <Text style={[styles.statusText, { color: visual.color }]}>{describeStatus(entry.status)}</Text>
        </View>
      </View>

      <View style={styles.ruleRow}>
        <RuleChip label="Meta" value={`${entry.rule.target}${entry.rule.unit}`} />
        <RuleChip label="Tolerância" value={`${entry.rule.tolerance}${entry.rule.unit}`} />
        <RuleChip
          label="Orientação"
          value={entry.rule.direction === 'higher_better' ? 'Maior é melhor' : 'Menor é melhor'}
        />
      </View>
      {entry.rule.orientation !== '' && <Text style={styles.orientation}>{entry.rule.orientation}</Text>}

      {readOnly ? (
        <View style={styles.readOnlyBlock}>
          <ReadRow label="Resultado informado" value={entry.actual === null ? 'Sem dado' : `${entry.actual}${entry.rule.unit}`} />
          <ReadRow label="Período da fonte" value={entry.source.period || '—'} />
          <ReadRow label="Data da consulta" value={entry.source.consultedAt ?? '—'} />
          {entry.source.reference !== '' && <ReadRow label="Referência" value={entry.source.reference} />}
          {entry.observation !== '' && <ReadRow label="Observação" value={entry.observation} />}
          {entry.diagnosis !== '' && <ReadRow label="Diagnóstico" value={entry.diagnosis} />}
        </View>
      ) : (
        <>
          <Field
            label="Resultado consultado"
            hint="Número lido no relatório oficial da operação."
            value={actual}
            onChangeText={setActual}
            keyboardType="numeric"
            error={errorFor('actual')}
          />
          <Field
            label="Período da fonte"
            hint="A que período o número se refere, como a fonte o nomeia."
            value={period}
            onChangeText={setPeriod}
            error={errorFor('sourcePeriod')}
          />
          <Field
            label="Data da consulta"
            hint="AAAA-MM-DD"
            value={consultedAt}
            onChangeText={setConsultedAt}
            error={errorFor('sourceConsultedAt')}
          />
          <Field label="Referência (opcional)" value={reference} onChangeText={setReference} />
          <Field label="Observação (opcional)" value={observation} onChangeText={setObservation} multiline />
          <Field
            label={deviation ? 'Diagnóstico (obrigatório)' : 'Diagnóstico (opcional)'}
            hint={deviation ? 'O desvio exige diagnóstico para concluir a semana.' : undefined}
            value={diagnosis}
            onChangeText={setDiagnosis}
            multiline
          />
          <AppButton
            title="Salvar rascunho"
            variant="secondary"
            compact
            onPress={() => void save()}
            loading={saving}
            disabled={fieldErrors.length > 0}
          />
        </>
      )}

      {deviation && (
        <View style={styles.planBlock}>
          <Text style={styles.planTitle}>Plano de ação</Text>
          <Text style={styles.planHint}>
            {entry.plan
              ? 'Registrado no motor de planos. Acompanhe a evolução em Planos.'
              : 'Obrigatório neste indicador: há desvio em relação à meta.'}
          </Text>
          {readOnly ? (
            entry.plan ? (
              <View style={styles.readOnlyBlock}>
                <ReadRow label="Ação" value={entry.plan.action} />
                <ReadRow label="Responsável" value={entry.plan.owner} />
                <ReadRow label="Prazo" value={entry.plan.dueDate} />
                <ReadRow label="Situação atual" value={entry.plan.status} />
              </View>
            ) : <Text style={styles.planHint}>Sem plano registrado.</Text>
          ) : (
            <>
              <Field label="Ação" value={planAction} onChangeText={setPlanAction} multiline />
              <Field label="Responsável" value={planOwner} onChangeText={setPlanOwner} />
              <Field label="Prazo" hint="AAAA-MM-DD" value={planDue} onChangeText={setPlanDue} />
              <AppButton
                title={entry.plan ? 'Atualizar plano' : 'Criar plano'}
                compact
                onPress={() => void savePlan()}
                loading={savingPlan}
                disabled={planIncomplete}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function RuleChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.ruleChip} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={styles.ruleValue}>{value}</Text>
    </View>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readRow}>
      <Text style={styles.readLabel}>{label}</Text>
      <Text style={styles.readValue}>{value}</Text>
    </View>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}

/**
 * O erro entra no `accessibilityLabel` do PRÓPRIO campo, e não só como texto
 * abaixo dele: um leitor de tela que pousa no input precisa ouvir o que está
 * errado sem ter de procurar o parágrafo seguinte.
 */
function Field({ label, hint, value, onChangeText, error, multiline, keyboardType }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
        accessibilityLabel={error ? `${label}. Erro: ${error}` : label}
        accessibilityHint={hint}
        placeholderTextColor={colors.neutral}
      />
      {error && <Text style={styles.fieldError} accessibilityRole="alert">{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  centeredText: { color: colors.inkMuted, fontSize: 13, textAlign: 'center' },

  weekBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.md,
  },
  weekNav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  weekLabel: { flex: 1, alignItems: 'center' },
  weekCaption: { color: colors.inkMuted, fontSize: 10 },
  weekValue: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },

  noticeCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md,
  },
  noticeTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  noticeBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },

  summaryCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
  },
  partner: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  cycleStateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cycleState: { fontSize: 11, fontWeight: '800' },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  countChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.background, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
  },
  countValue: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  countLabel: { color: colors.inkMuted, fontSize: 10 },
  sourceNote: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  strong: { color: colors.ink, fontWeight: '800' },

  actionError: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  actionErrorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17 },

  entryCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
  },
  entryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  entryIdentity: { flex: 1 },
  entryCode: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  entryName: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '800' },

  ruleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  ruleChip: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  ruleLabel: { color: colors.inkMuted, fontSize: 9 },
  ruleValue: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 1 },
  orientation: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },

  field: { marginTop: spacing.md },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  fieldHint: { color: colors.inkMuted, fontSize: 10, marginTop: 2 },
  input: {
    minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: 6,
    color: colors.ink, fontSize: 14, backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 11, marginTop: 4 },

  readOnlyBlock: { marginTop: spacing.md, gap: spacing.sm },
  readRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  readLabel: { color: colors.inkMuted, fontSize: 11, minWidth: 130 },
  readValue: { color: colors.ink, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  planBlock: {
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  planTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  planHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },

  closeBlock: { marginTop: spacing.lg },
  blockList: {
    backgroundColor: colors.warningSoft, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  blockTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  blockItem: { color: colors.ink, fontSize: 11, lineHeight: 17 },

  closedNote: {
    backgroundColor: colors.successSoft, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.lg,
  },
  closedNoteText: { color: colors.ink, fontSize: 11, lineHeight: 17 },
});
