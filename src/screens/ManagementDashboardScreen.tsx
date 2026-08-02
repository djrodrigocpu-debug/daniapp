/**
 * Painel gerencial e MATRIZ (AAPEx 1.3.5, decisão D10) — superfície MÍNIMA.
 *
 * O QUE ESTA TELA NÃO FAZ. Não agrega, não classifica quadrante, não calcula
 * índice e não decide se há dado suficiente. Tudo isso vem da migration 0048,
 * pronto. Aqui só se EXIBE — e a razão é a de sempre: regra duplicada diverge no
 * primeiro conserto, e a tela é a que o usuário acredita.
 *
 * QUATRO EXIGÊNCIAS DE D10 E DO MODELO OPERACIONAL §7.3, VISÍVEIS NO CÓDIGO:
 *
 *   1. **cada gráfico tem alternativa tabular acessível.** Não é adorno: os
 *      achados O-12 e O-13 mostraram que controle sem semântica de botão fica
 *      inalcançável por teclado e leitor de tela. Aqui toda barra tem uma tabela
 *      irmã, sempre presente no DOM, com cabeçalho e valores em texto;
 *   2. **cor nunca é o único sinal.** Todo estado carrega rótulo textual, e o
 *      `accessibilityLabel` repete o que a cor diria;
 *   3. **"sem dado" nunca vira zero.** Uma barra só é desenhada quando há total;
 *      sem total, a tela diz "sem dado no período" em palavras;
 *   4. **índice provisório é anunciado como provisório**, com A-10 e A-11
 *      nomeadas — em texto, não em nota de rodapé.
 *
 * O acabamento visual completo é da Fase 10. Isto é o mínimo FUNCIONAL.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { SectionTitle } from '../components/SectionTitle';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/AppButton';
import { useRepositories } from '../data/repositories/RepositoryProvider';
import {
  DashboardAggregates, DashboardFilters, DashboardModule, MatrixDataset, MatrixEntry,
} from '../domain/dashboard/types135';
import {
  NO_QUADRANT_LABEL, PERFORMANCE_AXIS_LABEL, PROCESS_AXIS_LABEL, QUADRANT_LABEL_135,
  QUADRANT_ORDER, SUFFICIENCY_REASON_LABEL, countQuadrants, filtersSummary,
  proportion, provisionalNotice, quadrantAccessibleLabel, weightedIndexAccessibleLabel,
  weightingLabel, weightedIndexUnavailableReason,
} from '../domain/dashboard/policy135';
import {
  EXPORT_MODULES, EXPORT_MODULE_LABEL, ExportDataset, ExportFormat, ExportModule,
} from '../domain/exporting/dataset';
import { csvBytes, exportFileName } from '../domain/exporting/csv';
import { toXlsx } from '../domain/exporting/xlsx';
import { entregarExport } from '../utils/entregarExport';
import { colors, radius, spacing } from '../theme';

const MODULOS: Array<{ id: DashboardModule; label: string }> = [
  { id: 'assisted', label: 'Gestão Assistida' },
  { id: 'monthly_audit', label: 'Auditoria Mensal' },
  { id: 'plans', label: 'Planos' },
];

interface Linha { rotulo: string; valor: number; tom: string }

export function ManagementDashboardScreen() {
  const { dashboard } = useRepositories();

  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [modules, setModules] = useState<DashboardModule[]>([]);
  const [aggregates, setAggregates] = useState<DashboardAggregates | null>(null);
  const [matrix, setMatrix] = useState<MatrixDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<DashboardFilters>(
    () => ({ periodFrom, periodTo, modules }), [periodFrom, periodTo, modules],
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ag, mx] = await Promise.all([
      dashboard.getAggregates(filters),
      dashboard.getMatrix(filters),
    ]);
    if (!ag.ok) { setError(ag.error.message); setLoading(false); return; }
    if (!mx.ok) { setError(mx.error.message); setLoading(false); return; }
    setAggregates(ag.value);
    setMatrix(mx.value);
    setLoading(false);
  }, [dashboard, filters]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (loading && !aggregates) {
    return (
      <Screen>
        <View style={styles.centered} accessibilityRole="progressbar"
          accessibilityLabel="Carregando o painel gerencial">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.muted}>Carregando o painel gerencial…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
          <Text style={styles.errorTitle} accessibilityRole="header">
            Não foi possível carregar o painel
          </Text>
          <Text style={styles.muted} accessibilityLiveRegion="polite">{error}</Text>
          <AppButton title="Tentar novamente" variant="secondary" onPress={() => void carregar()} />
        </View>
      </Screen>
    );
  }

  if (!aggregates || !matrix) return null;

  const escopo = aggregates.filters.resolvedOperationCount;
  const resumo = filtersSummary(filters, escopo);
  const quadrantes = countQuadrants(matrix.entries);

  const assistidas: Linha[] = [
    { rotulo: 'Conforme', valor: aggregates.assisted.entryStatusCounts.conforme, tom: colors.success },
    { rotulo: 'Atenção', valor: aggregates.assisted.entryStatusCounts.atencao, tom: colors.warning },
    { rotulo: 'Não conforme', valor: aggregates.assisted.entryStatusCounts.nao_conforme, tom: colors.danger },
    { rotulo: 'Sem dado', valor: aggregates.assisted.entryStatusCounts.sem_dado, tom: colors.inkMuted },
  ];

  const mensais: Linha[] = [
    { rotulo: 'Conforme', valor: aggregates.monthlyAudit.answerStatusCounts.conforme, tom: colors.success },
    { rotulo: 'Não conforme', valor: aggregates.monthlyAudit.answerStatusCounts.nao_conforme, tom: colors.danger },
    { rotulo: 'Não aplicável', valor: aggregates.monthlyAudit.answerStatusCounts.nao_aplicavel, tom: colors.inkMuted },
    { rotulo: 'Não avaliado', valor: aggregates.monthlyAudit.answerStatusCounts.nao_avaliado, tom: colors.inkMuted },
  ];

  const planos: Linha[] = Object.entries(aggregates.actionPlans.byStatus).map(([k, v]) => ({
    rotulo: k, valor: v, tom: colors.primary,
  }));

  return (
    <Screen>
      <SectionTitle
        title="Painel gerencial"
        subtitle="Agregações resolvidas no servidor, dentro do escopo do seu perfil. Filtro ausente significa todo o escopo autorizado — nunca todo o banco."
      />

      {/* ---------------------------------------------------------------- */}
      {/* FILTROS                                                          */}
      {/* ---------------------------------------------------------------- */}
      <View style={styles.card} accessibilityLabel="Filtros do painel">
        <Text style={styles.cardTitle} accessibilityRole="header">Filtros</Text>
        <View style={styles.filtroLinha}>
          <View style={styles.filtroCampo}>
            <Text style={styles.label} nativeID="lbl-de">Período — de (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={periodFrom}
              onChangeText={setPeriodFrom}
              placeholder="2026-01-01"
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel="Início do período, no formato ano-mês-dia"
              accessibilityLabelledBy="lbl-de"
            />
          </View>
          <View style={styles.filtroCampo}>
            <Text style={styles.label} nativeID="lbl-ate">Período — até (AAAA-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={periodTo}
              onChangeText={setPeriodTo}
              placeholder="2026-12-31"
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel="Fim do período, no formato ano-mês-dia"
              accessibilityLabelledBy="lbl-ate"
            />
          </View>
        </View>

        <Text style={styles.label}>Módulos</Text>
        <View style={styles.chips}>
          {MODULOS.map((m) => {
            const ativo = modules.includes(m.id);
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={`Filtrar por ${m.label}${ativo ? ', selecionado' : ''}`}
                // `tabIndex` é o que dá foco por teclado no web — a lição do O-13.
                tabIndex={0}
                style={[styles.chip, ativo && styles.chipAtivo]}
                onPress={() => setModules((atual) => (
                  atual.includes(m.id) ? atual.filter((x) => x !== m.id) : [...atual, m.id]
                ))}
              >
                <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                  {ativo ? '✓ ' : ''}{m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <AppButton title="Aplicar filtros" onPress={() => void carregar()} />
        <Text style={styles.recorte} accessibilityLiveRegion="polite">{resumo}</Text>
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* COBERTURA                                                        */}
      {/* ---------------------------------------------------------------- */}
      <SectionTitle title="Cobertura" subtitle={resumo} />
      <View style={styles.card}>
        <Tabela
          titulo="Cobertura por módulo"
          colunas={['Módulo', 'Parceiros']}
          linhas={[
            ['Parceiros no escopo', String(aggregates.coverage.partners)],
            ['Com Gestão Assistida no período', String(aggregates.coverage.partnersWithAssisted)],
            ['Com Auditoria Mensal no período', String(aggregates.coverage.partnersWithMonthlyAudit)],
          ]}
        />
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* GESTÃO ASSISTIDA                                                 */}
      {/* ---------------------------------------------------------------- */}
      <SectionTitle
        title="Gestão Assistida"
        subtitle="Eixo de desempenho. `Sem dado` não é não conformidade: é ausência de registro."
      />
      <Grafico titulo="Situação dos indicadores da semana" descricao={resumo} linhas={assistidas} />

      {/* ---------------------------------------------------------------- */}
      {/* AUDITORIA MENSAL                                                 */}
      {/* ---------------------------------------------------------------- */}
      <SectionTitle
        title="Auditoria Mensal"
        subtitle="Eixo de processo. A regra de pontuação é PROVISÓRIA e aguarda decisão empresarial (A-10)."
      />
      <Grafico titulo="Respostas aos critérios de processo" descricao={resumo} linhas={mensais} />

      {/* ---------------------------------------------------------------- */}
      {/* PLANOS                                                           */}
      {/* ---------------------------------------------------------------- */}
      <SectionTitle
        title="Planos de ação"
        subtitle="Motor único, três origens. `Vencido` é derivado da data pelo servidor."
      />
      <Grafico titulo="Planos por estado" descricao={resumo} linhas={planos} />
      <View style={styles.card}>
        <Tabela
          titulo="Planos — origem e vencimento"
          colunas={['Recorte', 'Quantidade']}
          linhas={[
            ['Total no período', String(aggregates.actionPlans.total)],
            ['Vencidos (derivado da data)', String(aggregates.actionPlans.overdue)],
            ['Origem: Gestão Assistida', String(aggregates.actionPlans.bySource.assisted ?? 0)],
            ['Origem: Auditoria Mensal', String(aggregates.actionPlans.bySource.monthly_audit ?? 0)],
            ['Origem: legado', String(aggregates.actionPlans.bySource.legacy ?? 0)],
          ]}
        />
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* MATRIZ                                                           */}
      {/* ---------------------------------------------------------------- */}
      <SectionTitle
        title="Matriz"
        subtitle="Desempenho (Gestão Assistida) × processo (Auditoria Mensal). Quem não tem os dois eixos não entra em quadrante algum — e o motivo é dito."
      />
      <View style={styles.card}>
        <Tabela
          titulo="Parceiros por quadrante"
          colunas={['Quadrante', 'Parceiros']}
          linhas={[
            ...QUADRANT_ORDER.map((q) => [QUADRANT_LABEL_135[q], String(quadrantes[q])] as [string, string]),
            [NO_QUADRANT_LABEL, String(quadrantes.no_data)],
          ]}
        />
      </View>

      {matrix.entries.length === 0 ? (
        <EmptyState
          title="Nenhum Parceiro AACE no escopo"
          description="Não há Parceiro AACE alcançável por este perfil com o recorte aplicado."
        />
      ) : (
        matrix.entries.map((e) => <CartaoParceiro key={e.operationId} entrada={e} />)
      )}

      <View style={styles.aviso} accessibilityRole="alert">
        <Text style={styles.avisoTexto}>{provisionalNotice(matrix.ruleProvenance)}</Text>
        <Text style={styles.avisoDetalhe}>
          Desempenho: {matrix.ruleProvenance.performanceScoreRule} ·
          Processo: {matrix.ruleProvenance.monthlyScoreRule} ·
          Quadrantes: {matrix.ruleProvenance.quadrantRule}
        </Text>
      </View>

      <BlocoExportacao filtros={filters} resumo={resumo} />
    </Screen>
  );
}

/**
 * Exportação — CSV por módulo e XLSX com as cinco abas.
 *
 * O escopo e os filtros do arquivo são os MESMOS que o painel acima aplicou, e
 * são resolvidos no servidor: a tela não escolhe o que entra, só o formato e o
 * módulo. O XLSX busca os quatro módulos e monta uma pasta só; o CSV busca um.
 */
function BlocoExportacao({ filtros, resumo }: { filtros: DashboardFilters; resumo: string }) {
  const { exporting } = useRepositories();
  const [modulo, setModulo] = useState<ExportModule>('assisted');
  const [gerando, setGerando] = useState<ExportFormat | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const gerar = useCallback(async (formato: ExportFormat) => {
    setGerando(formato);
    setAviso(null);
    try {
      if (formato === 'csv') {
        const r = await exporting.getDataset(modulo, filtros);
        if (!r.ok) { setAviso(r.error.message); return; }
        if (r.value.rowCount === 0) {
          setAviso('Nenhuma linha no recorte aplicado. Nada foi gerado — um arquivo vazio '
            + 'pareceria um recorte legítimo.');
          return;
        }
        const entrega = await entregarExport()(
          csvBytes(r.value), exportFileName(r.value, 'csv'), 'csv');
        setAviso(entrega.ok ? `Arquivo gerado com ${r.value.rowCount} linha(s).` : (entrega.message ?? null));
        return;
      }

      const datasets: Partial<Record<string, ExportDataset>> = {};
      for (const m of EXPORT_MODULES) {
        const r = await exporting.getDataset(m, filtros);
        if (!r.ok) { setAviso(r.error.message); return; }
        datasets[m] = r.value;
      }
      const total = EXPORT_MODULES.reduce((s, m) => s + (datasets[m]?.rowCount ?? 0), 0);
      if (total === 0) {
        setAviso('Nenhuma linha no recorte aplicado. Nada foi gerado.');
        return;
      }
      const entrega = await entregarExport()(
        toXlsx(datasets), exportFileName(datasets.summary!, 'xlsx'), 'xlsx');
      setAviso(entrega.ok ? `Pasta gerada com ${total} linha(s) em cinco abas.` : (entrega.message ?? null));
    } finally {
      setGerando(null);
    }
  }, [exporting, modulo, filtros]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">Exportar</Text>
      <Text style={styles.muted}>
        O arquivo carrega exatamente o recorte acima — escopo e filtros são resolvidos no
        servidor, e a geração não amplia o que ele devolveu. {resumo}
      </Text>

      <Text style={styles.label}>Módulo (CSV)</Text>
      <View style={styles.chips}>
        {EXPORT_MODULES.map((m) => {
          const ativo = modulo === m;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              accessibilityLabel={`Exportar ${EXPORT_MODULE_LABEL[m]}${ativo ? ', selecionado' : ''}`}
              // `tabIndex` é o que dá foco por teclado no web — a lição do O-13.
              tabIndex={0}
              style={[styles.chip, ativo && styles.chipAtivo]}
              onPress={() => setModulo(m)}
            >
              <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                {ativo ? '✓ ' : ''}{EXPORT_MODULE_LABEL[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <AppButton
        title={gerando === 'csv' ? 'Gerando CSV…' : `Baixar CSV — ${EXPORT_MODULE_LABEL[modulo]}`}
        onPress={() => void gerar('csv')}
        disabled={gerando !== null}
      />
      <AppButton
        title={gerando === 'xlsx' ? 'Gerando XLSX…' : 'Baixar XLSX — cinco abas'}
        variant="secondary"
        onPress={() => void gerar('xlsx')}
        disabled={gerando !== null}
      />

      {gerando !== null && (
        <View style={styles.progresso} accessibilityRole="progressbar"
          accessibilityLabel={`Gerando o arquivo ${gerando}`}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.muted}>Gerando o arquivo…</Text>
        </View>
      )}

      {aviso !== null && (
        <Text style={styles.semDado} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {aviso}
        </Text>
      )}

      <Text style={styles.avisoDetalhe}>
        O XLSX traz as abas Gestao_Assistida, Auditoria_Mensal, Planos, Resumo e
        Filtros_Aplicados, nesta ordem, sem fórmula alguma. A aba Resumo é um
        resumo técnico provisório — a composição empresarial final continua pendente (A-06).
      </Text>
    </View>
  );
}

/**
 * Um gráfico e a sua alternativa tabular, LADO A LADO e sempre presentes. Não é
 * um "modo acessível" que se ativa: quem lê a tela por texto encontra a tabela
 * sem precisar procurar um botão.
 */
function Grafico({ titulo, descricao, linhas }: { titulo: string; descricao: string; linhas: Linha[] }) {
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">{titulo}</Text>
      <Text style={styles.muted}>{descricao}</Text>

      {total === 0 ? (
        // Zero de tudo NÃO é "0%". É ausência de dado, e a tela diz isso.
        <Text style={styles.semDado} accessibilityLiveRegion="polite">
          Sem dado no período selecionado. Isto não significa zero: significa que
          não há registro para agregar.
        </Text>
      ) : (
        <View style={styles.barras}>
          {linhas.map((l) => {
            const pct = proportion(l.valor, total);
            return (
              <View key={l.rotulo} style={styles.barraLinha}>
                <Text style={styles.barraRotulo}>{l.rotulo}</Text>
                <View style={styles.barraTrilho} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[styles.barraPreenchida, { width: `${pct ?? 0}%`, backgroundColor: l.tom }]} />
                </View>
                <Text style={styles.barraValor}>{l.valor}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Tabela
        titulo={`${titulo} — tabela`}
        colunas={['Situação', 'Quantidade', 'Participação']}
        linhas={linhas.map((l) => [
          l.rotulo,
          String(l.valor),
          total === 0 ? 'sem dado' : `${(proportion(l.valor, total) ?? 0).toFixed(1)}%`,
        ])}
      />
    </View>
  );
}

/** Alternativa tabular acessível — texto puro, com cabeçalho anunciado. */
function Tabela({ titulo, colunas, linhas }: {
  titulo: string; colunas: string[]; linhas: Array<string[]>;
}) {
  return (
    <View style={styles.tabela} accessibilityLabel={titulo}>
      <Text style={styles.tabelaTitulo} accessibilityRole="header">{titulo}</Text>
      <View style={styles.tabelaLinha}>
        {colunas.map((c) => (
          <Text key={c} style={[styles.tabelaCelula, styles.tabelaCabecalho]}>{c}</Text>
        ))}
      </View>
      {linhas.map((l, i) => (
        <View key={`${l[0]}-${i}`} style={styles.tabelaLinha} accessibilityLabel={l.join(', ')}>
          {l.map((c, j) => <Text key={`${c}-${j}`} style={styles.tabelaCelula}>{c}</Text>)}
        </View>
      ))}
    </View>
  );
}

function CartaoParceiro({ entrada }: { entrada: MatrixEntry }) {
  const semIndice = weightedIndexUnavailableReason(entrada);
  return (
    <View style={styles.card} accessibilityLabel={quadrantAccessibleLabel(entrada)}>
      <Text style={styles.cardTitle} accessibilityRole="header">{entrada.partnerName}</Text>

      <Text style={styles.quadrante}>
        {entrada.quadrant ? QUADRANT_LABEL_135[entrada.quadrant] : NO_QUADRANT_LABEL}
      </Text>
      {!entrada.dataSufficiency.sufficient && (
        <Text style={styles.semDado}>
          {entrada.dataSufficiency.reasons.map((r) => SUFFICIENCY_REASON_LABEL[r]).join('; ')}
        </Text>
      )}

      <Tabela
        titulo={`${entrada.partnerName} — os dois eixos`}
        colunas={['Eixo', 'Situação', 'Nota (provisória)']}
        linhas={[
          ['Desempenho · Gestão Assistida',
            PERFORMANCE_AXIS_LABEL[entrada.performance.axis],
            entrada.performance.score === null ? 'sem dado' : entrada.performance.score.toFixed(2)],
          ['Processo · Auditoria Mensal',
            PROCESS_AXIS_LABEL[entrada.process.axis],
            entrada.process.score === null ? 'sem dado' : entrada.process.score.toFixed(2)],
        ]}
      />

      <Text style={styles.ponderacao}>{weightingLabel(entrada.weighting)}</Text>

      {entrada.weightedIndex ? (
        <Text
          style={styles.indice}
          accessibilityLabel={weightedIndexAccessibleLabel(entrada, entrada.weightedIndex)}
        >
          Índice ponderado provisório: {entrada.weightedIndex.value.toFixed(2)}
        </Text>
      ) : (
        <Text style={styles.semDado}>Índice não calculado — {semIndice}.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: 64 },
  muted: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  errorTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm,
  },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  label: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 8, color: colors.ink, fontSize: 13,
  },
  filtroLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filtroCampo: { flexGrow: 1, flexShrink: 1, minWidth: 140, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  chipAtivo: { borderColor: colors.primary, backgroundColor: colors.background },
  chipTexto: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  chipTextoAtivo: { color: colors.primary },
  recorte: { color: colors.inkMuted, fontSize: 11, fontStyle: 'italic' },
  barras: { gap: 6, marginTop: spacing.sm },
  barraLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barraRotulo: { color: colors.ink, fontSize: 12, width: 104 },
  barraTrilho: { flex: 1, height: 10, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden' },
  barraPreenchida: { height: 10, borderRadius: 5 },
  barraValor: { color: colors.ink, fontSize: 12, fontWeight: '800', width: 40, textAlign: 'right' },
  semDado: { color: colors.inkMuted, fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
  tabela: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  tabelaTitulo: { color: colors.inkMuted, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  tabelaLinha: { flexDirection: 'row', paddingVertical: 3, gap: spacing.sm },
  tabelaCelula: { flex: 1, color: colors.ink, fontSize: 11 },
  tabelaCabecalho: { color: colors.inkMuted, fontWeight: '800' },
  quadrante: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  ponderacao: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  indice: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  aviso: {
    borderWidth: 1, borderColor: colors.warning, borderRadius: radius.lg,
    padding: spacing.lg, gap: 4, marginBottom: spacing.md,
  },
  avisoTexto: { color: colors.ink, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  avisoDetalhe: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  progresso: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
