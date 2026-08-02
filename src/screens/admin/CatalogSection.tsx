/**
 * Fundação administrativa do CATÁLOGO COM ESCOPO (AAPEx 1.3.5, decisão A-08).
 *
 * O QUE ESTA TELA É. O mínimo para operar a decisão: listar temas e indicadores
 * separando global de regional, criar conteúdo regional, configurar um indicador
 * numa região, marcar os dois módulos e cadastrar critérios.
 *
 * O QUE ELA NÃO É. Não é a Gestão Assistida, não é a Auditoria Mensal, não é o
 * Dashboard nem a exportação. Nada disso entra nesta unidade.
 *
 * A INTERFACE NÃO É BARREIRA. Ela espelha `canManageCatalog` para não oferecer o
 * que seria recusado, e antecipa os bloqueios de publicação com `publishBlocks`
 * para que o operador leia o motivo antes de tentar. Quem recusa continua sendo
 * o servidor — e quando ele recusa, a mensagem dele é exibida crua.
 *
 * Acessibilidade (achados O-12/O-13): todo controle é `Pressable` com
 * `accessibilityRole` e rótulo; nada depende de um `View` clicável sem semântica.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { alertDialog } from '../../utils/dialog';
import { useAuth } from '../../context/AuthProvider';
import { useRepositories } from '../../data/repositories/RepositoryProvider';
import { colors, radius, spacing } from '../../theme';
import { subjectFromSession } from '../../domain/auth/session';
import { AuthzSubject } from '../../domain/authz/policy';
import {
  canManageCatalog,
  describePublishBlock,
  publishBlocks,
} from '../../domain/catalog/policy';
import {
  AuditCriterion,
  CatalogIndicator,
  CatalogScope,
  RegionalConfig,
  REGIONAL_CONFIG_DEFAULTS,
  Theme,
  ThemeVersion,
} from '../../domain/catalog/types';
import { CatalogRegion } from '../../domain/repositories/catalog';
import { IndicatorDirection } from '../../domain/model';

type Tab = 'temas' | 'indicadores' | 'configuracao';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'temas', label: 'Temas' },
  { key: 'indicadores', label: 'Indicadores' },
  { key: 'configuracao', label: 'Configuração da região' },
];

const DIRECTIONS: Array<{ value: IndicatorDirection; label: string }> = [
  { value: 'higher_better', label: 'Maior é melhor' },
  { value: 'lower_better', label: 'Menor é melhor' },
  // `target_band` fica FORA da criação: sem A-01 não há regra de status, e
  // oferecer a opção seria convidar o operador a criar algo impublicável na
  // Gestão Assistida. O valor continua existindo no enum, para o histórico.
];

const EMPTY_SUBJECT: AuthzSubject = {
  userId: '', roles: [], regionIds: [], coordinationIds: [], assignedOperationIds: [],
};

export function CatalogSection() {
  const { catalog } = useRepositories();
  const { state } = useAuth();
  const [tab, setTab] = useState<Tab>('temas');
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [indicators, setIndicators] = useState<CatalogIndicator[]>([]);
  const [configs, setConfigs] = useState<RegionalConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const subject = useMemo(
    () => (state.session
      ? subjectFromSession(
        {
          userId: state.session.user.id,
          scopes: state.session.scopes,
          accessTokenExpiresAt: state.session.accessTokenExpiresAt,
        },
        new Date().toISOString(),
      )
      : EMPTY_SUBJECT),
    [state.session],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const [regionsResult, themesResult, indicatorsResult] = await Promise.all([
      catalog.listRegions(), catalog.listThemes(), catalog.listIndicators(),
    ]);

    // Uma recusa de leitura aqui não é lista vazia: é ausência de catálogo. O
    // adapter do modo demonstração recusa de propósito, e a tela diz isso.
    if (!regionsResult.ok) {
      setUnavailable(regionsResult.error.message);
      setLoading(false);
      return;
    }
    setUnavailable(null);
    setRegions(regionsResult.value);
    setThemes(themesResult.ok ? themesResult.value : []);
    setIndicators(indicatorsResult.ok ? indicatorsResult.value : []);

    const alvo = regionId
      ?? regionsResult.value.find((r) => canManageCatalog(subject, r.id))?.id
      ?? regionsResult.value[0]?.id
      ?? null;
    setRegionId(alvo);
    if (alvo) {
      const cfg = await catalog.listRegionalConfigs(alvo);
      setConfigs(cfg.ok ? cfg.value : []);
    } else {
      setConfigs([]);
    }
    setLoading(false);
  }, [catalog, regionId, subject]);

  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [catalog]);

  const trocarRegiao = useCallback(async (id: string) => {
    setRegionId(id);
    const cfg = await catalog.listRegionalConfigs(id);
    setConfigs(cfg.ok ? cfg.value : []);
  }, [catalog]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Carregando catálogo…</Text>
      </View>
    );
  }

  if (unavailable) {
    return (
      <EmptyState
        title="Catálogo indisponível neste ambiente"
        description={unavailable}
      />
    );
  }

  const podeGerirRegiao = regionId !== null && canManageCatalog(subject, regionId);
  const podeGerirGlobal = canManageCatalog(subject, null);

  return (
    <View style={styles.wrapper}>
      <RegionPicker
        regions={regions}
        selected={regionId}
        subject={subject}
        onSelect={trocarRegiao}
      />

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
            accessibilityLabel={t.label}
            focusable
            tabIndex={0}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'temas' && (
        <ThemesTab
          themes={themes} regionId={regionId} subject={subject}
          podeGerirGlobal={podeGerirGlobal} podeGerirRegiao={podeGerirRegiao} onChanged={reload}
        />
      )}
      {tab === 'indicadores' && (
        <IndicatorsTab
          indicators={indicators} regionId={regionId} subject={subject}
          podeGerirGlobal={podeGerirGlobal} podeGerirRegiao={podeGerirRegiao} onChanged={reload}
        />
      )}
      {tab === 'configuracao' && (
        <ConfigurationTab
          regionId={regionId} themes={themes} indicators={indicators} configs={configs}
          podeGerir={podeGerirRegiao} onChanged={reload}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

function RegionPicker({ regions, selected, subject, onSelect }: {
  regions: CatalogRegion[];
  selected: string | null;
  subject: AuthzSubject;
  onSelect: (id: string) => void;
}) {
  if (regions.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Região</Text>
      <Text style={styles.hint}>
        A configuração operacional é sempre de uma região. Um indicador global não fica ativo em
        região nenhuma só por existir.
      </Text>
      <View style={styles.chips}>
        {regions.map((r) => {
          const gere = canManageCatalog(subject, r.id);
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === r.id }}
              accessibilityLabel={`Região ${r.name}${gere ? '' : ' (somente leitura)'}`}
              focusable
              tabIndex={0}
              onPress={() => onSelect(r.id)}
              style={[styles.chip, selected === r.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, selected === r.id && styles.chipTextActive]}>
                {r.name}{gere ? '' : ' · leitura'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ScopeBadge({ scope }: { scope: CatalogScope }) {
  const global = scope.kind === 'global';
  return (
    <View style={[styles.badge, global ? styles.badgeGlobal : styles.badgeRegional]}>
      <Text style={[styles.badgeText, global ? styles.badgeTextGlobal : styles.badgeTextRegional]}>
        {global ? 'Global' : 'Regional'}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  return (
    <View style={[styles.badge, status === 'published' ? styles.badgePublished : styles.badgeDraft]}>
      <Text style={[styles.badgeText, status === 'published' ? styles.badgeTextPublished : styles.badgeTextDraft]}>
        {status === 'published' ? 'Publicada' : 'Rascunho'}
      </Text>
    </View>
  );
}

/** Aplica o resultado e recarrega; a mensagem do servidor vai crua para o operador. */
async function aplicar<T>(
  promise: Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>,
  sucesso: string,
  onChanged: () => void,
): Promise<void> {
  const result = await promise;
  if (!result.ok) {
    alertDialog('Operação recusada', result.error.message);
    return;
  }
  alertDialog(sucesso);
  onChanged();
}

