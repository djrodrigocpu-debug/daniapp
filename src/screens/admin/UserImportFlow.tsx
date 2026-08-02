/**
 * Fluxo de importação da planilha de Usuários AACE.
 *
 * Mesmas duas etapas obrigatórias do importador de Parceiros: SIMULAR (não
 * grava; mostra quem entra, quem é atualizado e quais áreas ficam sem
 * coordenador) e CONFIRMAR (habilitada só depois da simulação). A importação é
 * idempotente por e-mail — reimportar a mesma planilha não duplica ninguém.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { AppButton } from '../../components/AppButton';
import { useAdmin } from '../../context/AdminProvider';
import { colors, radius, spacing } from '../../theme';
import { parseWorkbookGrid, XlsxParseError } from '../../domain/partners/xlsx';
import { parseUsersSheet } from '../../domain/users/parseUsersSheet';
import {
  UserImportReport, UserImportReportRow, UserImportRow, UserImportRowStatus, UserIssue,
} from '../../domain/users/types';
import { readDocumentBytes } from '../../utils/readDocumentBytes';
import { roleLabel } from '../../utils/format';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Phase = 'pick' | 'parsing' | 'parsed' | 'simulating' | 'simulated' | 'committing' | 'done';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function UserImportFlow({ visible, onClose }: Props) {
  const { importUsers } = useAdmin();
  const [phase, setPhase] = useState<Phase>('pick');
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<UserImportRow[]>([]);
  const [issues, setIssues] = useState<UserIssue[]>([]);
  const [unit, setUnit] = useState<'linha' | 'coluna'>('linha');
  const [report, setReport] = useState<UserImportReport | null>(null);
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
      // A planilha da carga tem quatro abas e a de instruções vem primeiro:
      // sem nomear a aba, o leitor traria a LEIA-ME e nada seria reconhecido.
      const parsed = parseUsersSheet(parseWorkbookGrid(bytes, 'Usuarios_Importacao'));
      setRows(parsed.rows);
      setIssues(parsed.issues);
      setUnit(parsed.layout === 'tabular' ? 'linha' : 'coluna');
      setReport(null);
      setPhase('parsed');
    } catch (e) {
      setRows([]);
      setIssues([]);
      setFatal(e instanceof XlsxParseError ? e.message : 'Falha ao ler o arquivo selecionado.');
      setPhase('pick');
    }
  }

  async function run(commit: boolean) {
    setPhase(commit ? 'committing' : 'simulating');
    setFatal(null);
    const res = await importUsers(rows, commit);
    if (!res.ok) {
      setFatal(res.message);
      setPhase(commit ? 'simulated' : 'parsed');
      return;
    }
    setReport(res.report);
    setPhase(commit ? 'done' : 'simulated');
  }

  const busy = phase === 'parsing' || phase === 'simulating' || phase === 'committing';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Importar Usuários</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar importação"
            focusable
            tabIndex={0}
            onPress={close}
          >
            <Text style={styles.closeText}>Fechar</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.help}>
            A planilha precisa ter as colunas Nome, E-mail, Área de atuação e Perfil (Administrador,
            Gerência Regional, Coordenação ou Gerente de Canal). Nada é gravado antes da confirmação.
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
                  {issue.column ? `${unit === 'linha' ? 'Linha' : 'Coluna'} ${issue.column}: ` : ''}{issue.message}
                </Text>
              ))}
            </View>
          )}

          {phase !== 'pick' && rows.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>2 · Simulação</Text>
              <Text style={styles.meta}>{rows.length} usuário(s) reconhecido(s) na planilha.</Text>
              <AppButton
                title="Simular importação (não grava)"
                onPress={() => void run(false)}
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
                Usuários já existentes são atualizados pelo e-mail — reimportar a mesma planilha não
                duplica ninguém.
              </Text>
              <AppButton title="Confirmar importação" onPress={() => void run(true)} disabled={busy} />
            </View>
          )}

          {phase === 'committing' && (
            <View style={styles.centerRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.meta}>Gravando…</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.success }]}>Importação concluída</Text>
              <Text style={styles.meta}>
                Agora os Parceiros AACE podem ser vinculados a estes Gerentes de Canal.
              </Text>
              <AppButton title="Fechar" variant="secondary" onPress={close} />
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ReportView({ report }: { report: UserImportReport }) {
  const { counters, coordinationsWithoutCoordinator } = report;
  const pendentes = report.pendingAuth ?? [];
  // No caminho corporativo a gravação é tudo-ou-nada: 'commit' com applied
  // falso significa que NADA entrou — o oposto de aplicação parcial.
  const recusado = report.mode === 'commit' && report.applied === false;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        Relatório · {report.mode === 'simulate' ? 'simulação (nada foi gravado)' : 'confirmação'}
      </Text>

      {recusado && (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>Lote recusado por inteiro — nada foi gravado</Text>
          <Text style={styles.warnItem}>
            A gravação é transacional: basta uma linha inválida para o lote todo ser revertido.
            Corrija os pontos abaixo e confirme de novo.
          </Text>
        </View>
      )}

      {pendentes.length > 0 && (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Aguardando convite de acesso</Text>
          {pendentes.map((email) => <Text key={email} style={styles.warnItem}>{email}</Text>)}
          <Text style={styles.warnItem}>
            Estes e-mails ainda não têm identidade de login. Ao confirmar, o convite é enviado
            automaticamente e a pessoa só passa a contar como ativa depois de aceitá-lo.
          </Text>
        </View>
      )}
      <View style={styles.counterRow}>
        <Counter label="Total" value={counters.total} color={colors.ink} />
        <Counter label="Novos" value={counters.inserted} color={colors.success} />
        <Counter label="Atualizados" value={counters.updated} color={colors.warning} />
        <Counter label="Erros" value={counters.errors} color={colors.danger} />
      </View>

      {(coordinationsWithoutCoordinator ?? []).length > 0 && (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Áreas sem coordenador ativo</Text>
          {(coordinationsWithoutCoordinator ?? []).map((c) => (
            <Text key={c} style={styles.warnItem}>{c}</Text>
          ))}
          <Text style={styles.warnItem}>
            Os GCs dessas áreas entram sem coordenador vinculado.
          </Text>
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
  // Estado do caminho remoto: e-mail ainda sem identidade no Auth. É o estado
  // NORMAL de toda linha de uma carga inicial — a identidade nasce na
  // confirmação, que delega ao provisionamento. Sem esta entrada, a tela
  // quebrava inteira ao simular a primeira carga.
  pending_auth: { border: '#BFD4EE', bg: colors.infoSoft, label: 'Novo · cria acesso' },
  // `satisfies` obriga o mapa a cobrir TODOS os status: se o contrato ganhar um
  // estado novo, o typecheck acusa aqui em vez de a tela quebrar no operador.
} as const satisfies Record<UserImportRowStatus, { border: string; bg: string; label: string }>;

/** Estilo neutro para status que o servidor venha a introduzir. */
const ROW_STYLE_DESCONHECIDO = { border: colors.border, bg: colors.surface, label: 'Verificar' };

