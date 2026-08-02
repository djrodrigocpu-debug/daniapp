import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { alertDialog } from '../utils/dialog';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { useAdmin } from '../context/AdminProvider';
import { colors, radius, spacing } from '../theme';
import { AdminIndicator, IndicatorDirection, IndicatorUnit, UserRole } from '../types';
import { INDICATOR_DIRECTIONS, INDICATOR_UNITS, validateIndicatorVersionForm, yellowLimitPreview } from '../domain/indicators/indicatorForm';
import { roleLabel } from '../utils/format';
import { PartnersSection } from './admin/PartnersSection';
import { UserImportFlow } from './admin/UserImportFlow';
import { CatalogSection } from './admin/CatalogSection';

const ROLES: UserRole[] = ['admin', 'regional', 'coordinator', 'channel_manager'];

type AdminMode = 'partners' | 'users' | 'indicators' | 'catalog';

const TABS: Array<{ mode: AdminMode; label: string }> = [
  { mode: 'partners', label: 'Parceiros AACE' },
  { mode: 'users', label: 'Usuários' },
  { mode: 'indicators', label: 'Indicadores' },
  // Catálogo com escopo global/regional (AAPEx 1.3.5, A-08). Aba SEPARADA da
  // aba "Indicadores": aquela é o catálogo legado, sem escopo e sem
  // configuração regional, e continua servindo o que já existe. Misturar as
  // duas faria o operador achar que a meta editada ali vale para a região.
  { mode: 'catalog', label: 'Catálogo regional' },
];

export function AdminScreen() {
  const admin = useAdmin();
  const [mode, setMode] = useState<AdminMode>('partners');

  if (admin.loading && admin.users.length === 0 && admin.indicators.length === 0 && admin.partners.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Carregando administração…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Administração</Text>
        <Text style={styles.subtitle}>
          Parceiros AACE, usuários, indicadores versionados e o catálogo com escopo global e regional.
        </Text>
        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <Pressable key={tab.mode} onPress={() => setMode(tab.mode)} style={[styles.tab, mode === tab.mode && styles.tabActive]}>
              <Text style={[styles.tabText, mode === tab.mode && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>

        <DemoDataBanner />

        {mode === 'partners' ? <PartnersSection />
          : mode === 'users' ? <UsersSection />
          : mode === 'indicators' ? <IndicatorsSection />
          : <CatalogSection />}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Os perfis de demonstração usam as MESMAS áreas do canal ("PR Capital",
 * "Santa Catarina"). Convivendo com os dados reais, cada área fica com dois
 * coordenadores ativos, a resolução por coordenação vira ambígua e nenhum GC é
 * vinculado — travando a importação de Parceiros AACE. Por isso o aviso aparece
 * antes da carga, e não como uma opção escondida.
 */
function DemoDataBanner() {
  const { demoDataCount, clearDemoData } = useAdmin();
  if (demoDataCount === 0) return null;

  function confirm() {
    alertDialog(
      'Remover dados de demonstração?',
      `Serão excluídos ${demoDataCount} registro(s) fictícios (usuários e Parceiros AACE de exemplo), `
      + 'junto com as avaliações e planos deles. Os dados importados das suas planilhas não são tocados. '
      + 'Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            const res = clearDemoData();
            if (!res.ok) alertDialog('Ainda não é possível remover', res.message);
          },
        },
      ],
    );
  }

  return (
    <View style={styles.demoBanner}>
      <Text style={styles.demoTitle}>Base ainda contém dados de demonstração</Text>
      <Text style={styles.demoText}>
        {demoDataCount} registro(s) fictícios usam as mesmas áreas do canal (PR Capital, Santa Catarina).
        Enquanto existirem, cada área fica com dois coordenadores e os Gerentes de Canal não conseguem
        ser vinculados.{'\n\n'}
        Ordem correta: 1) importe a planilha de Usuários · 2) remova os dados de demonstração ·
        3) importe a planilha de Parceiros AACE. Depois entre com o seu e-mail corporativo — a conta
        de demonstração deixa de existir.
      </Text>
      <AppButton title="Remover dados de demonstração" variant="danger" compact onPress={confirm} style={styles.mt} />
    </View>
  );
}

