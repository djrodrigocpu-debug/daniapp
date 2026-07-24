/**
 * Seção Admin "Parceiros AACE" (AAPEx v2) — somente ADMIN (a aba Admin já é
 * restrita pela navegação; a autoridade real é a RLS/RPC no servidor).
 *
 * Lista, busca, filtros (região/coordenação/GC), criação, edição,
 * ativação/inativação (sem exclusão física) e importação de planilha com
 * simulação obrigatória. Problemas de vínculo (parceiro sem GC, coordenação
 * sem coordenador) ficam visíveis na listagem.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { useAdmin } from '../../context/AdminProvider';
import { AdminPartner, PartnerInput } from '../../data/repositories/PartnersRepository';
import { normalizeKey } from '../../domain/partners/normalize';
import { colors, radius, spacing } from '../../theme';
import { PartnerImportFlow } from './PartnerImportFlow';

const EMPTY_FORM = {
  partnerName: '',
  officeName: '',
  city: '',
  state: 'PR' as 'PR' | 'SC',
  unitName: '',
  coordinationName: '',
  managerEmail: '',
};

type FormState = typeof EMPTY_FORM;

function distinct(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ''))].sort();
}

export function PartnersSection() {
  const { partners, createPartner, updatePartner } = useAdmin();
  const [search, setSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterCoordination, setFilterCoordination] = useState<string | null>(null);
  const [filterManager, setFilterManager] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importVisible, setImportVisible] = useState(false);

  const regions = useMemo(() => distinct(partners.map((p) => p.regionName)), [partners]);
  const coordinations = useMemo(() => distinct(partners.map((p) => p.coordinationName)), [partners]);
  const managers = useMemo(() => distinct(partners.map((p) => p.managerName)), [partners]);
  const linkProblems = useMemo(
    () => partners.filter((p) => p.managerMissing || p.coordinatorMissing).length,
    [partners],
  );

  const filtered = useMemo(() => {
    const key = normalizeKey(search);
    return partners.filter((p) => {
      if (filterRegion && p.regionName !== filterRegion) return false;
      if (filterCoordination && p.coordinationName !== filterCoordination) return false;
      if (filterManager && p.managerName !== filterManager) return false;
      if (key === '') return true;
      return [p.officeName, p.partnerName, p.city].some((v) => normalizeKey(v).includes(key));
    });
  }, [partners, search, filterRegion, filterCoordination, filterManager]);

  function startEdit(partner: AdminPartner) {
    setEditingId(partner.id);
    setForm({
      partnerName: partner.partnerName,
      officeName: partner.officeName,
      city: partner.city,
      state: partner.state,
      unitName: partner.unitName,
      coordinationName: partner.coordinationName,
      managerEmail: partner.managerEmail ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit() {
    setBusy(true);
    const input: PartnerInput = {
      partnerName: form.partnerName,
      officeName: form.officeName,
      city: form.city,
      state: form.state,
      unitName: form.unitName || undefined,
      coordinationName: form.coordinationName || undefined,
      managerEmail: form.managerEmail,
    };
    const res = editingId ? await updatePartner(editingId, input) : await createPartner(input);
    setBusy(false);
    if (!res.ok) {
      Alert.alert(editingId ? 'Não foi possível salvar' : 'Não foi possível criar', res.message);
      return;
    }
    cancelEdit();
  }

  async function toggleActive(partner: AdminPartner) {
    const res = await updatePartner(partner.id, { active: !partner.active });
    if (!res.ok) Alert.alert('Não foi possível alterar a situação', res.message);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{editingId ? 'Editar Parceiro AACE' : 'Novo Parceiro AACE'}</Text>
        <TextInput value={form.partnerName} onChangeText={(v) => setForm((f) => ({ ...f, partnerName: v }))} placeholder="Empresa parceira / razão social" placeholderTextColor={colors.neutral} style={styles.input} />
        <TextInput value={form.officeName} onChangeText={(v) => setForm((f) => ({ ...f, officeName: v }))} placeholder="Nome do escritório (identificação operacional)" placeholderTextColor={colors.neutral} style={styles.input} />
        <View style={styles.inlineRow}>
          <TextInput value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="Cidade" placeholderTextColor={colors.neutral} style={[styles.input, styles.flex]} />
          <View style={styles.stateChips}>
            {(['PR', 'SC'] as const).map((uf) => (
              <Pressable key={uf} onPress={() => setForm((f) => ({ ...f, state: uf }))} style={[styles.chip, form.state === uf && styles.chipActive]}>
                <Text style={[styles.chipText, form.state === uf && styles.chipTextActive]}>{uf}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <TextInput value={form.unitName} onChangeText={(v) => setForm((f) => ({ ...f, unitName: v }))} placeholder="Unidade (ex.: RPS)" placeholderTextColor={colors.neutral} style={styles.input} />
        <TextInput value={form.coordinationName} onChangeText={(v) => setForm((f) => ({ ...f, coordinationName: v }))} placeholder="Coordenação de vendas" placeholderTextColor={colors.neutral} style={styles.input} />
        {coordinations.length > 0 && (
          <View style={styles.chipRow}>
            {coordinations.map((c) => (
              <Pressable key={c} onPress={() => setForm((f) => ({ ...f, coordinationName: c }))} style={[styles.chip, form.coordinationName === c && styles.chipActive]}>
                <Text style={[styles.chipText, form.coordinationName === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <TextInput value={form.managerEmail} onChangeText={(v) => setForm((f) => ({ ...f, managerEmail: v }))} placeholder="E-mail do Gerente de Canal responsável" placeholderTextColor={colors.neutral} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <Text style={styles.hint}>Sem GC vinculado o parceiro é salvo como inativo. O GC precisa estar cadastrado e ativo em Usuários.</Text>
        <View style={styles.inlineRow}>
          <AppButton title={editingId ? 'Salvar alterações' : 'Criar parceiro'} onPress={() => void submit()} loading={busy} style={styles.flex} />
          {editingId && <AppButton title="Cancelar" variant="ghost" onPress={cancelEdit} style={styles.flex} />}
        </View>
      </View>

      <View style={styles.importRow}>
        <AppButton title="Importar planilha (.xlsx)" variant="secondary" onPress={() => setImportVisible(true)} style={styles.flex} />
      </View>

      {linkProblems > 0 && (
        <View style={styles.problemBanner}>
          <Text style={styles.problemText}>
            {linkProblems} parceiro(s) com problema de vínculo (sem GC ou sem coordenador definido).
          </Text>
        </View>
      )}

      <TextInput value={search} onChangeText={setSearch} placeholder="Pesquisar por escritório, empresa ou cidade" placeholderTextColor={colors.neutral} style={styles.input} />

      <FilterRow label="Região" values={regions} selected={filterRegion} onSelect={setFilterRegion} />
      <FilterRow label="Coordenação" values={coordinations} selected={filterCoordination} onSelect={setFilterCoordination} />
      <FilterRow label="GC" values={managers} selected={filterManager} onSelect={setFilterManager} />

      <Text style={styles.listTitle}>{filtered.length} Parceiro(s) AACE</Text>
      {filtered.length ? (
        filtered.map((partner) => (
          <View key={partner.id} style={styles.partnerCard}>
            <View style={styles.partnerHeader}>
              <Pressable onPress={() => startEdit(partner)} style={styles.flex}>
                <Text style={styles.partnerOffice}>{partner.officeName}</Text>
                <Text style={styles.partnerCompany}>{partner.partnerName}</Text>
              </Pressable>
              <Pressable
                onPress={() => void toggleActive(partner)}
                style={[styles.statusToggle, partner.active ? styles.statusOn : styles.statusOff]}
              >
                <Text style={[styles.statusText, { color: partner.active ? colors.success : colors.danger }]}>
                  {partner.active ? 'Ativo' : 'Inativo'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.partnerMeta}>
              {partner.city}/{partner.state} · {partner.coordinationName || 'sem coordenação'} · {partner.unitName}
            </Text>
            <Text style={styles.partnerMeta}>
              GC: {partner.managerName ?? '—'}{partner.coordinatorName ? ` · Coordenador: ${partner.coordinatorName}` : ''}
            </Text>
            <View style={styles.badgeRow}>
              {partner.managerMissing && <Badge text="Sem GC vinculado" />}
              {partner.coordinatorMissing && <Badge text="Coordenação sem coordenador" />}
            </View>
          </View>
        ))
      ) : (
        <EmptyState
          title="Nenhum Parceiro AACE"
          description="Cadastre o primeiro parceiro ou importe a planilha do canal."
        />
      )}

      <PartnerImportFlow visible={importVisible} onClose={() => setImportVisible(false)} />
    </View>
  );
}

function FilterRow({ label, values, selected, onSelect }: {
  label: string;
  values: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  if (values.length === 0) return null;
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chipRow}>
        <Pressable onPress={() => onSelect(null)} style={[styles.chip, selected === null && styles.chipActive]}>
          <Text style={[styles.chipText, selected === null && styles.chipTextActive]}>Todas</Text>
        </Pressable>
        {values.map((v) => (
          <Pressable key={v} onPress={() => onSelect(selected === v ? null : v)} style={[styles.chip, selected === v && styles.chipActive]}>
            <Text style={[styles.chipText, selected === v && styles.chipTextActive]}>{v}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900', marginBottom: spacing.md },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FAFAFB', paddingHorizontal: spacing.md, color: colors.ink, fontSize: 13, marginBottom: spacing.sm },
  inlineRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
  stateChips: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: colors.white },
  hint: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, marginBottom: spacing.md },
  importRow: { marginBottom: spacing.md },
  problemBanner: { backgroundColor: colors.warningSoft, borderRadius: radius.md, borderWidth: 1, borderColor: '#EBD3A8', padding: spacing.md, marginBottom: spacing.md },
  problemText: { color: colors.warning, fontSize: 12, fontWeight: '800' },
  filterRow: { marginBottom: spacing.xs },
  filterLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  listTitle: { color: colors.inkMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.sm, marginBottom: spacing.md },
  partnerCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  partnerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  partnerOffice: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  partnerCompany: { color: colors.inkMuted, fontSize: 11, marginTop: 2 },
  partnerMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 4 },
  statusToggle: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1 },
  statusOn: { backgroundColor: colors.successSoft, borderColor: '#A9D8B8' },
  statusOff: { backgroundColor: colors.dangerSoft, borderColor: '#F1B6B6' },
  statusText: { fontSize: 10, fontWeight: '900' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  badge: { backgroundColor: colors.dangerSoft, borderRadius: radius.pill, borderWidth: 1, borderColor: '#F1B6B6', paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { color: colors.danger, fontSize: 9, fontWeight: '900' },
});
