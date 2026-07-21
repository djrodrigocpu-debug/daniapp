import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { OperationsScreen } from '../screens/OperationsScreen';
import { ActionsScreen } from '../screens/ActionsScreen';
import { AgendaScreen } from '../screens/AgendaScreen';
import { ValidationsScreen } from '../screens/ValidationsScreen';
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
  const { currentUser } = useApp();
  const canValidate = currentUser?.role === 'regional' || currentUser?.role === 'coordinator';

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
            Operações: focused ? 'business' : 'business-outline',
            Agenda: focused ? 'calendar' : 'calendar-outline',
            Ações: focused ? 'flag' : 'flag-outline',
            Validações: focused ? 'shield-checkmark' : 'shield-checkmark-outline',
            Perfil: focused ? 'person-circle' : 'person-circle-outline',
          };
          return <Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Início' }} />
      <Tabs.Screen name="Operações" component={OperationsScreen} />
      <Tabs.Screen name="Agenda" component={AgendaScreen} />
      <Tabs.Screen name="Ações" component={ActionsScreen} />
      {canValidate && <Tabs.Screen name="Validações" component={ValidationsScreen} />}
      <Tabs.Screen name="Perfil" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { ready, currentUser } = useApp();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingLogo}><Text style={styles.loadingLogoText}>A</Text></View>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando AACE Excelência...</Text>
      </View>
    );
  }

  if (!currentUser) return <LoginScreen />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerTintColor: colors.ink, headerShadowVisible: false, headerStyle: { backgroundColor: colors.surface }, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="OperationDetail" component={OperationDetailScreen} options={{ title: 'Operação AACE' }} />
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
});
