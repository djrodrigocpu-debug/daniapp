import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { featureFlags } from '../config/runtime';
import { colors, radius, shadow, spacing } from '../theme';
import { AppButton } from '../components/AppButton';
import { AuthModeBanner } from '../components/AuthModeBanner';

// Atalhos de perfil disponíveis SOMENTE no modo demonstração de desenvolvimento
// (Masterplan §9.3: build corporativo não inclui atalhos de demonstração).
const demoAccounts = [
  { label: 'Gerência Regional', email: 'regional@aace.app' },
  { label: 'Coordenação', email: 'coordenador@aace.app' },
  { label: 'Gerente de Canal', email: 'gerente@aace.app' },
];

export function LoginScreen() {
  const { login } = useApp();
  const [email, setEmail] = useState(featureFlags.demoMode ? 'gerente@aace.app' : '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [secure, setSecure] = useState(true);

  async function handleLogin() {
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) Alert.alert('Não foi possível entrar', result.message);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brandBlock}>
          <View style={styles.logo}><Text style={styles.logoText}>A</Text></View>
          <Text style={styles.brand}>AACE Excelência</Text>
          <Text style={styles.tagline}>Avaliar. Comprovar. Evoluir.</Text>
          <View style={styles.version}><Text style={styles.versionText}>APP MOBILE + WEB · VERSÃO 1.3</Text></View>
        </View>

        <View style={styles.card}>
          <AuthModeBanner />
          <Text style={styles.title}>Acesso ao programa</Text>
          <Text style={styles.subtitle}>Entre com o perfil da sua estrutura AACE.</Text>

          <Text style={styles.label}>E-mail</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={20} color={colors.inkMuted} />
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="nome@empresa.com" placeholderTextColor={colors.neutral} />
          </View>

          <Text style={styles.label}>Senha</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.inkMuted} />
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={secure} style={styles.input} placeholder="Senha" placeholderTextColor={colors.neutral} />
            <Pressable onPress={() => setSecure((value) => !value)}><Ionicons name={secure ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.inkMuted} /></Pressable>
          </View>

          <AppButton title="Entrar" onPress={() => void handleLogin()} loading={loading} style={styles.loginButton} />

          {featureFlags.demoMode ? (
            <>
              <Text style={styles.demoTitle}>Perfis demonstrativos (desenvolvimento)</Text>
              <View style={styles.demoRow}>
                {demoAccounts.map((account) => (
                  <Pressable key={account.email} onPress={() => { setEmail(account.email); setPassword(''); }} style={styles.demoButton}>
                    <Text style={styles.demoLabel}>{account.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.passwordHint}>Modo demonstração local — sem autenticação corporativa.</Text>
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.xl, justifyContent: 'center' },
  brandBlock: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow },
  logoText: { color: colors.white, fontSize: 34, fontWeight: '900' },
  brand: { color: colors.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.8, marginTop: spacing.md },
  tagline: { color: colors.inkMuted, fontSize: 14, marginTop: 3 },
  version: { marginTop: spacing.sm, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  versionText: { color: colors.primary, fontWeight: '800', fontSize: 10, letterSpacing: 0.6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, ...shadow },
  title: { color: colors.ink, fontSize: 21, fontWeight: '800' },
  subtitle: { color: colors.inkMuted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: '#FAFAFB' },
  input: { flex: 1, color: colors.ink, fontSize: 14 },
  loginButton: { marginTop: spacing.xl },
  demoTitle: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: spacing.xl, marginBottom: spacing.sm },
  demoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  demoButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 7 },
  demoLabel: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  passwordHint: { color: colors.inkMuted, fontSize: 10, marginTop: spacing.sm },
});
