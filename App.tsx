import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthProvider';
import { AppProvider } from './src/context/AppContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { colors } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.page}>
        <View style={styles.appFrame}>
          {/* AuthProvider é a fonte de verdade da sessão corporativa (§8); o
              AppProvider demonstrativo coexiste durante a migração strangler. */}
          <AuthProvider>
            <AppProvider>
              <AppNavigator />
            </AppProvider>
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
