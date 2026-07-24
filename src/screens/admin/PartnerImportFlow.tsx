/**
 * Fluxo de importação da planilha de Parceiros AACE (AAPEx v2).
 *
 * Duas etapas obrigatórias: SIMULAR (não grava nada; mostra válidos,
 * duplicidades, vínculos ausentes e estruturas a criar) e CONFIRMAR
 * (habilitada somente após a simulação; grava em transação no servidor e
 * exibe o relatório final). O parse é estrito (E9) e o servidor re-valida
 * tudo (RPC admin_import_partners, admin-only).
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { AppButton } from '../../components/AppButton';
import { useAdmin } from '../../context/AdminProvider';
import { colors, radius, spacing } from '../../theme';
import { parseWorkbookGrid, XlsxParseError } from '../../domain/partners/xlsx';
import { parsePartnersSheet } from '../../domain/partners/parseTransposed';
import { ImportReport, ImportReportRow, ImportRow, RowIssue } from '../../domain/partners/types';
import { readDocumentBytes } from '../../utils/readDocumentBytes';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Phase = 'pick' | 'parsing' | 'parsed' | 'simulating' | 'simulated' | 'committing' | 'done';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PartnerImportFlow({ visible, onClose }: Props) {
  const { importPartners } = useAdmin();
  const [phase, setPhase] = useState<Phase>('pick');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('pick');
    setFileName(null);
    setRows([]);
    setIssues([]);
    setReport(null);
    setFatal(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  async function pickFile() {
    setFatal(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: [XLSX_MIME],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhase('parsing');
    setFileName(asset.name);
    try {
      const bytes = await readDocumentBytes(asset);
      const parsed = parsePartnersSheet(parseWorkbookGrid(bytes));
      setRows(parsed.rows);
      setIssues(parsed.issues);
      setReport(null);
      setPhase('parsed');
    } catch (e) {
      setRows([]);
      setIssues([]);
      setFatal(e instanceof XlsxParseError ? e.message : 'Falha ao ler o arquivo selecionado.');
      setPhase('pick');
    }
  }

  async function simulate() {
    setPhase('simulating');
    setFatal(null);
    const res = await importPartners(rows, false);
    if (!res.ok) {
      setFatal(res.message);
      setPhase('parsed');
      return;
    }
    setReport(res.report);
    setPhase('simulated');
  }

  async function confirm() {
    setPhase('committing');
    setFatal(null);
    const res = await importPartners(rows, true);
    if (!res.ok) {
      setFatal(res.message);
      setPhase('simulated');
      return;
    }
    setReport(res.report);
    setPhase('done');
  }

  const busy = phase === 'parsing' || phase === 'simulating' || phase === 'committing';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Importar Parceiros AACE</Text>
          <Pressable onPress={close} accessibilityLabel="Fechar importação">
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.help}>
            A planilha deve estar no formato transposto: coluna A com os rótulos dos campos e um
            Parceiro AACE por coluna. Nada é gravado antes da confirmação.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>1 · Arquivo</Text>
            {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}
            <AppButton
              title={fileName ? 'Escolher outro arquivo' : 'Escolher planilha (.xlsx)'}
              variant="secondary"
              onPress={() => void pickFile()}
              disabled={busy}
            />
          </View>

          {fatal ? <Text style={styles.fatal}>{fatal}</Text> : null}

          {issues.length > 0 && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.danger }]}>Problemas encontrados no arquivo</Text>
              {issues.map((issue, i) => (
                <Text key={i} style={styles.issueText}>
                  {issue.column ? `Coluna ${issue.column}: ` : ''}{issue.message}
                </Text>
              ))}
            </View>
          )}

          {phase !== 'pick' && rows.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>2 · Simulação</Text>
              <Text style={styles.meta}>{rows.length} registro(s) reconhecido(s) na planilha.</Text>
              <AppButton
                title="Simular importação (não grava)"
                onPress={() => void simulate()}
                loading={phase === 'simulating'}
                disabled={busy || phase === 'done'}
              />
            </View>
          )}

          {report && <ReportView report={report} />}

          {phase === 'simulated' && report && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>3 · Confirmação</Text>
              <Text style={styles.meta}>
                Somente as linhas válidas serão gravadas. Linhas com erro permanecem de fora e podem
                ser reimportadas depois de resolvidas (a importação é idempotente).
              </Text>
              <AppButton
                title="Confirmar importação"
                onPress={() => void confirm()}
                loading={false}
                disabled={busy}
              />
            </View>
          )}

          {phase === 'committing' && (
            <View style={styles.centerRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.meta}>Gravando em transação…</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.success }]}>Importação concluída</Text>
              <Text style={styles.meta}>O relatório final acima é o resultado definitivo desta importação.</Text>
              <AppButton title="Fechar" variant="secondary" onPress={close} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ReportView({ report }: { report: ImportReport }) {
  const { counters, toCreate } = report;
  const willCreate =
    toCreate.organizations.length + toCreate.regions.length + toCreate.units.length + toCreate.coordinations.length;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        Relatório · {report.mode === 'simulate' ? 'simulação (nada foi gravado)' : 'confirmação'}
      </Text>
      <View style={styles.counterRow}>
        <Counter label="Total" value={counters.total} color={colors.ink} />
        <Counter label="Novos" value={counters.inserted} color={colors.success} />
        <Counter label="Atualizados" value={counters.updated} color={colors.warning} />
        <Counter label="Erros" value={counters.errors} color={colors.danger} />
      </View>

      {willCreate > 0 && (
        <View style={styles.toCreate}>
          <Text style={styles.toCreateTitle}>
            {report.mode === 'simulate' ? 'Estruturas que serão criadas' : 'Estruturas criadas'}
          </Text>
          {toCreate.organizations.map((n) => <Text key={`o${n}`} style={styles.toCreateItem}>Organização: {n}</Text>)}
          {toCreate.regions.map((n) => <Text key={`r${n}`} style={styles.toCreateItem}>Região: {n}</Text>)}
          {toCreate.units.map((n) => <Text key={`u${n}`} style={styles.toCreateItem}>Unidade: {n}</Text>)}
          {toCreate.coordinations.map((n) => <Text key={`c${n}`} style={styles.toCreateItem}>Coordenação: {n}</Text>)}
        </View>
      )}

      {report.rows.map((row) => <ReportRow key={row.index} row={row} />)}
    </View>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

const ROW_STYLE = {
  ok: { border: '#A9D8B8', bg: colors.successSoft, label: 'Novo' },
  duplicate: { border: '#EBD3A8', bg: colors.warningSoft, label: 'Já existe · atualiza' },
  error: { border: '#F1B6B6', bg: colors.dangerSoft, label: 'Erro · não importa' },
} as const;

function ReportRow({ row }: { row: ImportReportRow }) {
  const s = ROW_STYLE[row.status];
  return (
    <View style={[styles.reportRow, { borderColor: s.border, backgroundColor: s.bg }]}>
      <View style={styles.reportRowHeader}>
        <Text style={styles.reportRowTitle}>#{row.index} · {row.officeName || '(sem escritório)'}</Text>
        <Text style={styles.reportRowStatus}>{s.label}</Text>
      </View>
      {row.partnerName ? <Text style={styles.reportRowMeta}>{row.partnerName}</Text> : null}
      {row.messages.map((m, i) => <Text key={i} style={styles.reportRowError}>{m}</Text>)}
      {row.warnings.map((w, i) => <Text key={`w${i}`} style={styles.reportRowWarn}>{w}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  closeText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  content: { padding: spacing.lg, paddingBottom: 48 },
  help: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginBottom: spacing.sm },
  fileName: { color: colors.inkMuted, fontSize: 12, marginBottom: spacing.sm },
  meta: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  fatal: { color: colors.danger, fontSize: 12, fontWeight: '800', marginBottom: spacing.md },
  issueText: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  counterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  counter: { flex: 1, alignItems: 'center', backgroundColor: colors.background, borderRadius: radius.md, paddingVertical: spacing.sm },
  counterValue: { fontSize: 18, fontWeight: '900' },
  counterLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  toCreate: { backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  toCreateTitle: { color: colors.info, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  toCreateItem: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  reportRow: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  reportRowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  reportRowTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', flex: 1 },
  reportRowStatus: { color: colors.inkMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  reportRowMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  reportRowError: { color: colors.danger, fontSize: 11, marginTop: 3 },
  reportRowWarn: { color: colors.warning, fontSize: 11, marginTop: 3 },
});
