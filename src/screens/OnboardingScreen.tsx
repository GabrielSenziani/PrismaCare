import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../contexts/AccessibilityContext';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import { AuthContext } from '../contexts/AuthContext';
import { patchTimezone } from '../services/api';

type Step = 'welcome' | 'name' | 'timezone';

function detectDeviceTimezone(): string | null {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!tz || typeof tz !== 'string') return null;
  return tz;
}

function timezoneTitle(timezone: string | null): string {
  if (!timezone) return 'Não conseguimos detectar automaticamente.';
  if (timezone === 'America/Sao_Paulo') return 'São Paulo — GMT-3';
  return timezone.replace(/_/g, ' ');
}

export default function OnboardingScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { profile, timezoneConfirmed, markTimezoneConfirmed, updateProfileName } = useContext(AuthContext);
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState(detectDeviceTimezone() ?? 'America/Sao_Paulo');
  const [editingTimezone, setEditingTimezone] = useState(detectDeviceTimezone() === null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const detectedTimezone = useMemo(() => detectDeviceTimezone(), []);
  const hasExistingName = (profile?.nome?.trim().length ?? 0) > 0;

  useEffect(() => {
    if (hasExistingName && step === 'name') {
      setStep('timezone');
    }
  }, [hasExistingName, step]);

  async function handleNameNext(skip = false) {
    const trimmed = name.trim();
    if (!skip && trimmed.length > 0 && trimmed.length < 2) {
      setError('Use pelo menos 2 caracteres.');
      return;
    }
    if (!skip && trimmed.length > 60) {
      setError('Use no máximo 60 caracteres.');
      return;
    }
    if (skip || trimmed.length === 0) {
      setStep('timezone');
      setError(undefined);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      await updateProfileName(trimmed);
      setStep('timezone');
    } catch (e: any) {
      Alert.alert('Não foi possível salvar', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTimezoneConfirm() {
    if (!timezone.trim()) {
      setError('Informe um fuso horário.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      await patchTimezone(timezone.trim());
      markTimezoneConfirmed();
    } catch (e: any) {
      setError(e.message);
      setEditingTimezone(true);
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
        <View style={styles.iconCircle}>
          <Ionicons
            name={step === 'timezone' ? 'time-outline' : 'sparkles-outline'}
            size={38}
            color={colors.white}
          />
        </View>
        <Text style={styles.headerTitle}>Bem-vindo ao PrismaCare</Text>
        <Text style={styles.headerSub}>Vamos deixar o começo leve e seguro.</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === 'welcome' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Seu cuidado começa por aqui</Text>
                <Text style={styles.cardText}>
                  {hasExistingName
                    ? 'Agora só falta confirmar o fuso horário dos lembretes.'
                    : 'Primeiro vamos confirmar como chamar você e o fuso horário dos lembretes.'}
                </Text>
                <PrimaryButton
                  title="Começar"
                  onPress={() => setStep(hasExistingName ? 'timezone' : 'name')}
                  iconName="arrow-forward"
                  style={styles.action}
                />
              </View>
            )}

            {step === 'name' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Como quer ser chamado?</Text>
                <Text style={styles.cardText}>Pode ser seu primeiro nome, apelido ou deixar para depois.</Text>
                <InputField
                  label="Nome"
                  iconName="person-outline"
                  placeholder="Ex: Cauê"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError(undefined);
                  }}
                  autoCapitalize="words"
                  error={error}
                />
                <PrimaryButton
                  title="Continuar"
                  onPress={() => handleNameNext(false)}
                  loading={loading}
                  iconName="arrow-forward"
                  style={styles.action}
                />
                <TouchableOpacity style={styles.secondaryButton} onPress={() => handleNameNext(true)}>
                  <Text style={styles.secondaryText}>Agora não</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'timezone' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {detectedTimezone
                    ? `Detectamos seu fuso horário como ${timezoneTitle(detectedTimezone)}. Está certo?`
                    : 'Não conseguimos detectar automaticamente. Escolha seu fuso horário.'}
                </Text>
                <Text style={styles.cardText}>
                  Usamos esse horário para que lembretes e doses apareçam no momento certo.
                </Text>

                {editingTimezone ? (
                  <InputField
                    label="Fuso horário"
                    iconName="globe-outline"
                    placeholder="America/Sao_Paulo"
                    value={timezone}
                    onChangeText={(value) => {
                      setTimezone(value);
                      setError(undefined);
                    }}
                    autoCapitalize="none"
                    error={error}
                  />
                ) : (
                  <>
                    <View style={styles.timezoneBox}>
                      <Ionicons name="globe-outline" size={20} color={colors.primary} />
                      <Text style={styles.timezoneText}>{timezoneTitle(timezone)}</Text>
                    </View>
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  </>
                )}

                <PrimaryButton
                  title="Sim, confirmar"
                  onPress={handleTimezoneConfirm}
                  loading={loading}
                  iconName="checkmark"
                  style={styles.action}
                />
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setEditingTimezone(true);
                    setError(undefined);
                  }}
                >
                  <Text style={styles.secondaryText}>Alterar</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  flex: { flex: 1 },
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
    paddingTop: 64,
    paddingBottom: 38,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
  },
  iconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
    marginTop: 8,
  },
  content: {
    flexGrow: 1,
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    marginBottom: 22,
  },
  timezoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  timezoneText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  action: { marginTop: 22 },
  secondaryButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryText: {
    color: colors.primary,
    fontWeight: '800',
  },
});
