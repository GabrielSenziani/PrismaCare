import React, { useContext, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../contexts/AccessibilityContext';
import { AuthContext } from '../contexts/AuthContext';
import { patchTimezone } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';

function detectDeviceTimezone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!tz || typeof tz !== 'string') return 'America/Sao_Paulo';
  return tz;
}

export default function TimezoneWelcomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { timezoneConfirmed, markTimezoneConfirmed } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceTz = detectDeviceTimezone();

  async function handleConfirmar() {
    setLoading(true);
    setError(null);
    try {
      await patchTimezone(deviceTz);
      markTimezoneConfirmed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar fuso horário. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (timezoneConfirmed === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView style={styles.headerInner}>
          <View style={styles.iconCircle}>
            <Ionicons name="time-outline" size={48} color={colors.white} />
          </View>
          <Text style={styles.headerTitle}>Bem-vindo ao PrismaCare</Text>
          <Text style={styles.headerSub}>Antes de começar, confirme seu fuso horário</Text>
        </SafeAreaView>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Seu fuso horário detectado</Text>
        <View style={styles.tzBox}>
          <Ionicons name="globe-outline" size={22} color={colors.primary} style={styles.tzIcon} />
          <Text style={styles.tzText}>{deviceTz}</Text>
        </View>
        <Text style={styles.explanation}>
          Usamos esse horário para enviar seus lembretes de medicamento na hora certa.
          Se estiver correto, toque em confirmar para continuar.
        </Text>
      </View>

      <View style={styles.footer}>
        {error !== null && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <PrimaryButton
          title="Confirmar meu horário"
          onPress={handleConfirmar}
          loading={loading}
          iconName="checkmark-outline"
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: (StatusBar.currentHeight ?? 0) + 24,
    paddingBottom: 40,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
  },
  headerInner: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  card: {
    margin: 24,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 28,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  tzBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  tzIcon: {
    marginRight: 10,
  },
  tzText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryDark,
    flexShrink: 1,
  },
  explanation: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    flexShrink: 1,
    lineHeight: 20,
  },
});
