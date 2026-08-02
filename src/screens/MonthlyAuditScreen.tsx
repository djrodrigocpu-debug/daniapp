/**
 * AUDITORIA MENSAL POR COMPETÊNCIA — tela operacional.
 *
 * O fluxo do Modelo Operacional §3.2, sem etapa oculta:
 *
 *   1. escolher a competência — inclusive uma passada;
 *   2. iniciar: o servidor materializa os critérios da região e congela;
 *   3. responder cada critério: conforme, não conforme ou não aplicável;
 *   4. anexar evidência onde o critério exigir;
 *   5. onde houver não conformidade, diagnóstico e plano com responsável e prazo;
 *   6. enviar para validação;
 *   7. quem valida aprova ou devolve;
 *   8. aprovada, a auditoria vira snapshot oficial imutável.
 *
 * A PERGUNTA QUE ESTA TELA FAZ é diferente da Gestão Assistida: não *"qual foi o
 * número?"*, e sim *"o processo que sustenta o número existe, está implantado e
 * é executado?"*. O texto da tela precisa dizer isso — senão o operador
 * responde a pergunta errada.
 *
 * ACESSIBILIDADE. Todo controle é `Pressable` com `accessibilityRole`; nenhum
 * status é comunicado só por cor; erros de campo entram no rótulo do próprio
 * campo; e a ordem de leitura segue a ordem visual. Os achados O-12 e O-13
 * nasceram de controles sem semântica de botão — o padrão não se repete.
 *
 * O-12: a auditoria APROVADA é alcançável, e a ação "Ver auditoria" leva ao
 * conteúdo oficial — snapshot, critérios, respostas, evidências, planos,
 * aprovador e competência.
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
  CriterionAnswerStatus,
  MaterializedCriterion,
  MonthlyAudit,
} from '../domain/monthlyAudit/types';
import {
  canSubmit,
  countByAnswerStatus,
  currentCompetence,
  describeAnswerStatus,
  describeAuditStatus,
  describeCompetence,
  describeSubmitBlock,
  groupByIndicator,
  isEditable,
  shiftCompetence,
  submitBlocks,
  validateAnswer,
} from '../domain/monthlyAudit/policy';
import { decideMonthlyScreenState } from '../domain/monthlyAudit/screenState';
import {
  exportarRelatorioMensal, motivoDoErroMensal, MENSAGENS_MENSAL,
} from '../domain/report/exportarRelatorioMensal';
import { renderMonthlyAuditReportPdf } from '../domain/report/pdf/renderMonthlyAuditReport';
import { entregarPdf } from '../utils/entregarPdf';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MonthlyAudit'>;

/** Cor E ícone E palavra. Nunca só cor. */
const STATUS_VISUAL: Record<
  CriterionAnswerStatus,
  { color: string; soft: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  conforme: { color: colors.success, soft: colors.successSoft, icon: 'checkmark-circle-outline' },
  nao_conforme: { color: colors.danger, soft: colors.dangerSoft, icon: 'close-circle-outline' },
  nao_aplicavel: { color: colors.info, soft: colors.infoSoft, icon: 'remove-circle-outline' },
  nao_avaliado: { color: colors.inkMuted, soft: colors.background, icon: 'ellipse-outline' },
};

const ORDEM_RESPOSTA: CriterionAnswerStatus[] = ['conforme', 'nao_conforme', 'nao_aplicavel'];

