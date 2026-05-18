import React from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccessibility, useColors, FontScaleOption } from '../contexts/AccessibilityContext';
import AppText from '../components/AppText';
import { triggerHaptic } from '../utils/haptics';

const FONT_OPTIONS: { value: FontScaleOption; label: string; sample: string }[] = [
  { value: 1, label: 'Normal', sample: 'Aa' },
  { value: 1.2, label: 'Grande', sample: 'Aa' },
  { value: 1.4, label: 'Muito grande', sample: 'Aa' },
];

export default function ConfiguracoesScreen() {
  const colors = useColors();
  const {
    fontScale,
    highContrast,
    hapticsEnabled,
    setFontScale,
    setHighContrast,
    setHapticsEnabled,
  } = useAccessibility();

  function pickScale(scale: FontScaleOption) {
    triggerHaptic('light', hapticsEnabled);
    setFontScale(scale);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" color={colors.textPrimary} style={styles.sectionTitle}>
          Acessibilidade
        </AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.sectionIntro}>
          Ajuste o tamanho do texto e o contraste para deixar o app mais confortável.
        </AppText>

        <AppText variant="heading" color={colors.textPrimary} style={styles.label}>
          Tamanho do texto
        </AppText>
        <View style={styles.fontRow}>
          {FONT_OPTIONS.map((opt) => {
            const selected = fontScale === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => pickScale(opt.value)}
                style={[
                  styles.fontCard,
                  {
                    backgroundColor: selected ? colors.primaryLight : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Tamanho do texto ${opt.label}`}
                accessibilityState={{ selected }}
              >
                <AppText
                  color={selected ? colors.primary : colors.textPrimary}
                  style={{ fontSize: 22 * opt.value, fontWeight: '800', lineHeight: 30 * opt.value }}
                >
                  {opt.sample}
                </AppText>
                <AppText
                  variant="caption"
                  color={selected ? colors.primary : colors.textSecondary}
                  style={styles.fontLabel}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.toggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.toggleTextWrap}>
            <AppText variant="bodyStrong" color={colors.textPrimary}>Alto contraste</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              Escurece os textos e remove gradientes para facilitar a leitura.
            </AppText>
          </View>
          <Switch
            value={highContrast}
            onValueChange={(v) => {
              triggerHaptic('light', hapticsEnabled);
              setHighContrast(v);
            }}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
            accessibilityLabel="Modo de alto contraste"
          />
        </View>

        <View style={[styles.toggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.toggleTextWrap}>
            <AppText variant="bodyStrong" color={colors.textPrimary}>Vibrar nos toques</AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              Sentir uma leve vibração ao tocar em botões importantes.
            </AppText>
          </View>
          <Switch
            value={hapticsEnabled}
            onValueChange={(v) => {
              if (v) triggerHaptic('light', true);
              setHapticsEnabled(v);
            }}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
            accessibilityLabel="Vibração ao tocar"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  sectionTitle: { marginTop: 4 },
  sectionIntro: { marginBottom: 12 },
  label: { marginTop: 8 },
  fontRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fontCard: {
    flex: 1,
    minHeight: 110,
    borderWidth: 2,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  fontLabel: { marginTop: 6, textAlign: 'center' },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    minHeight: 72,
  },
  toggleTextWrap: { flex: 1, marginRight: 12 },
});
