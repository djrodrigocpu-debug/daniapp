import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthProvider';
import { RepositoryProvider } from './src/data/repositories/RepositoryProvider';
import { OperationsProvider } from './src/context/OperationsProvider';
import { EvaluationsProvider } from './src/context/EvaluationsProvider';
import { ActionsProvider } from './src/context/ActionsProvider';
import { ValidationsProvider } from './src/context/ValidationsProvider';
import { AdminProvider } from './src/context/AdminProvider';
import { SyncProvider } from './src/context/SyncProvider';
import { AppNavigator } from './src/navigation/AppNavigator';
import { colors } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <View style={styles.appFrame}>
          {/* AuthProvider: sessão corporativa (§8). RepositoryProvider: camada de
              dados (Local/Supabase) + hidratação do store. Providers operacionais
              consomem os repositórios — o AppContext/mock foi eliminado (§6, §16). */}
          <AuthProvider>
            <RepositoryProvider>
              <SyncProvider>
                <OperationsProvider>
                  <EvaluationsProvider>
                    <ActionsProvider>
                      <ValidationsProvider>
                        <AdminProvider>
                          <AppNavigator />
                        </AdminProvider>
                      </ValidationsProvider>
                    </ActionsProvider>
                  </EvaluationsProvider>
                </OperationsProvider>
              </SyncProvider>
            </RepositoryProvider>
          </AuthProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  appFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 1100,
    backgroundColor: colors.background,
  },
});
