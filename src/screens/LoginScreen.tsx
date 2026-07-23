import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthProvider';
import { colors, radius, shadow, spacing } from '../theme';
import { AppButton } from '../components/AppButton';
import { AuthModeBanner } from '../components/AuthModeBanner';
import { runtimeConfig } from '../config/runtime';

// Atalhos de perfil disponíveis SOMENTE no modo demonstração de desenvolvimento
// (Masterplan §9.3: o build corporativo não inclui atalhos de demonstração).
// Os e-mails coincidem com o diretório demo derivado do seed operacional.
const demoAccounts = [
  { label: 'Administrador', email: 'admin@aace.app' },
  { label: 'Gerência Regional', email: 'regional@aace.app' },
  { label: 'Coordenação', email: 'coordenador@aace.app' },
  { label: 'Gerente de Canal', email: 'gerente@aace.app' },
];

export function LoginScreen() {
  const { mode, state, signIn, requestPasswordReset } = useAuth();
  const isDemo = mode === 'demo';
  const [email, setEmail] = useState(isDemo ? 'gerente@aace.app' : '');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);

  async function handleLogin() {
    if (!email.trim()) {
      Alert.alert('Informe o e-mail', 'Digite o e-mail corporativo para entrar.');
      return;
    }
    // Em ambiente corporativo (Supabase) a senha é obrigatória; no modo
    // demonstração o backend identifica o perfil apenas pelo e-mail fictício.
    if (!isDemo && !password) {
      Alert.alert('Informe a senha', 'A senha é obrigatória na autenticação corporativa.');
      return;
    }
    const result = await signIn(email.trim(), password);
    if (!result.ok) Alert.alert('Não foi possível entrar', result.message ?? 'Falha na autenticação.');
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Informe o e-mail', 'Digite o e-mail corporativo para receber as instruções.');
      return;
    }
    if (isDemo) {
      Alert.alert('Ambiente de demonstração', 'A recuperação de senha só está disponível com a autenticação corporativa (Supabase).');
      return;
    }
    const result = await requestPasswordReset(email.trim());
    Alert.alert(
      result.ok ? 'Verifique seu e-mail' : 'Não foi possível continuar',
      result.ok
        ? 'Se o e-mail estiver cadastrado, você receberá as instruções de redefinição.'
        : result.message ?? 'Tente novamente mais tarde.',
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brandBlock}>
          <View style={styles.logo}><Text style={styles.logoText}>A</Text></View>
          <Text style={styles.brand}>AACE Excelência</Text>
          <Text style={styles.tagline}>Avaliar. Comprovar. Evoluir.</Text>
          <View style={styles.version}><Text style={styles.versionText}>APP MOBILE + WEB · VERSÃO {runtimeConfig.appVersion}</Text></View>
        </View>

        <View style={styles.card}>
          <AuthModeBanner />
          <Text style={styles.title}>Acesso ao programa</Text>
          <Text style={styles.subtitle}>Entre com suas credenciais corporativas AACE.</Text>

          <Text style={styles.label}>E-mail</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={20} color={colors.inkMuted} />
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholder="nome@empresa.com" placeholderTextColor={colors.neutral} editable={!state.busy} accessibilityLabel="E-mail corporativo" />
          </View>

          <Text style={styles.label}>Senha</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.inkMuted} />
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={secure} style={styles.input} placeholder="Senha" placeholderTextColor={colors.neutral} editable={!state.busy} accessibilityLabel="Senha" onSubmitEditing={() => void handleLogin()} />
            <Pressable onPress={() => setSecure((value) => !value)} accessibilityLabel={secure ? 'Mostrar senha' : 'Ocultar senha'}><Ionicons name={secure ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.inkMuted} /></Pressable>
          </View>

          {state.error ? (
            <View style={styles.errorRow} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{state.error}</Text>
            </View>
          ) : null}

          <AppButton title="Entrar" onPress={() => void handleLogin()} loading={state.busy} style={styles.loginButton} />

          <Pressable onPress={() => void handleForgotPassword()} disabled={state.busy} style={styles.forgot}>
            <Text style={styles.forgotText}>Esqueci minha senha</Text>
          </Pressable>

          {isDemo ? (
            <>
              <Text style={styles.demoTitle}>Perfis demonstrativos (desenvolvimento)</Text>
              <View style={styles.demoRow}>
                {demoAccounts.map((account) => (
                  <Pressable key={account.email} onPress={() => { setEmail(account.email); setPassword(''); }} style={styles.demoButton} accessibilityRole="button">
                    <Text style={styles.demoLabel}>{account.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.passwordHint}>Modo demonstração local — sessão corporativa emulada, sem senha embutida.</Text>
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
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  loginButton: { marginTop: spacing.xl },
  forgot: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: spacing.xs },
  forgotText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  demoTitle: { color: colors.inkMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: spacing.xl, marginBottom: spacing.sm },
  demoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  demoButton: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 7 },
  demoLabel: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  passwordHint: { color: colors.inkMuted, fontSize: 10, marginTop: spacing.sm },
});