export function MonthlyAuditScreen({ route }: Props) {
  const { operationId } = route.params;
  const { monthlyAudit } = useRepositories();

  const [competence, setCompetence] = useState(
    () => route.params.competence ?? currentCompetence(),
  );
  const [audit, setAudit] = useState<MonthlyAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Erro da ÚLTIMA ação — separado do erro de carga. */
  const [actionError, setActionError] = useState<string | null>(null);
  /** Confirmação da exportação. Sucesso também precisa ser anunciado. */
  const [exportOk, setExportOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const res = await monthlyAudit.getAudit(operationId, competence);
    if (res.ok) setAudit(res.value);
    else { setAudit(null); setErrorMessage(res.error.message); }
    setLoading(false);
  }, [monthlyAudit, operationId, competence]);

  useEffect(() => { void load(); }, [load]);

  const state = useMemo(
    () => decideMonthlyScreenState({ loading, errorMessage, audit }),
    [loading, errorMessage, audit],
  );

  async function start() {
    setBusy(true);
    setActionError(null);
    const res = await monthlyAudit.startAudit(operationId, competence);
    if (res.ok) setAudit(res.value);
    else setActionError(res.error.message);
    setBusy(false);
  }

  /**
   * O PDF do Relatório Oficial da Auditoria Mensal.
   *
   * A ORDEM vive no domínio puro (`exportarRelatorioMensal`); aqui só se ligam
   * as peças. A recusa do servidor é TRADUZIDA em causa — nunca repassada crua,
   * porque ela pode carregar nome de função ou identificador.
   */
  async function exportarPdf(current: MonthlyAudit) {
    setBusy(true);
    setActionError(null);
    setExportOk(null);
    const r = await exportarRelatorioMensal({
      obterDados: async () => {
        const res = await monthlyAudit.getReportData(current.id);
        return res.ok
          ? { ok: true as const, value: res.value }
          : (() => {
            const motivo = motivoDoErroMensal(res.error.message);
            return { ok: false as const, motivo, message: MENSAGENS_MENSAL[motivo] };
          })();
      },
      renderizar: (modelo) => renderMonthlyAuditReportPdf(modelo),
      entregar: entregarPdf(),
      registrar: (dados) => monthlyAudit.logReportExport(dados),
    });
    if (r.ok) {
      setExportOk(
        `Relatório gerado: ${r.fileName}.`
        + (r.registrado ? '' : ' O documento saiu, mas a trilha não registrou a exportação.'),
      );
    } else {
      setActionError(r.message);
    }
    setBusy(false);
  }

  async function submit(current: MonthlyAudit) {
    setBusy(true);
    setActionError(null);
    const res = await monthlyAudit.submitAudit(current.id);
    if (res.ok) setAudit(res.value);
    else { setActionError(res.error.message); await load(); }
    setBusy(false);
  }

  const header = (
    <View style={styles.competenceBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Competência anterior"
        onPress={() => setCompetence((c) => shiftCompetence(c, -1))}
        style={styles.competenceNav}
      >
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
      </Pressable>
      <View style={styles.competenceLabel}>
        <Text style={styles.competenceCaption}>Competência</Text>
        <Text style={styles.competenceValue} accessibilityRole="header">
          {describeCompetence(competence)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Próxima competência"
        onPress={() => setCompetence((c) => shiftCompetence(c, 1))}
        style={styles.competenceNav}
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
          <Text style={styles.centeredText}>Carregando a competência…</Text>
        </View>
      </Screen>
    );
  }

  if (state.kind === 'unavailable' || state.kind === 'unauthorized' || state.kind === 'error') {
    const visual = {
      unavailable: { icon: 'cube-outline' as const, title: 'Auditoria Mensal indisponível neste ambiente' },
      unauthorized: { icon: 'lock-closed-outline' as const, title: 'Sem permissão para este parceiro' },
      error: { icon: 'cloud-offline-outline' as const, title: 'Não foi possível carregar a competência' },
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

  if (state.kind === 'not-started') {
    return (
      <Screen>
        {header}
        <View style={styles.noticeCard}>
          <Ionicons name="clipboard-outline" size={26} color={colors.primary} />
          <Text style={styles.noticeTitle}>Competência ainda não iniciada</Text>
          <Text style={styles.noticeBody}>
            A Auditoria Mensal verifica se o processo que sustenta o resultado existe, está
            implantado e é executado. Ao iniciar, os critérios vigentes da região são copiados para
            esta competência e não mudam mais, mesmo que o catálogo mude depois.
          </Text>
        </View>
        {actionError && <ActionError message={actionError} />}
        <AppButton title="Iniciar auditoria da competência" onPress={() => void start()} loading={busy} />
      </Screen>
    );
  }

  if (state.kind === 'no-criteria') {
    return (
      <Screen>
        {header}
        <View style={styles.noticeCard} accessibilityRole="alert">
          <Ionicons name="file-tray-outline" size={26} color={colors.inkMuted} />
          <Text style={styles.noticeTitle}>Nenhum critério aplicável</Text>
          <Text style={styles.noticeBody}>
            A região deste parceiro ainda não publicou nenhum indicador com critérios de processo
            para a Auditoria Mensal. A adoção é decisão da região — existir no catálogo não ativa
            nada.
          </Text>
        </View>
      </Screen>
    );
  }

  const current = state.audit;
  const readOnly = !isEditable(current);
  const approved = state.kind === 'approved';
  const groups = groupByIndicator(current.criteria);
  const counts = countByAnswerStatus(current.criteria);
  const blocks = submitBlocks(current);

  return (
    <Screen>
      {header}

      <View style={styles.summaryCard}>
        <Text style={styles.partner}>{current.partnerName}</Text>
        <View style={styles.auditStateRow}>
          <Ionicons
            name={approved ? 'shield-checkmark-outline' : readOnly ? 'paper-plane-outline' : 'create-outline'}
            size={14}
            color={approved ? colors.success : readOnly ? colors.info : colors.warning}
          />
          <Text
            style={[styles.auditState, {
              color: approved ? colors.success : readOnly ? colors.info : colors.warning,
            }]}
          >
            {describeAuditStatus(current.status)}
          </Text>
        </View>
        <View style={styles.countRow}>
          {(Object.keys(counts) as CriterionAnswerStatus[]).map((s) => (
            <View key={s} style={styles.countChip} accessibilityLabel={`${describeAnswerStatus(s)}: ${counts[s]}`}>
              <Ionicons name={STATUS_VISUAL[s].icon} size={13} color={STATUS_VISUAL[s].color} />
              <Text style={styles.countValue}>{counts[s]}</Text>
              <Text style={styles.countLabel}>{describeAnswerStatus(s)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.processNote}>
          A Auditoria Mensal pergunta se o <Text style={styles.strong}>processo</Text> existe, está
          implantado e é executado — não qual foi o número. Os critérios foram copiados no início da
          competência e não mudam com o catálogo.
        </Text>
        {approved && (
          <Text style={styles.scoreNote}>
            Conformidade: <Text style={styles.strong}>{current.score}%</Text> — proporção simples,
            sem ponderação. A regra de pontuação definitiva ainda não foi decidida.
          </Text>
        )}
      </View>

      {actionError && <ActionError message={actionError} />}

      {groups.map((group) => (
        <View key={`${group.themeId}-${group.indicatorCode}`}>
          <SectionTitle
            title={`${group.indicatorName}`}
            subtitle={`${group.themeName} · ${group.criteria.length} critério(s)`}
          />
          {group.criteria.map((criterion) => (
            <CriterionCard
              key={criterion.id}
              criterion={criterion}
              readOnly={readOnly}
              operationId={operationId}
              evaluationId={current.id}
              onChanged={(updated) => setAudit((a) => (a ? {
                ...a,
                criteria: a.criteria.map((c) => (c.id === updated.id ? updated : c)),
              } : a))}
              onReload={() => void load()}
              onError={setActionError}
            />
          ))}
        </View>
      ))}

      {!readOnly && (
        <View style={styles.submitBlock}>
          {blocks.length > 0 && (
            <View style={styles.blockList} accessibilityRole="alert">
              <Text style={styles.blockTitle}>Para enviar a auditoria, ainda falta:</Text>
              {blocks.map((b, i) => (
                <Text key={`${b.reason}-${i}`} style={styles.blockItem}>• {describeSubmitBlock(b)}</Text>
              ))}
            </View>
          )}
          <AppButton
            title="Enviar para validação"
            onPress={() => void submit(current)}
            loading={busy}
            disabled={!canSubmit(current)}
          />
        </View>
      )}

      {readOnly && !approved && (
        <View style={styles.closedNote}>
          <Text style={styles.closedNoteText}>
            Auditoria enviada em {(current.submittedAt ?? '').slice(0, 10).split('-').reverse().join('/')}.
            Enquanto aguarda validação, o conteúdo fica somente leitura. Se for devolvida, ela reabre
            para correção.
          </Text>
        </View>
      )}

      {approved && (
        <View style={styles.approvedNote}>
          <Text style={styles.closedNoteText}>
            Aprovada por {current.validatorName ?? '—'}. O conteúdo virou snapshot oficial imutável:
            alterar o catálogo depois não reescreve este registro. Os planos de ação continuam
            evoluindo em Planos.
          </Text>
          {current.validatorNote !== '' && (
            <Text style={styles.validatorNote}>Parecer: {current.validatorNote}</Text>
          )}
          {/*
            O BOTÃO SÓ EXISTE AQUI, dentro de `approved`. Auditoria em rascunho,
            enviada ou devolvida NÃO oferece PDF — e o servidor recusaria de
            qualquer forma (0051). A interface espelha a regra para não oferecer
            o que será negado; ela não é a barreira.

            Este é o documento produzido pelo AAPEx. NÃO confundir com o
            "relatório oficial da operação", que é a fonte EXTERNA consultada
            pelo Gerente de Canal antes da visita (terminologia D8).
          */}
          <View style={styles.pdfBlock}>
            <Text style={styles.pdfTitle}>Relatório Oficial da Auditoria Mensal</Text>
            <Text style={styles.pdfHint}>
              Documento em PDF gerado a partir do snapshot oficial imutável, no formato 1.3.5.
              O conteúdo não muda se o catálogo, o critério ou o plano mudarem depois.
            </Text>
            <AppButton
              title="Gerar Relatório Oficial da Auditoria Mensal"
              onPress={() => void exportarPdf(current)}
              loading={busy}
              disabled={busy}
            />
            {exportOk !== null && (
              <Text
                style={styles.pdfOk}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {exportOk}
              </Text>
            )}
          </View>
        </View>
      )}
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
// Um critério
// ---------------------------------------------------------------------------

interface CriterionCardProps {
  criterion: MaterializedCriterion;
  readOnly: boolean;
  operationId: string;
  evaluationId: string;
  onChanged: (criterion: MaterializedCriterion) => void;
  onReload: () => void;
  onError: (message: string) => void;
}

function CriterionCard({
  criterion, readOnly, operationId, evaluationId, onChanged, onReload, onError,
}: CriterionCardProps) {
  const { monthlyAudit } = useRepositories();
  const [status, setStatus] = useState<CriterionAnswerStatus>(criterion.answer.status);
  const [justification, setJustification] = useState(criterion.answer.justification);
  const [observation, setObservation] = useState(criterion.answer.observation);
  const [diagnosis, setDiagnosis] = useState(criterion.answer.diagnosis);
  const [saving, setSaving] = useState(false);

  const [planAction, setPlanAction] = useState('');
  const [planOwner, setPlanOwner] = useState('');
  const [planDue, setPlanDue] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const fieldErrors = validateAnswer(criterion, { status, justification });
  const errorFor = (field: 'status' | 'justification') =>
    fieldErrors.find((e) => e.field === field)?.message ?? null;

  const visual = STATUS_VISUAL[criterion.answer.status];
  const naoConforme = criterion.answer.status === 'nao_conforme';

  async function save() {
    if (fieldErrors.length > 0) return;
    setSaving(true);
    const res = await monthlyAudit.saveAnswer(criterion.answer.id, {
      status, justification, observation, diagnosis,
    });
    if (res.ok) onChanged(res.value);
    else onError(res.error.message);
    setSaving(false);
  }

  async function savePlan() {
    setSavingPlan(true);
    const res = await monthlyAudit.savePlan(operationId, evaluationId, criterion.answer.id, {
      action: planAction, problem: diagnosis, owner: planOwner, dueDate: planDue, priority: 'high',
    });
    if (res.ok) { setPlanAction(''); setPlanOwner(''); setPlanDue(''); onReload(); }
    else onError(res.error.message);
    setSavingPlan(false);
  }

  const planIncomplete = planAction.trim() === '' || planOwner.trim() === '' || planDue.trim() === '';

  return (
    <View style={styles.criterionCard}>
      <View style={styles.criterionTop}>
        <View style={styles.criterionIdentity}>
          <Text style={styles.criterionCode}>{criterion.criterionCode}</Text>
          <Text style={styles.criterionQuestion}>{criterion.question}</Text>
        </View>
        <View
          style={[styles.statusPill, { backgroundColor: visual.soft, borderColor: visual.color }]}
          accessibilityLabel={`Resposta registrada: ${describeAnswerStatus(criterion.answer.status)}`}
        >
          <Ionicons name={visual.icon} size={14} color={visual.color} />
          <Text style={[styles.statusText, { color: visual.color }]}>
            {describeAnswerStatus(criterion.answer.status)}
          </Text>
        </View>
      </View>

      {criterion.guidance !== '' && (
        <Text style={styles.guidance} accessibilityLabel={`Orientação: ${criterion.guidance}`}>
          {criterion.guidance}
        </Text>
      )}
      <View style={styles.flagRow}>
        {criterion.required && <Flag label="Obrigatório" />}
        {criterion.evidenceRequired && <Flag label="Exige evidência" />}
        {criterion.allowsNa && <Flag label="Admite N/A" />}
        {criterion.requiresJustification && <Flag label="N/A exige justificativa" />}
      </View>

      {readOnly ? (
        <View style={styles.readOnlyBlock}>
          {criterion.answer.justification !== '' && (
            <ReadRow label="Justificativa" value={criterion.answer.justification} />
          )}
          {criterion.answer.observation !== '' && (
            <ReadRow label="Observação" value={criterion.answer.observation} />
          )}
          {criterion.answer.diagnosis !== '' && (
            <ReadRow label="Diagnóstico" value={criterion.answer.diagnosis} />
          )}
        </View>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Resposta</Text>
          <View style={styles.choiceRow}>
            {ORDEM_RESPOSTA.map((s) => {
              const disabled = s === 'nao_aplicavel' && !criterion.allowsNa;
              const selected = status === s;
              return (
                <Pressable
                  key={s}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  accessibilityLabel={describeAnswerStatus(s)}
                  disabled={disabled}
                  onPress={() => setStatus(s)}
                  style={[
                    styles.choice,
                    selected && { borderColor: STATUS_VISUAL[s].color, backgroundColor: STATUS_VISUAL[s].soft },
                    disabled && styles.choiceDisabled,
                  ]}
                >
                  <Ionicons
                    name={STATUS_VISUAL[s].icon}
                    size={15}
                    color={disabled ? colors.neutral : STATUS_VISUAL[s].color}
                  />
                  <Text style={[styles.choiceText, disabled && { color: colors.neutral }]}>
                    {describeAnswerStatus(s)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errorFor('status') && (
            <Text style={styles.fieldError} accessibilityRole="alert">{errorFor('status')}</Text>
          )}

          {status === 'nao_aplicavel' && (
            <Field
              label={criterion.requiresJustification ? 'Justificativa (obrigatória)' : 'Justificativa'}
              hint="Diga por que este critério não se aplica a esta operação."
              value={justification}
              onChangeText={setJustification}
              error={errorFor('justification')}
              multiline
            />
          )}
          <Field label="Observação (opcional)" value={observation} onChangeText={setObservation} multiline />
          <Field
            label={status === 'nao_conforme' ? 'Diagnóstico (obrigatório)' : 'Diagnóstico (opcional)'}
            hint={status === 'nao_conforme' ? 'A não conformidade exige diagnóstico para enviar.' : undefined}
            value={diagnosis}
            onChangeText={setDiagnosis}
            multiline
          />
          <AppButton
            title="Salvar resposta"
            variant="secondary"
            compact
            onPress={() => void save()}
            loading={saving}
            disabled={fieldErrors.length > 0}
          />
        </>
      )}

      {criterion.evidenceRequired && (
        <View style={styles.evidenceBlock}>
          <Text style={styles.blockHeading}>Evidência</Text>
          {criterion.answer.evidences.length > 0 ? (
            criterion.answer.evidences.map((e) => (
              <View key={e.id} style={styles.evidenceRow}>
                <Ionicons name="document-attach-outline" size={15} color={colors.inkMuted} />
                <Text style={styles.evidenceName}>{e.name}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.blockHint}>
              {criterion.answer.status === 'nao_aplicavel'
                ? 'Não exigida para critério não aplicável.'
                : 'Obrigatória neste critério: anexe a comprovação antes de enviar.'}
            </Text>
          )}
        </View>
      )}

      {naoConforme && (
        <View style={styles.planBlock}>
          <Text style={styles.blockHeading}>Planos de ação</Text>
          <Text style={styles.blockHint}>
            Obrigatório nesta não conformidade. Uma não conformidade pode ter mais de um plano.
          </Text>
          {criterion.answer.plans.map((p) => (
            <View key={p.id} style={styles.readOnlyBlock}>
              <ReadRow label="Ação" value={p.action} />
              <ReadRow label="Responsável" value={p.owner} />
              <ReadRow label="Prazo" value={p.dueDate} />
              <ReadRow label="Situação atual" value={p.status} />
            </View>
          ))}
          {!readOnly && (
            <>
              <Field label="Nova ação" value={planAction} onChangeText={setPlanAction} multiline />
              <Field label="Responsável" value={planOwner} onChangeText={setPlanOwner} />
              <Field label="Prazo" hint="AAAA-MM-DD" value={planDue} onChangeText={setPlanDue} />
              <AppButton
                title="Adicionar plano"
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

function Flag({ label }: { label: string }) {
  return (
    <View style={styles.flag}>
      <Text style={styles.flagText}>{label}</Text>
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
}

/**
 * O erro entra no `accessibilityLabel` do PRÓPRIO campo, e não só como texto
 * abaixo dele: um leitor de tela que pousa no input precisa ouvir o que está
 * errado sem ter de procurar o parágrafo seguinte.
 */
function Field({ label, hint, value, onChangeText, error, multiline }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
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

  competenceBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.md,
  },
  competenceNav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  competenceLabel: { flex: 1, alignItems: 'center' },
  competenceCaption: { color: colors.inkMuted, fontSize: 10 },
  competenceValue: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },

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
  auditStateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  auditState: { fontSize: 11, fontWeight: '800' },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  countChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.background, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
  },
  countValue: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  countLabel: { color: colors.inkMuted, fontSize: 10 },
  processNote: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.md },
  scoreNote: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: spacing.sm },
  strong: { color: colors.ink, fontWeight: '800' },

  actionError: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  actionErrorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 17 },

  criterionCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
  },
  criterionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  criterionIdentity: { flex: 1 },
  criterionCode: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  criterionQuestion: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 2, lineHeight: 20 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  guidance: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },

  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  flag: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  flagText: { color: colors.inkMuted, fontSize: 9, fontWeight: '700' },

  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    minHeight: 44, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
  },
  choiceDisabled: { opacity: 0.45 },
  choiceText: { color: colors.ink, fontSize: 12, fontWeight: '700' },

  field: { marginTop: spacing.md },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: spacing.md },
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
  readLabel: { color: colors.inkMuted, fontSize: 11, minWidth: 120 },
  readValue: { color: colors.ink, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  evidenceBlock: {
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  evidenceName: { color: colors.ink, fontSize: 12, flexShrink: 1 },

  planBlock: {
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  blockHeading: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  blockHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },

  submitBlock: { marginTop: spacing.lg },
  blockList: {
    backgroundColor: colors.warningSoft, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  blockTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  blockItem: { color: colors.ink, fontSize: 11, lineHeight: 17 },

  closedNote: {
    backgroundColor: colors.infoSoft, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.lg,
  },
  approvedNote: {
    backgroundColor: colors.successSoft, borderRadius: radius.md,
    padding: spacing.md, marginTop: spacing.lg, gap: spacing.sm,
  },
  closedNoteText: { color: colors.ink, fontSize: 11, lineHeight: 17 },
  validatorNote: { color: colors.ink, fontSize: 11, lineHeight: 17, fontStyle: 'italic' },
  pdfBlock: {
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.xs,
  },
  pdfTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  pdfHint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginBottom: spacing.xs },
  pdfOk: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
});
