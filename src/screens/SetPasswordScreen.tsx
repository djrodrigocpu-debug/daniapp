/**
 * Tela "Definir senha" — conclusão do convite e da recuperação de senha.
 *
 * Só aparece quando há sessão TEMPORÁRIA vinda do link (fase `password_setup`).
 * Enquanto ela estiver na tela, a navegação principal não é montada: o usuário
 * ainda não tem acesso operacional.
 *
 * SEGURANÇA: a senha vive apenas no estado local deste componente, nunca vai
 * para AsyncStorage, log, URL ou estado global; os campos são limpos ao sair,
 * ao cancelar e ao concluir.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { colors, radius, spacing } from '../theme';
import { MIN_PASSWORD_LENGTH, checkPassword } from '../domain/auth/passwordPolicy';
import {
  CompletionProgress,
  INITIAL_PROGRESS,
  completePasswordSetup,
} from '../domain/auth/onboardingFlow';

export interface SetPasswordScreenProps {
  /** true quando o perfil está `invited` e precisa de activate_self ao final. */
  needsActivation: boolean;
  /** Nome/e-mail para o usuário se reconhecer; opcional. */
  accountLabel?: string | null;
  updatePassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
  activateSelf: () => Promise<{ ok: boolean; message?: string }>;
  /** Chamado após sucesso completo — recarrega a sessão operacional. */
  onCompleted: () => void;
  /** Cancelar encerra a sessão temporária e volta ao login. */
  onCancel: () => void;
}

export function SetPasswordScreen({
  needsActivation,
  accountLabel,
  updatePassword,
  activateSelf,
  onCompleted,
  onCancel,
}: SetPasswordScreenProps) {
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [visivel, setVisivel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  /** Sobrevive entre tentativas: evita trocar a senha de novo num retry. */
  const progresso = useRef<CompletionProgress>(INITIAL_PROGRESS);
  /** Trava de reentrância — protege contra duplo clique antes do setBusy. */
  const enviando = useRef(false);

  const limparCampos = useCallback(() => {
    setSenha('');
    setConfirmacao('');
    setVisivel(false);
  }, []);

  async function enviar() {
    if (enviando.current) return;
    setErro(null);

    const check = checkPassword(senha, confirmacao);
    if (!check.ok) {
      setErro(check.message ?? 'Senha inválida.');
      return;
    }

    enviando.current = true;
    setBusy(true);
    const resultado = await completePasswordSetup(
      { updatePassword, activateSelf },
      senha,
      needsActivation,
      progresso.current,
    );
    progresso.current = resultado.progress;
    setBusy(false);
    enviando.current = false;

    if (!resultado.ok) {
      setErro(resultado.message);
      // A senha já pode ter sido aceita; não repetimos os campos numa retentativa.
      if (resultado.progress.passwordSet) limparCampos();
      return;
    }
    limparCampos();
    setSucesso(resultado.message);
    onCompleted();
  }

  function cancelar() {
    limparCampos();
    setErro(null);
    onCancel();
  }

  const aguardandoAtivacao = progresso.current.passwordSet && !progresso.current.activated;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Definir senha</Text>
          <Text style={styles.subtitle}>
            {needsActivation
              ? 'Crie sua senha para concluir o acesso ao AAPEx.'
              : 'Crie uma nova senha para a sua conta.'}
          </Text>
          {accountLabel ? <Text style={styles.account}>{accountLabel}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.label}>Nova senha</Text>
            <TextInput
              value={senha}
              onChangeText={setSenha}
              secureTextEntry={!visivel}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
              placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
              placeholderTextColor={colors.neutral}
              style={styles.input}
              accessibilityLabel="Nova senha"
            />

            <Text style={styles.label}>Confirmar senha</Text>
            <TextInput
              value={confirmacao}
              onChangeText={setConfirmacao}
              secureTextEntry={!visivel}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
              placeholder="Repita a senha"
              placeholderTextColor={colors.neutral}
              style={styles.input}
              accessibilityLabel="Confirmar senha"
            />

            <Pressable onPress={() => setVisivel((v) => !v)} disabled={busy} accessibilityRole="button">
              <Text style={styles.toggle}>{visivel ? 'Ocultar senha' : 'Mostrar senha'}</Text>
            </Pressable>

            {erro ? (
              <View style={styles.erroBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
                <Text style={styles.erroText}>{erro}</Text>
              </View>
            ) : null}

            {sucesso ? (
              <View style={styles.okBox} accessibilityLiveRegion="polite">
                <Text style={styles.okText}>{sucesso}</Text>
              </View>
            ) : null}

            <AppButton
              title={aguardandoAtivacao ? 'Tentar novamente' : 'Confirmar'}
              onPress={() => void enviar()}
              loading={busy}
              disabled={busy}
              style={styles.mt}
            />
            <AppButton title="Cancelar e sair" variant="ghost" onPress={cancelar} disabled={busy} />
          </View>

          {busy ? (
            <View style={styles.linha}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>Concluindo seu acesso…</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  account: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.lg },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: 6, marginTop: spacing.sm },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FAFAFB', paddingHorizontal: spacing.md, color: colors.ink, fontSize: 14 },
  toggle: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  erroBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, borderWidth: 1, borderColor: '#F1B6B6', padding: spacing.md, marginTop: spacing.md },
  erroText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  okBox: { backgroundColor: colors.successSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  okText: { color: colors.success, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  mt: { marginTop: spacing.md },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  muted: { color: colors.inkMuted, fontSize: 12 },
});
