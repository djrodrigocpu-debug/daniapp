import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OperationCard } from '../components/OperationCard';
import { EmptyState } from '../components/EmptyState';
import { AppButton } from '../components/AppButton';
import { useOperations } from '../context/OperationsProvider';
import { colors, radius, spacing } from '../theme';
import { RootStackParamList, TrafficLight } from '../types';

const filters: Array<{ value: 'all' | TrafficLight; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'green', label: 'Verdes' },
  { value: 'yellow', label: 'Amarelas' },
  { value: 'red', label: 'Vermelhas' },
];

export function OperationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { operations, loading, error, refresh } = useOperations();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | TrafficLight>('all');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return operations.filter((operation) => {
      const matchesStatus = filter === 'all' || operation.status === filter;
      const haystack = `${operation.partnerName} ${operation.officeName} ${operation.city} ${operation.state}`.toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [filter, query, operations]);

  if (loading && operations.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centeredText}>Carregando Parceiros AACE…</Text>
      </SafeAreaView>
    );
  }

  if (error && operations.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]} edges={['top', 'left', 'right']}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
        <Text style={styles.errorTitle}>Não foi possível carregar</Text>
        <Text style={styles.centeredText}>{error}</Text>
        <AppButton title="Tentar novamente" variant="secondary" onPress={refresh} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Parceiros AACE</Text>
            <Text style={styles.subtitle}>Selecione um parceiro para consultar histórico ou iniciar uma avaliação.</Text>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={20} color={colors.inkMuted} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Buscar parceiro, escritório ou cidade" placeholderTextColor={colors.neutral} style={styles.searchInput} />
            </View>
            <View style={styles.filters}>
              {filters.map((item) => (
                <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterActive]}>
                  <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.count}>{filtered.length} Parceiro(s) AACE</Text>
          </View>
        }
        renderItem={({ item }) => <OperationCard operation={item} onPress={() => navigation.navigate('OperationDetail', { operationId: item.id })} />}
        ListEmptyComponent={<EmptyState title="Nenhum Parceiro AACE encontrado" description="Ajuste a busca ou o filtro de semáforo." />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centeredText: { color: colors.inkMuted, fontSize: 13, textAlign: 'center' },
  errorTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  content: { padding: spacing.lg, paddingBottom: 36 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 13, marginTop: 5, lineHeight: 19 },
  search: { marginTop: spacing.lg, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  searchInput: { flex: 1, color: colors.ink, fontSize: 14 },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: colors.white },
  count: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', marginBottom: spacing.md },
});
