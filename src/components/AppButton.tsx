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
}

export function AppButton({ title, onPress, variant = 'primary', disabled, loading, style, compact }: AppButtonProps) {
  const palette = {
    primary: { backgroundColor: colors.primary, borderColor: colors.primary, color: colors.white },
    secondary: { backgroundColor: colors.surface, borderColor: colors.primary, color: colors.primary },
    danger: { backgroundColor: colors.danger, borderColor: colors.danger, color: colors.white },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent', color: colors.ink },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        palette,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.color} /> : <Text style={[styles.text, { color: palette.color }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
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