// ---------------------------------------------------------------------------

function ThemesTab({ themes, regionId, subject, podeGerirGlobal, podeGerirRegiao, onChanged }: {
  themes: Theme[];
  regionId: string | null;
  subject: AuthzSubject;
  podeGerirGlobal: boolean;
  podeGerirRegiao: boolean;
  onChanged: () => void;
}) {
  const { catalog } = useRepositories();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [escopo, setEscopo] = useState<'global' | 'regional'>(podeGerirGlobal ? 'global' : 'regional');
  const [salvando, setSalvando] = useState(false);

  const podeCriar = escopo === 'global' ? podeGerirGlobal : podeGerirRegiao && regionId !== null;

  async function criar() {
    setSalvando(true);
    await aplicar(
      catalog.createTheme(escopo, escopo === 'regional' ? regionId : null, code, { name }),
      'Tema criado em rascunho. Publique a versão para que ele possa ser usado.',
      () => { setCode(''); setName(''); onChanged(); },
    );
    setSalvando(false);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo tema</Text>
        <View style={styles.chips}>
          {(['global', 'regional'] as const).map((k) => {
            const habilitado = k === 'global' ? podeGerirGlobal : podeGerirRegiao;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: escopo === k, disabled: !habilitado }}
                accessibilityLabel={k === 'global' ? 'Escopo global' : 'Escopo regional'}
                focusable={habilitado}
                tabIndex={habilitado ? 0 : -1}
                disabled={!habilitado}
                onPress={() => setEscopo(k)}
                style={[styles.chip, escopo === k && styles.chipActive, !habilitado && styles.chipDisabled]}
              >
                <Text style={[styles.chipText, escopo === k && styles.chipTextActive]}>
                  {k === 'global' ? 'Global' : 'Desta região'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!podeGerirGlobal && (
          <Text style={styles.hint}>
            O catálogo global é administrado pelo Administrador. Você administra o conteúdo da sua região.
          </Text>
        )}
        <TextInput
          style={styles.input} value={code} onChangeText={setCode}
          placeholder="Código (ex.: TEMA-003)" accessibilityLabel="Código do tema"
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input} value={name} onChangeText={setName}
          placeholder="Nome do tema" accessibilityLabel="Nome do tema"
        />
        <AppButton
          title="Criar tema" onPress={criar} loading={salvando}
          disabled={!podeCriar || code.trim() === '' || name.trim() === ''}
        />
      </View>

      {themes.length === 0 ? (
        <EmptyState title="Nenhum tema" description="Crie o primeiro tema global ou regional." />
      ) : themes.map((t) => (
        <View key={t.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.itemTitle}>{t.code}</Text>
            <ScopeBadge scope={t.scope} />
          </View>
          {t.versions.map((v: ThemeVersion) => (
            <View key={v.id} style={styles.versionRow}>
              <View style={styles.versionInfo}>
                <Text style={styles.versionName}>v{v.versionNumber} · {v.name}</Text>
                <Text style={styles.muted}>ordem {v.sortOrder}</Text>
              </View>
              <StatusBadge status={v.status} />
              {v.status === 'draft' && canManageCatalog(subject, t.scope.kind === 'regional' ? t.scope.regionId : null) && (
                <AppButton
                  compact variant="secondary" title="Publicar"
                  onPress={() => aplicar(catalog.publishThemeVersion(v.id), 'Versão publicada.', onChanged)}
                />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

function IndicatorsTab({ indicators, regionId, subject, podeGerirGlobal, podeGerirRegiao, onChanged }: {
  indicators: CatalogIndicator[];
  regionId: string | null;
  subject: AuthzSubject;
  podeGerirGlobal: boolean;
  podeGerirRegiao: boolean;
  onChanged: () => void;
}) {
  const { catalog } = useRepositories();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('%');
  const [direction, setDirection] = useState<IndicatorDirection>('higher_better');
  const [escopo, setEscopo] = useState<'global' | 'regional'>(podeGerirGlobal ? 'global' : 'regional');
  const [salvando, setSalvando] = useState(false);

  const podeCriar = escopo === 'global' ? podeGerirGlobal : podeGerirRegiao && regionId !== null;

  async function criar() {
    setSalvando(true);
    await aplicar(
      catalog.createIndicator(escopo, escopo === 'regional' ? regionId : null, code, { name, unit, direction }),
      'Indicador criado em rascunho. Publique a versão e depois configure-o na região.',
      () => { setCode(''); setName(''); onChanged(); },
    );
    setSalvando(false);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Novo indicador</Text>
        <Text style={styles.hint}>
          A definição diz o QUE o indicador é. Meta, tolerância, peso, tema e ordem são decisão de
          cada região, na aba "Configuração da região".
        </Text>
        <View style={styles.chips}>
          {(['global', 'regional'] as const).map((k) => {
            const habilitado = k === 'global' ? podeGerirGlobal : podeGerirRegiao;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: escopo === k, disabled: !habilitado }}
                accessibilityLabel={k === 'global' ? 'Escopo global' : 'Escopo regional'}
                focusable={habilitado}
                tabIndex={habilitado ? 0 : -1}
                disabled={!habilitado}
                onPress={() => setEscopo(k)}
                style={[styles.chip, escopo === k && styles.chipActive, !habilitado && styles.chipDisabled]}
              >
                <Text style={[styles.chipText, escopo === k && styles.chipTextActive]}>
                  {k === 'global' ? 'Global' : 'Desta região'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={styles.input} value={code} onChangeText={setCode}
          placeholder="Código (ex.: IND-013)" accessibilityLabel="Código do indicador"
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input} value={name} onChangeText={setName}
          placeholder="Nome do indicador" accessibilityLabel="Nome do indicador"
        />
        <TextInput
          style={styles.input} value={unit} onChangeText={setUnit}
          placeholder="Unidade (ex.: %)" accessibilityLabel="Unidade do indicador"
        />
        <View style={styles.chips}>
          {DIRECTIONS.map((d) => (
            <Pressable
              key={d.value}
              accessibilityRole="button"
              accessibilityState={{ selected: direction === d.value }}
              accessibilityLabel={d.label}
              focusable
              tabIndex={0}
              onPress={() => setDirection(d.value)}
              style={[styles.chip, direction === d.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, direction === d.value && styles.chipTextActive]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>
        <AppButton
          title="Criar indicador" onPress={criar} loading={salvando}
          disabled={!podeCriar || code.trim() === '' || name.trim() === ''}
        />
      </View>

      {indicators.length === 0 ? (
        <EmptyState title="Nenhum indicador" description="Nenhum indicador alcançável neste escopo." />
      ) : indicators.map((i) => (
        <View key={i.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.itemTitle}>{i.code} · {i.name}</Text>
            <ScopeBadge scope={i.scope} />
          </View>
          {i.versions.map((v) => (
            <View key={v.id} style={styles.versionRow}>
              <View style={styles.versionInfo}>
                <Text style={styles.versionName}>v{v.versionNumber} · {v.name}</Text>
                <Text style={styles.muted}>{v.unit} · {v.direction}</Text>
              </View>
              <StatusBadge status={v.status} />
              {v.status === 'draft' && canManageCatalog(subject, i.scope.kind === 'regional' ? i.scope.regionId : null) && (
                <AppButton
                  compact variant="secondary" title="Publicar"
                  onPress={() => aplicar(catalog.publishIndicatorVersion(v.id), 'Versão publicada.', onChanged)}
                />
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

function ConfigurationTab({ regionId, themes, indicators, configs, podeGerir, onChanged }: {
  regionId: string | null;
  themes: Theme[];
  indicators: CatalogIndicator[];
  configs: RegionalConfig[];
  podeGerir: boolean;
  onChanged: () => void;
}) {
  const { catalog } = useRepositories();
  const [indicadorId, setIndicadorId] = useState<string | null>(null);
  const [temaVersaoId, setTemaVersaoId] = useState<string | null>(null);
  const [target, setTarget] = useState('0');
  const [tolerance, setTolerance] = useState(String(REGIONAL_CONFIG_DEFAULTS.tolerance));
  const [weight, setWeight] = useState(String(REGIONAL_CONFIG_DEFAULTS.weight));
  // `boolean` explícito: os defaults são `as const`, e sem a anotação o estado
  // ficaria com o tipo literal `true`/`false` e o Switch não poderia alterná-lo.
  const [assistida, setAssistida] = useState<boolean>(REGIONAL_CONFIG_DEFAULTS.includeInAssistedManagement);
  const [mensal, setMensal] = useState<boolean>(REGIONAL_CONFIG_DEFAULTS.includeInMonthlyAudit);
  const [salvando, setSalvando] = useState(false);

  /** Só entram versões PUBLICADAS: rascunho não sustenta operação. */
  const indicadoresPublicados = useMemo(
    () => indicators
      .map((i) => ({ indicador: i, versao: [...i.versions].reverse().find((v) => v.status === 'published') }))
      .filter((x): x is { indicador: CatalogIndicator; versao: CatalogIndicator['versions'][number] } => !!x.versao),
    [indicators],
  );
  const temasPublicados = useMemo(
    () => themes
      .map((t) => ({ tema: t, versao: [...t.versions].reverse().find((v) => v.status === 'published' && v.active) }))
      .filter((x): x is { tema: Theme; versao: ThemeVersion } => !!x.versao),
    [themes],
  );

  const escolhido = indicadoresPublicados.find((x) => x.indicador.id === indicadorId) ?? null;
  const temaEscolhido = temasPublicados.find((x) => x.versao.id === temaVersaoId) ?? null;
  const configExistente = configs.find((c) => c.indicatorDefinitionId === indicadorId) ?? null;

  const bloqueios = escolhido && temaEscolhido
    ? publishBlocks(
      { includeInAssistedManagement: assistida, includeInMonthlyAudit: mensal },
      {
        direction: escolhido.versao.direction,
        indicatorVersionPublished: true,
        themeVersionPublished: true,
        criteria: configExistente?.criteria ?? [],
      },
    )
    : [];

  if (regionId === null) {
    return <EmptyState title="Sem região" description="Nenhuma região disponível para configurar." />;
  }

  async function salvarRascunho() {
    if (!escolhido || !temaEscolhido) return;
    setSalvando(true);
    await aplicar(
      catalog.saveRegionalConfigDraft(regionId!, escolhido.indicador.id, {
        indicatorVersionId: escolhido.versao.id,
        themeVersionId: temaEscolhido.versao.id,
        target: Number(target) || 0,
        tolerance: Number(tolerance) || 0,
        weight: Number(weight) || 1,
        includeInAssistedManagement: assistida,
        includeInMonthlyAudit: mensal,
      }),
      'Rascunho salvo. Publique quando estiver correto.',
      onChanged,
    );
    setSalvando(false);
  }

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Configurar indicador nesta região</Text>
        {!podeGerir && (
          <Text style={styles.hint}>
            Você consulta esta região, mas não a administra. As ações abaixo ficam indisponíveis.
          </Text>
        )}

        <Text style={styles.label}>Indicador (versões publicadas)</Text>
        <View style={styles.chips}>
          {indicadoresPublicados.map(({ indicador, versao }) => (
            <Pressable
              key={indicador.id}
              accessibilityRole="button"
              accessibilityState={{ selected: indicadorId === indicador.id }}
              accessibilityLabel={`Indicador ${indicador.code}`}
              focusable
              tabIndex={0}
              onPress={() => setIndicadorId(indicador.id)}
              style={[styles.chip, indicadorId === indicador.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, indicadorId === indicador.id && styles.chipTextActive]}>
                {indicador.code} · v{versao.versionNumber}
              </Text>
            </Pressable>
          ))}
        </View>
        {indicadoresPublicados.length === 0 && (
          <Text style={styles.hint}>Nenhuma versão de indicador publicada ainda.</Text>
        )}

        <Text style={styles.label}>Tema (versões publicadas)</Text>
        <View style={styles.chips}>
          {temasPublicados.map(({ tema, versao }) => (
            <Pressable
              key={versao.id}
              accessibilityRole="button"
              accessibilityState={{ selected: temaVersaoId === versao.id }}
              accessibilityLabel={`Tema ${tema.code}`}
              focusable
              tabIndex={0}
              onPress={() => setTemaVersaoId(versao.id)}
              style={[styles.chip, temaVersaoId === versao.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, temaVersaoId === versao.id && styles.chipTextActive]}>
                {tema.code} · v{versao.versionNumber}
              </Text>
            </Pressable>
          ))}
        </View>
        {temasPublicados.length === 0 && (
          <Text style={styles.hint}>Nenhuma versão de tema publicada ainda.</Text>
        )}

        <View style={styles.inline}>
          <View style={styles.inlineField}>
            <Text style={styles.label}>Meta</Text>
            <TextInput style={styles.input} value={target} onChangeText={setTarget}
              keyboardType="numeric" accessibilityLabel="Meta" />
          </View>
          <View style={styles.inlineField}>
            <Text style={styles.label}>Tolerância</Text>
            <TextInput style={styles.input} value={tolerance} onChangeText={setTolerance}
              keyboardType="numeric" accessibilityLabel="Tolerância" />
          </View>
          <View style={styles.inlineField}>
            <Text style={styles.label}>Peso</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight}
              keyboardType="numeric" accessibilityLabel="Peso" />
          </View>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Gestão Assistida (semanal)</Text>
          <Switch value={assistida} onValueChange={setAssistida} accessibilityLabel="Participa da Gestão Assistida" />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auditoria Mensal (processo)</Text>
          <Switch value={mensal} onValueChange={setMensal} accessibilityLabel="Participa da Auditoria Mensal" />
        </View>

        {bloqueios.map((b) => (
          <View key={b.reason} style={styles.blockBox}>
            <Text style={styles.blockText}>{describePublishBlock(b)}</Text>
          </View>
        ))}

        <AppButton
          title="Salvar rascunho" onPress={salvarRascunho} loading={salvando}
          disabled={!podeGerir || !escolhido || !temaEscolhido}
        />
      </View>

      {configs.length === 0 ? (
        <EmptyState
          title="Nenhum indicador configurado"
          description="Nenhum indicador foi adotado por esta região ainda. Existir no catálogo não ativa nada."
        />
      ) : configs.map((c) => (
        <ConfigCard key={c.id} config={c} podeGerir={podeGerir} onChanged={onChanged} />
      ))}
    </View>
  );
}

function ConfigCard({ config, podeGerir, onChanged }: {
  config: RegionalConfig;
  podeGerir: boolean;
  onChanged: () => void;
}) {
  const { catalog } = useRepositories();
  const [code, setCode] = useState('');
  const [question, setQuestion] = useState('');

  const ultima = config.versions[config.versions.length - 1];

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.itemTitle}>{config.indicatorCode || 'Indicador'}</Text>
        {ultima && <StatusBadge status={ultima.status} />}
      </View>

      {config.versions.map((v) => (
        <View key={v.id} style={styles.versionRow}>
          <View style={styles.versionInfo}>
            <Text style={styles.versionName}>
              v{v.versionNumber} · meta {v.target} · tol. {v.tolerance} · peso {v.weight}
            </Text>
            <Text style={styles.muted}>
              {v.includeInAssistedManagement ? 'Gestão Assistida' : 'fora da Gestão Assistida'}
              {' · '}
              {v.includeInMonthlyAudit ? 'Auditoria Mensal' : 'fora da Auditoria Mensal'}
            </Text>
          </View>
          <StatusBadge status={v.status} />
          {v.status === 'draft' && podeGerir && (
            <AppButton
              compact variant="secondary" title="Publicar"
              onPress={() => aplicar(
                catalog.publishRegionalConfigVersion(v.id),
                'Configuração publicada.',
                onChanged,
              )}
            />
          )}
        </View>
      ))}

      <Text style={styles.label}>Critérios de processo (Auditoria Mensal)</Text>
      {config.criteria.length === 0 && (
        <Text style={styles.hint}>
          Nenhum critério. Marcar Auditoria Mensal exige ao menos um critério publicado e ativo.
        </Text>
      )}
      {config.criteria.map((cr: AuditCriterion) => (
        <View key={cr.id} style={styles.versionRow}>
          <View style={styles.versionInfo}>
            <Text style={styles.versionName}>{cr.code}</Text>
            <Text style={styles.muted} numberOfLines={2}>
              {cr.versions[cr.versions.length - 1]?.question ?? ''}
            </Text>
          </View>
          {cr.versions.filter((v) => v.status === 'draft').map((v) => (
            podeGerir ? (
              <AppButton
                key={v.id} compact variant="secondary" title={`Publicar v${v.versionNumber}`}
                onPress={() => aplicar(catalog.publishCriterionVersion(v.id), 'Critério publicado.', onChanged)}
              />
            ) : null
          ))}
        </View>
      ))}

      {podeGerir && (
        <View style={styles.criterionForm}>
          <TextInput
            style={styles.input} value={code} onChangeText={setCode}
            placeholder="Código do critério (ex.: CRIT-01)" accessibilityLabel="Código do critério"
            autoCapitalize="characters"
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]} value={question} onChangeText={setQuestion}
            placeholder="Pergunta de processo (a rotina existe e é executada?)"
            accessibilityLabel="Pergunta do critério" multiline
          />
          <AppButton
            compact title="Adicionar critério"
            disabled={code.trim() === '' || question.trim() === ''}
            onPress={() => aplicar(
              catalog.createCriterion(config.id, code, { question }),
              'Critério criado em rascunho.',
              () => { setCode(''); setQuestion(''); onChanged(); },
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.md },
  center: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: spacing.xs },
  hint: { fontSize: 12, color: colors.inkMuted, lineHeight: 17 },
  muted: { fontSize: 12, color: colors.inkMuted },
  tabs: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  tab: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.inkMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  badge: { paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeGlobal: { backgroundColor: colors.infoSoft },
  badgeTextGlobal: { color: colors.info },
  badgeRegional: { backgroundColor: colors.warningSoft },
  badgeTextRegional: { color: colors.warning },
  badgePublished: { backgroundColor: colors.successSoft },
  badgeTextPublished: { color: colors.success },
  badgeDraft: { backgroundColor: colors.background },
  badgeTextDraft: { color: colors.inkMuted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  versionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, flexWrap: 'wrap',
  },
  versionInfo: { flex: 1, minWidth: 160 },
  versionName: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.ink, backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: 'top' },
  inline: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  inlineField: { flex: 1, minWidth: 90 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  switchLabel: { fontSize: 13, color: colors.ink, flexShrink: 1 },
  blockBox: {
    backgroundColor: colors.warningSoft, borderRadius: radius.sm,
    padding: spacing.md, borderWidth: 1, borderColor: colors.warning,
  },
  blockText: { fontSize: 12, color: colors.warning, lineHeight: 17 },
  criterionForm: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
});