function ReportRow({ row }: { row: UserImportReportRow }) {
  // Nunca indexar direto: um status novo no servidor derrubaria o relatório
  // inteiro em vez de apenas exibir um rótulo genérico.
  const s = ROW_STYLE[row.status] ?? ROW_STYLE_DESCONHECIDO;
  return (
    <View style={[styles.reportRow, { borderColor: s.border, backgroundColor: s.bg }]}>
      <View style={styles.reportRowHeader}>
        <Text style={styles.reportRowTitle}>#{row.index} · {row.name}</Text>
        <Text style={styles.reportRowStatus}>{s.label}</Text>
      </View>
      <Text style={styles.reportRowMeta}>{row.email} · {roleLabel[row.role]}</Text>
      {(row.messages ?? []).map((m, i) => <Text key={i} style={styles.reportRowError}>{m}</Text>)}
      {(row.warnings ?? []).map((w, i) => <Text key={`w${i}`} style={styles.reportRowWarn}>{w}</Text>)}
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
  warnBox: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  warnTitle: { color: colors.warning, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  warnItem: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  rejectedBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, borderWidth: 1, borderColor: '#F1B6B6', padding: spacing.md, marginBottom: spacing.md },
  rejectedTitle: { color: colors.danger, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  reportRow: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  reportRowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  reportRowTitle: { color: colors.ink, fontSize: 12, fontWeight: '800', flex: 1 },
  reportRowStatus: { color: colors.inkMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  reportRowMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  reportRowError: { color: colors.danger, fontSize: 11, marginTop: 3 },
  reportRowWarn: { color: colors.warning, fontSize: 11, marginTop: 3 },
});