function UsersSection() {
  const { users, createUser, setUserActive, updateUserRole } = useAdmin();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [role, setRole] = useState<UserRole>('channel_manager');
  const [busy, setBusy] = useState(false);
  const [importVisible, setImportVisible] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await createUser({ name, email, region, role, initialPassword });
    setBusy(false);
    if (!res.ok) {
      alertDialog('Não foi possível criar', res.message);
      return;
    }
    setName('');
    setEmail('');
    setRegion('');
    // A senha temporária não fica na tela depois de enviada.
    setInitialPassword('');
  }

  async function cycleRole(userId: string, current: UserRole) {
    const next = ROLES[(ROLES.indexOf(current) + 1) % ROLES.length];
    const res = await updateUserRole(userId, next);
    if (!res.ok) alertDialog('Falha', res.message);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo usuário</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Nome" placeholderTextColor={colors.neutral} style={styles.input} />
        <TextInput value={email} onChangeText={setEmail} placeholder="E-mail corporativo" placeholderTextColor={colors.neutral} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <TextInput value={region} onChangeText={setRegion} placeholder="Área de atuação" placeholderTextColor={colors.neutral} style={styles.input} />
        <TextInput value={initialPassword} onChangeText={setInitialPassword} placeholder="Senha inicial (mín. 12, com letras e números)" placeholderTextColor={colors.neutral} autoCapitalize="none" autoCorrect={false} style={styles.input} />
        <Text style={styles.hint}>
          A senha inicial só é necessária para quem ainda não tem acesso. Ela é temporária:
          o usuário será obrigado a trocá-la no primeiro acesso.
        </Text>
        <Text style={styles.fieldLabel}>Perfil</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => (
            <Pressable key={r} onPress={() => setRole(r)} style={[styles.chip, role === r && styles.chipActive]}>
              <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{roleLabel[r]}</Text>
            </Pressable>
          ))}
        </View>
        <AppButton title="Criar usuário" onPress={() => void submit()} loading={busy} style={styles.mt} />
      </View>

      <View style={styles.mb}>
        <AppButton title="Importar planilha (.xlsx)" variant="secondary" onPress={() => setImportVisible(true)} />
      </View>

      <Text style={styles.listTitle}>{users.length} usuário(s)</Text>
      {users.map((user) => {
        const active = user.active !== false;
        return (
          <View key={user.id} style={styles.row}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{user.avatarInitials}</Text></View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>{user.name}</Text>
              <Text style={styles.rowMeta}>{user.email}</Text>
              <Pressable onPress={() => void cycleRole(user.id, user.role)}>
                <Text style={styles.rowRole}>{roleLabel[user.role]} · alterar</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => void setUserActive(user.id, !active)} style={[styles.statusToggle, active ? styles.statusOn : styles.statusOff]}>
              <Text style={[styles.statusToggleText, { color: active ? colors.success : colors.danger }]}>{active ? 'Ativo' : 'Inativo'}</Text>
            </Pressable>
          </View>
        );
      })}

      <UserImportFlow visible={importVisible} onClose={() => setImportVisible(false)} />
    </View>
  );
}

/**
 * Contrato MEDIDO de uma versão. Cadastro e nova versão preenchem exatamente os
 * mesmos campos, então eles vivem em um componente só — duplicar a marcação faria
 * as duas telas divergirem na primeira mudança de contrato.
 */
interface ContractDraft {
  unit: IndicatorUnit;
  direction: IndicatorDirection;
  target: string;
  yellowTolerance: string;
  weight: string;
}

const CONTRATO_VAZIO: ContractDraft = {
  unit: '%', direction: 'higher_better', target: '', yellowTolerance: '', weight: '',
};

const hoje = () => new Date().toISOString().slice(0, 10);

