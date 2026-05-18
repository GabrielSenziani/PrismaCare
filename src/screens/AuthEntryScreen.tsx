import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import { AuthContext } from '../contexts/AuthContext';
import {
  completePhoneRegistrationRequest,
  lookupEmail,
  lookupPhoneRequest,
  registerRequest,
  sendPhoneCodeRequest,
  verifyPhoneCodeRequest,
} from '../services/api';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AuthEntry'>;
};

type Step = 'contact' | 'existingPassword' | 'newPassword' | 'phoneDetails' | 'phoneCode' | 'phoneName';

function validateEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email.trim());
}

function looksLikePhone(value: string): boolean {
  return value.replace(/\D/g, '').length >= 8 && !value.includes('@');
}

function splitPhoneCandidate(value: string): { ddd: string; numero: string } | null {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  return { ddd: digits.slice(0, 2), numero: digits.slice(2) };
}

function formatPhonePreview(ddd: string, numero: string): string {
  const cleanDdd = ddd.replace(/\D/g, '').slice(0, 2);
  const cleanNumero = numero.replace(/\D/g, '').slice(0, 9);
  if (!cleanDdd && !cleanNumero) return '+55';
  if (cleanNumero.length > 4) {
    const head = cleanNumero.length === 9 ? cleanNumero.slice(0, 5) : cleanNumero.slice(0, 4);
    const tail = cleanNumero.length === 9 ? cleanNumero.slice(5) : cleanNumero.slice(4);
    return `+55 ${cleanDdd}${cleanDdd ? ' ' : ''}${head}${tail ? `-${tail}` : ''}`.trim();
  }
  return `+55 ${cleanDdd}${cleanDdd ? ' ' : ''}${cleanNumero}`.trim();
}

