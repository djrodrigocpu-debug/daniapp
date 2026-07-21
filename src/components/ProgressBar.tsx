import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

export function ProgressBar({ value, color = colors.primary }: { value: number; color?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${bounded}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, backgroundColor: '#ECEEF1', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
