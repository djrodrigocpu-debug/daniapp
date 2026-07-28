/**
 * Tela "Trocar senha temporária" — GATE de primeiro acesso.
 *
 * Aparece quando `password_change_status()` responde `required = true`. Enquanto
 * ela estiver montada NÃO existe sessão corporativa: nenhum perfil, escopo ou
 * papel foi carregado, e portanto nenhuma rota operacional pode ser renderizada.
 *
 * DIFERENÇA para `SetPasswordScreen`: aquela conclui um link de convite, onde a
 * sessão temporária já prova o acesso e só falta definir a senha. Aqui o usuário
 * entrou com a senha temporária da carga e precisa PROVÁ-LA de novo — por isso o
 * campo "senha atual" existe, e por isso a troca não pode acontecer no cliente.
 *
 * SEGURANÇA: as três senhas vivem apenas no estado local deste componente. Não
 * vão para AsyncStorage, localStorage, log, URL nem estado global, e os campos
 * são limpos ao concluir e ao sair. O componente NÃO chama `auth.updateUser`:
 * quem troca é a Edge Function `initial-password-change`, única capaz de validar
 * a senha atual e encerrar o onboarding com service role.
 */
import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { colors, radius, spacing } from '../theme';
import { MIN_PASSWORD_LENGTH } from '../domain/auth/passwordPolicy';
import { checkInitialPasswordForm } from '../domain/auth/initialPasswordForm';

export interface InitialPasswordScreenProps {
  /** E-mail da conta retida no gate; apenas rótulo. */
  accountLabel?: string | null;
  /**
   * Executa a troca. Devolver `ok: true` significa que o servidor CONFIRMOU a
   * liberação — não que a requisição respondeu 200.
   */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Sair: encerra a sessão e volta ao login. */
  onSignOut: () => void;
}

export function InitialPasswordScreen({
  accountLabel,
  changePassword,
  onSignOut,
}: InitialPasswordScreenProps) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [visivel, setVisivel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Trava de reentrância — protege contra duplo toque antes do setBusy. */
  const enviando = useRef(false);

  const limparCampos = useCallback(() => {
    setAtual('');
    setNova('');
    setConfirmacao('');
    setVisivel(false);
  }, []);

  async function enviar() {
    if (enviando.current) return;
    setErro(null);

    const check = checkInitialPasswordForm(atual, nova, confirmacao);
    if (!check.ok) {
      setErro(check.message ?? 'Senha inválida.');
      return;
    }

    enviando.current = true;
    setBusy(true);
    const resultado = await changePassword(atual, nova);
    setBusy(false);
    enviando.current = false;

    if (!resultado.ok) {
      // Gate MANTIDO. Os campos ficam para correção; nada é persistido.
      setErro(resultado.message ?? 'Não foi possível alterar a senha. Tente novamente.');
      return;
    }
    // Sucesso confirmado pelo servidor: a navegação é liberada por quem observa o
    // estado da sessão, não por esta tela.
    limparCampos();
  }

  function sair() {
    limparCampos();
    setErro(null);
    onSignOut();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Trocar senha temporária</Text>
          <Text style={styles.subtitle}>
            Sua senha atual foi definida pelo Administrador e precisa ser trocada antes do
            primeiro acesso ao AAPEx.
          </Text>
          {accountLabel ? <Text style={styles.account}>{accountLabel}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.label}>Senha temporária atual</Text>
            <TextInput
              value={atual}
              onChangeText={setAtual}
              secureTextEntry={!visivel}
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!busy}
              placeholder="A senha que você recebeu"
              placeholderTextColor={colors.neutral}
              style={styles.input}
              accessibilityLabel="Senha temporária atual"
            />

            <Text style={styles.label}>Nova senha</Text>
            <TextInput
              value={nova}
              onChangeText={setNova}
              secureTextEntry={!visivel}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
              // Curto de propósito: a versão longa truncava na largura de celular.
              placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH}, com letras e números`}
              placeholderTextColor={colors.neutral}
              style={styles.input}
              accessibilityLabel="Nova senha"
            />

            <Text style={styles.label}>Confirmar nova senha</Text>
            <TextInput
              value={confirmacao}
              onChangeText={setConfirmacao}
              secureTextEntry={!visivel}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!busy}
              placeholder="Repita a nova senha"
              placeholderTextColor={colors.neutral}
              style={styles.input}
              accessibilityLabel="Confirmar nova senha"
            />

            <Pressable onPress={() => setVisivel((v) => !v)} disabled={busy} accessibilityRole="button">
              <Text style={styles.toggle}>{visivel ? 'Ocultar senhas' : 'Mostrar senhas'}</Text>
            </Pressable>

            {erro ? (
              <View style={styles.erroBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
                <Text style={styles.erroText}>{erro}</Text>
              </View>
            ) : null}

            <AppButton
              title="Alterar senha"
              onPress={() => void enviar()}
              loading={busy}
              disabled={busy}
              style={styles.mt}
            />
            <AppButton title="Sair" variant="ghost" onPress={sair} disabled={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: 48, width: '100%', maxWidth: 520, alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  account: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.lg },
  label: { color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: 6, marginTop: spacing.sm },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FAFAFB', paddingHorizontal: spacing.md, color: colors.ink, fontSize: 14 },
  toggle: { color: colors.primary, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  erroBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, borderWidth: 1, borderColor: '#F1B6B6', padding: spacing.md, marginTop: spacing.md },
  erroText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  mt: { marginTop: spacing.md },
});