export default function AuthEntryScreen({ navigation }: Props) {
  const { signIn, signInWithGoogle, hydrateSession } = useContext(AuthContext);
  const [step, setStep] = useState<Step>('contact');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [ddd, setDdd] = useState('');
  const [numero, setNumero] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [formattedPhone, setFormattedPhone] = useState('+55');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const normalizedEmail = contact.trim().toLowerCase();
  const isExisting = step === 'existingPassword';
  const isNew = step === 'newPassword';
  const entrance = useRef(new Animated.Value(0)).current;
  const stepProgress = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [entrance, pulse]);

  useEffect(() => {
    stepProgress.setValue(0);
    Animated.timing(stepProgress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, stepProgress]);

  async function handleContact() {
    if (looksLikePhone(contact)) {
      const phoneParts = splitPhoneCandidate(contact);
      if (!phoneParts) {
        setError('Informe um telefone brasileiro válido.');
        return;
      }
      setDdd(phoneParts.ddd);
      setNumero(phoneParts.numero);
      setFormattedPhone(formatPhonePreview(phoneParts.ddd, phoneParts.numero));
      setCodigo('');
      setNome('');
      setVerificationToken('');
      setError(undefined);
      setStep('phoneDetails');
      return;
    }

    if (!validateEmail(contact)) {
      setError('Informe um número ou e-mail válido.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const result = await lookupEmail(normalizedEmail);
      setPassword('');
      setStep(result.exists ? 'existingPassword' : 'newPassword');
    } catch (e: any) {
      Alert.alert('Não foi possível continuar', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword() {
    if (password.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      if (isNew) {
        await registerRequest(normalizedEmail, password);
      }
      await signIn(normalizedEmail, password);
    } catch (e: any) {
      Alert.alert(isNew ? 'Erro ao criar conta' : 'Erro ao entrar', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendPhoneCode() {
    if (ddd.replace(/\D/g, '').length !== 2 || numero.replace(/\D/g, '').length < 8) {
      setError('Informe um DDD e número válidos.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const lookup = await lookupPhoneRequest(ddd, numero);
      const sent = await sendPhoneCodeRequest(ddd, numero);
      setFormattedPhone(sent.formatted_phone ?? lookup.formatted_phone);
      setCodigo('');
      setStep('phoneCode');
    } catch (e: any) {
      Alert.alert('Não foi possível enviar o código', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPhoneCode() {
    const codeDigits = codigo.replace(/\D/g, '');
    if (codeDigits.length !== 6) {
      setError('Digite o código de 6 dígitos.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const result = await verifyPhoneCodeRequest(ddd, numero, codeDigits);
      if ('access_token' in result) {
        await hydrateSession(result);
        return;
      }
      setVerificationToken(result.verification_token);
      setFormattedPhone(result.formatted_phone);
      setNome('');
      setStep('phoneName');
    } catch (e: any) {
      Alert.alert('Código inválido', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCompletePhoneRegistration() {
    if (nome.trim().length < 2) {
      setError('Informe como você quer ser chamado.');
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const payload = await completePhoneRegistrationRequest(verificationToken, nome.trim());
      await hydrateSession(payload);
    } catch (e: any) {
      Alert.alert('Não foi possível concluir seu cadastro', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(undefined);
    try {
      const didAuthenticate = await signInWithGoogle();
      if (!didAuthenticate) return;
    } catch (e: any) {
      Alert.alert('Erro ao entrar com Google', e.message ?? 'Não foi possível continuar com Google.');
    } finally {
      setGoogleLoading(false);
    }
  }

  function goBack() {
    setError(undefined);
    if (step === 'existingPassword' || step === 'newPassword' || step === 'phoneDetails') {
      setStep('contact');
      return;
    }
    if (step === 'phoneCode') {
      setStep('phoneDetails');
      return;
    }
    if (step === 'phoneName') {
      setStep('phoneCode');
    }
  }

  const title = (() => {
    switch (step) {
      case 'existingPassword':
        return 'Bem-vindo de volta!';
      case 'newPassword':
        return 'Crie uma senha';
      case 'phoneDetails':
        return 'Confirme seu telefone';
      case 'phoneCode':
        return 'Digite o código';
      case 'phoneName':
        return 'Como quer ser chamado?';
      default:
        return 'Inicie com seu número ou e-mail';
    }
  })();

  const subtitle = (() => {
    switch (step) {
      case 'existingPassword':
      case 'newPassword':
        return normalizedEmail;
      case 'phoneDetails':
        return 'Enviaremos um código de 6 dígitos para este número pelo WhatsApp.';
      case 'phoneCode':
        return `Código enviado para ${formattedPhone} pelo WhatsApp.`;
      case 'phoneName':
        return `Vamos finalizar sua conta com o número ${formattedPhone}.`;
      default:
        return 'Entre com e-mail e senha ou receba um código de 6 dígitos pelo WhatsApp.';
    }
  })();

  const entranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  const stepStyle = {
    opacity: stepProgress,
    transform: [
      {
        translateY: stepProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });

  const logoEntranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      { scale: pulseScale },
    ],
  };

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      />
      <Animated.View style={[styles.glow, styles.glowTop, { transform: [{ scale: pulseScale }] }]} />
      <Animated.View style={[styles.glow, styles.glowSide, { transform: [{ scale: pulseScale }] }]} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[styles.logoBadge, logoEntranceStyle]}>
              <Image source={require('../../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
            </Animated.View>

            <Animated.View style={[styles.card, entranceStyle]}>
              {step !== 'contact' && (
                <TouchableOpacity style={styles.backButton} onPress={goBack}>
                  <Ionicons name="arrow-back" size={18} color={colors.primary} />
                  <Text style={styles.backText}>Voltar</Text>
                </TouchableOpacity>
              )}

              <Animated.View style={stepStyle}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

                {step === 'contact' ? (
                  <InputField
                    label="Número ou e-mail"
                    iconName="person-outline"
                    placeholder="Seu número ou e-mail"
                    value={contact}
                    onChangeText={(value) => {
                      setContact(value);
                      setError(undefined);
                    }}
                    keyboardType="default"
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={error}
                  />
                ) : null}

                {(step === 'existingPassword' || step === 'newPassword') ? (
                  <>
                    <InputField
                      label="Senha"
                      iconName="lock-closed-outline"
                      placeholder={isExisting ? 'Digite sua senha' : 'Mínimo 6 caracteres'}
                      value={password}
                      onChangeText={(value) => {
                        setPassword(value);
                        setError(undefined);
                      }}
                      isPassword
                      error={error}
                    />
                    {isExisting && (
                      <TouchableOpacity
                        style={styles.forgotButton}
                        onPress={() => navigation.navigate('ForgotPassword')}
                      >
                        <Text style={styles.forgotText}>Esqueci minha senha</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : null}

                {step === 'phoneDetails' ? (
                  <>
                    <View style={styles.phoneRow}>
                      <View style={styles.phoneCountry}>
                        <Text style={styles.phoneCountryText}>+55</Text>
                      </View>
                      <View style={styles.phoneField}>
                        <Text style={styles.phoneLabel}>DDD</Text>
                        <TextInput
                          style={styles.phoneInput}
                          value={ddd}
                          onChangeText={(value) => {
                            setDdd(value.replace(/\D/g, '').slice(0, 2));
                            setError(undefined);
                          }}
                          keyboardType="number-pad"
                          placeholder="11"
                          placeholderTextColor={colors.textMuted}
                          maxLength={2}
                        />
                      </View>
                      <View style={[styles.phoneField, styles.phoneNumberField]}>
                        <Text style={styles.phoneLabel}>Número</Text>
                        <TextInput
                          style={styles.phoneInput}
                          value={numero}
                          onChangeText={(value) => {
                            setNumero(value.replace(/\D/g, '').slice(0, 9));
                            setError(undefined);
                          }}
                          keyboardType="number-pad"
                          placeholder="954154792"
                          placeholderTextColor={colors.textMuted}
                          maxLength={9}
                        />
                      </View>
                    </View>
                    <View style={styles.phonePreview}>
                      <Ionicons name="logo-whatsapp" size={16} color={colors.primary} />
                      <Text style={styles.phonePreviewText}>{formatPhonePreview(ddd, numero)}</Text>
                    </View>
                    {error ? <Text style={styles.inlineError}>{error}</Text> : null}
                  </>
                ) : null}

                {step === 'phoneCode' ? (
                  <>
                    <InputField
                      label="Código de 6 dígitos"
                      iconName="chatbubble-ellipses-outline"
                      placeholder="123456"
                      value={codigo}
                      onChangeText={(value) => {
                        setCodigo(value.replace(/\D/g, '').slice(0, 6));
                        setError(undefined);
                      }}
                      keyboardType="number-pad"
                      error={error}
                    />
                    <TouchableOpacity style={styles.secondaryAction} onPress={handleSendPhoneCode}>
                      <Text style={styles.secondaryActionText}>Reenviar código pelo WhatsApp</Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                {step === 'phoneName' ? (
                  <InputField
                    label="Nome"
                    iconName="sparkles-outline"
                    placeholder="Como você quer ser chamado?"
                    value={nome}
                    onChangeText={(value) => {
                      setNome(value);
                      setError(undefined);
                    }}
                    autoCapitalize="words"
                    error={error}
                  />
                ) : null}

                <PrimaryButton
                  title={
                    step === 'contact'
                      ? 'Continuar'
                      : step === 'existingPassword'
                        ? 'Entrar'
                        : step === 'newPassword'
                          ? 'Criar conta'
                          : step === 'phoneDetails'
                            ? 'Receber código'
                            : step === 'phoneCode'
                              ? 'Validar código'
                              : 'Concluir cadastro'
                  }
                  onPress={
                    step === 'contact'
                      ? handleContact
                      : step === 'existingPassword' || step === 'newPassword'
                        ? handlePassword
                        : step === 'phoneDetails'
                          ? handleSendPhoneCode
                          : step === 'phoneCode'
                            ? handleVerifyPhoneCode
                            : handleCompletePhoneRegistration
                  }
                  loading={loading}
                  iconName={
                    step === 'contact' || step === 'phoneDetails'
                      ? 'arrow-forward'
                      : step === 'phoneCode'
                        ? 'checkmark'
                        : 'sparkles'
                  }
                  style={styles.primaryButton}
                />

                {step === 'contact' ? (
                  <>
                    <View style={styles.dividerRow}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>ou continue com</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity
                      style={[styles.socialBtn, googleLoading && styles.socialBtnDisabled]}
                      onPress={handleGoogleSignIn}
                      activeOpacity={0.88}
                      disabled={googleLoading}
                    >
                      <Ionicons name="logo-google" size={20} color={colors.textSecondary} />
                      <Text style={styles.socialText}>
                        {googleLoading ? 'Conectando...' : 'Continuar com Google'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  glowTop: {
    width: 210,
    height: 210,
    top: -52,
    right: -48,
  },
  glowSide: {
    width: 150,
    height: 150,
    top: 126,
    left: -50,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
  },
  logoBadge: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  logoImage: { width: '82%', height: '82%' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 18,
  },
  backText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 18,
  },
  forgotText: { color: colors.primary, fontWeight: '700' },
  primaryButton: { marginTop: 4 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  socialBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  socialBtnDisabled: {
    opacity: 0.7,
  },
  socialText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 12,
  },
  phoneCountry: {
    minWidth: 64,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  phoneCountryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  phoneField: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  phoneNumberField: {
    flex: 2,
  },
  phoneLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  phoneInput: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  phonePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    marginBottom: 18,
  },
  phonePreviewText: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: '700',
  },
  inlineError: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '600',
    marginTop: -6,
    marginBottom: 12,
  },
  secondaryAction: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 18,
  },
  secondaryActionText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
