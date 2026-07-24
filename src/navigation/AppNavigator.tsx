import React, { useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthProvider';
import { useOperationalUser } from '../context/useOperationalUser';
import { localStore } from '../data/store/localStore';
import { AppButton } from '../components/AppButton';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { OperationsScreen } from '../screens/OperationsScreen';
import { ActionsScreen } from '../screens/ActionsScreen';
import { AgendaScreen } from '../screens/AgendaScreen';
import { ValidationsScreen } from '../screens/ValidationsScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OperationDetailScreen } from '../screens/OperationDetailScreen';
import { EvaluationScreen } from '../screens/EvaluationScreen';
import { PerformanceScreen } from '../screens/PerformanceScreen';
import { colors } from '../theme';
import { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.ink,
    border: colors.border,
  },
};

function MainTabs() {
  const currentUser = useOperationalUser();
  const canValidate = currentUser?.role === 'regional' || currentUser?.role === 'coordinator';
  const isAdmin = currentUser?.role === 'admin';

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarStyle: { height: 68, paddingTop: 6, paddingBottom: 9, borderTopColor: colors.border, backgroundColor: colors.surface },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: focused ? 'grid' : 'grid-outline',
            Parceiros: focused ? 'business' : 'business-outline',
            Agenda: focused ? 'calendar' : 'calendar-outline',
            Ações: focused ? 'flag' : 'flag-outline',
            Validações: focused ? 'shield-checkmark' : 'shield-checkmark-outline',
            Admin: focused ? 'settings' : 'settings-outline',
            Perfil: focused ? 'person-circle' : 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Início' }} />
      <Tabs.Screen name="Parceiros" component={OperationsScreen} />
      <Tabs.Screen name="Agenda" component={AgendaScreen} />
      <Tabs.Screen name="Ações" component={ActionsScreen} />
      {canValidate && <Tabs.Screen name="Validações" component={ValidationsScreen} />}
      {isAdmin && <Tabs.Screen name="Admin" component={AdminScreen} />}
      <Tabs.Screen name="Perfil" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

/**
 * Autenticado, porém sem NENHUM papel ativo reconhecido (§7). Não aparece para
 * Administrador ativo (que é válido sem região/coordenadoria/operação) nem para
 * demais perfis com escopo — apenas quando a sessão não tem papel/escopo ativo.
 */
function NoScopeScreen() {
  const { state, signOut } = useAuth();
  return (
    <View style={styles.notice}>
      <View style={styles.loadingLogo}><Text style={styles.loadingLogoText}>A</Text></View>
      <Text style={styles.noticeTitle}>Perfil sem vínculo</Text>
      <Text style={styles.noticeBody}>
        A conta {state.session?.user.corporateEmail} está autenticada, mas ainda não possui
        um papel de acesso ativo. Solicite ao Administrador a atribuição do seu perfil.
      </Text>
      <AppButton title="Sair" variant="secondary" onPress={() => void signOut()} />
    </View>
  );
}

export function AppNavigator() {
  const { state } = useAuth();
  const ready = useSyncExternalStore(localStore.subscribe, localStore.isReady);
  const currentUser = useOperationalUser();

  // Sessão sendo restaurada ou dados locais ainda hidratando.
  if (state.status === 'initializing' || !ready) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingLogo}><Text style={styles.loadingLogoText}>A</Text></View>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando AAPEx...</Text>
      </View>
    );
  }

  // Bloqueio de navegação sem sessão corporativa (§7).
  if (state.status !== 'authenticated') return <LoginScreen />;

  // Sessão válida, mas sem identidade operacional vinculada.
  if (!currentUser) return <NoScopeScreen />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerTintColor: colors.ink, headerShadowVisible: false, headerStyle: { backgroundColor: colors.surface }, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="OperationDetail" component={OperationDetailScreen} options={{ title: 'Parceiro AACE' }} />
        <Stack.Screen name="Evaluation" component={EvaluationScreen} options={{ title: 'Auditoria' }} />
        <Stack.Screen name="Performance" component={PerformanceScreen} options={{ title: 'Visita produtiva' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 18 },
  loadingLogo: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  loadingLogoText: { color: colors.white, fontSize: 31, fontWeight: '900' },
  loadingText: { color: colors.inkMuted, fontSize: 13 },
  notice: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 16, paddingHorizontal: 32, maxWidth: 480, alignSelf: 'center' },
  noticeTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  noticeBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