function ContractFields({ draft, onChange }: { draft: ContractDraft; onChange: (patch: Partial<ContractDraft>) => void }) {
  // Prévia do limite amarelo: exibição pura — a fórmula do semáforo não muda.
  const yellowLimit = yellowLimitPreview(draft.direction, draft.target, draft.yellowTolerance);
  const fmt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return (
    <>
      <Text style={styles.fieldLabel}>Unidade</Text>
      <View style={styles.roleRow}>
        {INDICATOR_UNITS.map((item) => (
          <Pressable key={item} onPress={() => onChange({ unit: item })} style={[styles.chip, draft.unit === item && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, draft.unit === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.fieldLabel}>Direção</Text>
      <View style={styles.roleRow}>
        {INDICATOR_DIRECTIONS.map((item) => (
          <Pressable key={item.value} onPress={() => onChange({ direction: item.value })} style={[styles.chip, draft.direction === item.value && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, draft.direction === item.value && styles.chipTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.inlineRow, styles.mt]}>
        <TextInput value={draft.target} onChangeText={(v) => onChange({ target: v })} placeholder="Meta" placeholderTextColor={colors.neutral} keyboardType="numeric" style={[styles.input, styles.numField]} />
        <TextInput value={draft.yellowTolerance} onChangeText={(v) => onChange({ yellowTolerance: v })} placeholder="Tolerância amarela (% da meta)" placeholderTextColor={colors.neutral} keyboardType="numeric" style={[styles.input, styles.numField]} />
        <TextInput value={draft.weight} onChangeText={(v) => onChange({ weight: v })} placeholder="Prioridade" placeholderTextColor={colors.neutral} keyboardType="numeric" style={[styles.input, styles.numField]} />
      </View>
      <Text style={styles.hint}>
        A tolerância amarela é uma porcentagem aplicada sobre a meta, não uma diferença absoluta.
        {yellowLimit !== null && ` Prévia: ${draft.direction === 'higher_better'
          ? `amarelo entre ${fmt(yellowLimit)} e a meta; abaixo de ${fmt(yellowLimit)}, vermelho.`
          : `amarelo entre a meta e ${fmt(yellowLimit)}; acima de ${fmt(yellowLimit)}, vermelho.`}`}
      </Text>
      <Text style={styles.hint}>
        A prioridade ordena os indicadores dentro da mesma situação do semáforo. Ela não altera o
        semáforo e não entra no Índice de excelência.
      </Text>
    </>
  );
}

function IndicatorsSection() {
  const { indicators, createIndicator, addIndicatorVersion, updateIndicator, deactivateIndicator, removeIndicator } = useAdmin();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [novo, setNovo] = useState<ContractDraft>(CONTRATO_VAZIO);
  const [busy, setBusy] = useState(false);

  /**
   * Painéis abertos guardam o ID, nunca o objeto do indicador: cada mutação
   * recarrega a lista e a referência anterior fica obsoleta na hora.
   */
  const [versionOf, setVersionOf] = useState<string | null>(null);
  const [versionDraft, setVersionDraft] = useState<ContractDraft>(CONTRATO_VAZIO);
  const [effectiveFrom, setEffectiveFrom] = useState(hoje());
  const [identityOf, setIdentityOf] = useState<string | null>(null);
  const [identityCode, setIdentityCode] = useState('');
  const [identityName, setIdentityName] = useState('');

  async function submit() {
    if (!code.trim() || !name.trim()) {
      alertDialog('Campos obrigatórios', 'Informe código e nome do indicador.');
      return;
    }
    // Validação estrita: NaN e ausência são recusados; zero é preservado; nada
    // recebe default oculto — o contrato completo vai como digitado.
    const validation = validateIndicatorVersionForm(novo);
    if (!validation.ok) {
      alertDialog('Cadastro incompleto', validation.message);
      return;
    }
    setBusy(true);
    const res = await createIndicator(code.trim(), name.trim(), {
      ...validation.value, effectiveFrom: hoje(),
    });
    setBusy(false);
    if (!res.ok) {
      alertDialog('Não foi possível criar', res.message);
      return;
    }
    setCode('');
    setName('');
    setNovo(CONTRATO_VAZIO);
  }

  /**
   * Abre a nova versão PRÉ-PREENCHIDA com o contrato vigente. Antes este botão
   * gravava direto essa mesma cópia, sem perguntar nada: a versão nascia idêntica
   * à anterior e não havia como versionar de fato — só como duplicar.
   */
  function openVersion(ind: AdminIndicator) {
    const last = ind.versions[ind.versions.length - 1];
    setIdentityOf(null);
    setVersionOf(ind.id);
    setVersionDraft({
      unit: last?.unit ?? '%',
      direction: last?.direction ?? 'higher_better',
      target: last === undefined ? '' : String(last.target),
      yellowTolerance: last === undefined ? '' : String(last.yellowTolerance),
      weight: last === undefined ? '' : String(last.weight),
    });
    setEffectiveFrom(hoje());
  }

  async function submitVersion(indicatorId: string) {
    const validation = validateIndicatorVersionForm(versionDraft);
    if (!validation.ok) {
      alertDialog('Versão incompleta', validation.message);
      return;
    }
    setBusy(true);
    const res = await addIndicatorVersion(indicatorId, { ...validation.value, effectiveFrom: effectiveFrom.trim() });
    setBusy(false);
    if (!res.ok) {
      alertDialog('Não foi possível criar a versão', res.message);
      return;
    }
    setVersionOf(null);
  }

  function openIdentity(ind: AdminIndicator) {
    setVersionOf(null);
    setIdentityOf(ind.id);
    setIdentityCode(ind.code);
    setIdentityName(ind.name);
  }

  async function submitIdentity(indicatorId: string) {
    if (!identityCode.trim() || !identityName.trim()) {
      alertDialog('Campos obrigatórios', 'Informe código e nome do indicador.');
      return;
    }
    setBusy(true);
    const res = await updateIndicator(indicatorId, identityCode.trim(), identityName.trim());
    setBusy(false);
    // A mensagem do servidor nomeia o código em conflito ou explica a recusa por
    // uso — mostrar texto próprio aqui esconderia o que resolve o problema.
    if (!res.ok) {
      alertDialog('Não foi possível salvar', res.message);
      return;
    }
    setIdentityOf(null);
  }

  async function tryRemove(indicatorId: string) {
    const res = await removeIndicator(indicatorId);
    if (!res.ok) alertDialog('Exclusão bloqueada', res.message);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo indicador</Text>
        <TextInput value={code} onChangeText={setCode} placeholder="Código (ex.: IND-050)" placeholderTextColor={colors.neutral} autoCapitalize="characters" style={styles.input} />
        <TextInput value={name} onChangeText={setName} placeholder="Nome do indicador" placeholderTextColor={colors.neutral} style={styles.input} />
        <ContractFields draft={novo} onChange={(patch) => setNovo((prev) => ({ ...prev, ...patch }))} />
        <AppButton title="Criar indicador" onPress={() => void submit()} loading={busy} style={styles.mt} />
      </View>

      <Text style={styles.listTitle}>{indicators.length} indicador(es)</Text>
      {indicators.length ? indicators.map((ind) => {
        const last = ind.versions[ind.versions.length - 1];
        return (
          <View key={ind.id} style={styles.card}>
            <View style={styles.indHeader}>
              <View style={styles.flex}>
                <Text style={styles.indCode}>{ind.code}</Text>
                <Text style={styles.indName}>{ind.name}</Text>
              </View>
              <View style={[styles.lifeBadge, ind.lifecycle === 'active' ? styles.statusOn : styles.statusOff]}>
                <Text style={[styles.statusToggleText, { color: ind.lifecycle === 'active' ? colors.success : colors.inkMuted }]}>{ind.lifecycle === 'active' ? 'Ativo' : 'Inativo'}</Text>
              </View>
            </View>
            <Text style={styles.indMeta}>v{last?.versionNumber ?? 1} · {last?.unit} · {last?.direction === 'lower_better' ? 'menor é melhor' : 'maior é melhor'} · meta {last?.target} · tol. {last?.yellowTolerance}% da meta · prioridade {last?.weight} · {ind.versions.length} versão(ões) · {ind.usageCount} uso(s)</Text>
            <View style={styles.indActions}>
              <AppButton title={versionOf === ind.id ? 'Cancelar versão' : 'Nova versão'} compact variant="secondary" onPress={() => (versionOf === ind.id ? setVersionOf(null) : openVersion(ind))} style={styles.flex} />
              <AppButton title={identityOf === ind.id ? 'Cancelar edição' : 'Editar'} compact variant="secondary" onPress={() => (identityOf === ind.id ? setIdentityOf(null) : openIdentity(ind))} style={styles.flex} />
              {ind.lifecycle === 'active' && <AppButton title="Inativar" compact variant="secondary" onPress={() => void deactivateIndicator(ind.id)} style={styles.flex} />}
              <AppButton title="Excluir" compact variant="danger" onPress={() => void tryRemove(ind.id)} style={styles.flex} />
            </View>

            {identityOf === ind.id && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Corrigir código e nome</Text>
                <Text style={styles.panelHint}>Não cria versão: código e nome são identidade e rótulo, não o contrato medido.</Text>
                <TextInput value={identityCode} onChangeText={setIdentityCode} placeholder="Código (ex.: IND-050)" placeholderTextColor={colors.neutral} autoCapitalize="characters" style={styles.input} />
                <TextInput value={identityName} onChangeText={setIdentityName} placeholder="Nome do indicador" placeholderTextColor={colors.neutral} style={styles.input} />
                <AppButton title="Salvar" onPress={() => void submitIdentity(ind.id)} loading={busy} style={styles.mt} />
              </View>
            )}

            {versionOf === ind.id && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Nova versão do contrato</Text>
                <Text style={styles.panelHint}>Começa igual à v{last?.versionNumber ?? 1}. Altere o que muda e grave — a versão anterior fica preservada no histórico.</Text>
                <ContractFields draft={versionDraft} onChange={(patch) => setVersionDraft((prev) => ({ ...prev, ...patch }))} />
                <Text style={styles.fieldLabel}>Vigência a partir de</Text>
                <TextInput value={effectiveFrom} onChangeText={setEffectiveFrom} placeholder="AAAA-MM-DD" placeholderTextColor={colors.neutral} style={styles.input} />
                <AppButton title="Gravar versão" onPress={() => void submitVersion(ind.id)} loading={busy} style={styles.mt} />
              </View>
            )}
          </View>
        );
      }) : <EmptyState title="Nenhum indicador" description="Cadastre o primeiro indicador versionado." />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.inkMuted, fontSize: 13 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  tabTextActive: { color: colors.white },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginBottom: spacing.md },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FAFAFB', paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13, marginBottom: spacing.sm },
  // Os três campos numéricos do contrato quebram em duas linhas no telefone. Com
  // `flex: 1` puro eles se espremiam além do cartão e "Peso" saía inteiramente da
  // tela em 375 px — o campo existia e não dava para alcançar.
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  numField: { flexGrow: 1, flexBasis: 120, minWidth: 120 },
  flex: { flex: 1 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: spacing.sm, marginBottom: spacing.sm },
  hint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: colors.white },
  mt: { marginTop: spacing.md },
  mb: { marginBottom: spacing.md },
  demoBanner: { backgroundColor: colors.warningSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EBD3A8', padding: spacing.lg, marginBottom: spacing.md },
  demoTitle: { color: colors.warning, fontSize: 13, fontWeight: '900', marginBottom: 6 },
  demoText: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  listTitle: { color: colors.inkMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '900', fontSize: 12 },
  rowBody: { flex: 1 },
  rowName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  rowMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  rowRole: { color: colors.primary, fontSize: 10, fontWeight: '800', marginTop: 3 },
  statusToggle: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1 },
  statusOn: { backgroundColor: colors.successSoft, borderColor: '#A9D8B8' },
  statusOff: { backgroundColor: colors.dangerSoft, borderColor: '#F1B6B6' },
  statusToggleText: { fontSize: 10, fontWeight: '900' },
  indHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  indCode: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  indName: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: 2 },
  lifeBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  indMeta: { color: colors.inkMuted, fontSize: 11, marginTop: spacing.sm },
  indActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  panel: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  panelTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  panelHint: { color: colors.inkMuted, fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
});
