/**
 * O botão do produto.
 *
 * TRÊS GARANTIAS DE ACESSIBILIDADE ESTÃO AQUI, e não em cada tela, porque foi a
 * dispersão delas que produziu os achados **O-12** e **O-13**:
 *
 *   1. `accessibilityRole="button"` — sem isso o leitor de tela anuncia um
 *      contêiner, e o usuário não sabe que aquilo é acionável;
 *   2. `tabIndex` + `focusable` — no React Native Web, `Pressable` NÃO entra na
 *      ordem de tabulação por conta própria. Um controle que só responde ao
 *      mouse é invisível para quem navega por teclado, e foi exatamente esse o
 *      padrão do O-13;
 *   3. `accessibilityState` — `disabled` e `busy` precisam ser ANUNCIADOS. Um
 *      botão que parece clicável e não responde, sem explicação sonora, é pior
 *      do que um botão ausente.
 *
 * Botão desativado sai da ordem de tabulação (`tabIndex = -1`) mas **continua
 * anunciando o próprio estado**: quem chega nele por leitor de tela ouve que
 * está desabilitado, em vez de encontrar um silêncio.
 *
 * `minHeight: 48` é alvo de toque, não estética — é o mínimo recomendado, e o
 * `compact` (38) só é usado em linha de lista, onde o alvo é a linha inteira.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  /** Complemento falado, quando o título sozinho não diz o que vai acontecer. */
  accessibilityHint?: string;
}

export function AppButton({
  title, onPress, variant = 'primary', disabled, loading, style, compact, accessibilityHint,
}: AppButtonProps) {
  const palette = {
    primary: { backgroundColor: colors.primary, borderColor: colors.primary, color: colors.white },
    secondary: { backgroundColor: colors.surface, borderColor: colors.primary, color: colors.primary },
    danger: { backgroundColor: colors.danger, borderColor: colors.danger, color: colors.white },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent', color: colors.ink },
  }[variant];

  const inativo = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inativo, busy: Boolean(loading) }}
      // O teclado precisa alcançar o botão. `Pressable` do RN Web não entra na
      // ordem de tabulação sozinho.
      focusable={!inativo}
      tabIndex={inativo ? -1 : 0}
      disabled={inativo}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        palette,
        inativo && styles.disabled,
        pressed && !inativo && styles.pressed,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={palette.color} accessibilityLabel={`${title}: processando`} />
        : <Text style={[styles.text, { color: palette.color }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Alvo de toque mínimo. Não é espaçamento estético.
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 38, paddingHorizontal: spacing.md },
  text: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.8 },
});
