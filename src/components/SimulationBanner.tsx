/**
 * Faixa PERSISTENTE do laboratório de simulação.
 *
 * Fica acima de toda a árvore de navegação (ver `App.tsx`), então aparece em
 * TODAS as telas — inclusive login, painel, ficha do parceiro e auditoria — e
 * não some ao navegar. É o que impede que uma captura de tela deste ambiente
 * seja confundida com produção.
 *
 * Diferente do `AuthModeBanner`, que informa qual backend está ativo, esta faixa
 * responde a outra pergunta: *isto aqui é real?* Por isso é vermelha, não
 * fecha, e não depende de nenhum provider — se o app quebrasse, ela ainda
 * estaria lá.
 *
 * No build de produção `isSimulationMode` é `false` e o componente devolve
 * `null`: nenhum pixel, nenhum texto, nenhum layout deslocado.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  isSimulationMode,
  simulationProjectRef,
  SIMULATION_BANNER_TEXT,
  SIMULATION_PAGE_TITLE,
} from '../config/simulationMode';

export function SimulationBanner() {
  if (!isSimulationMode) return null;

  // Título da aba/documento, só na web e só em simulação. Fora do render para
  // não disputar com o título do produto num build normal.
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = SIMULATION_PAGE_TITLE;
    }
  }, []);

  return (
    <View style={styles.faixa} accessibilityRole="alert" testID="simulation-banner">
      <Text style={styles.texto} numberOfLines={2}>
        {SIMULATION_BANNER_TEXT}
        {simulationProjectRef ? ` · ${simulationProjectRef}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    width: '100%',
    backgroundColor: '#8A1C1C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
