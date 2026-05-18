import React, { useContext, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColors } from '../contexts/AccessibilityContext';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import AppText from '../components/AppText';
import { RootStackParamList } from '../../App';
import { AuthContext } from '../contexts/AuthContext';

const { width } = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

function isPhoneCandidate(value: string): boolean {
  return value.replace(/\D/g, '').length >= 8;
}

export default function LoginScreen({ navigation }: Props) {
  const colors = useColors();
  const { signIn } = useContext(AuthContext);
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ contact?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!contact.trim()) next.contact = 'Informe seu número ou e-mail.';
    if (!password) next.password = 'Informe sua senha.';
    else if (isPhoneCandidate(contact)) {
      next.contact = 'Para entrar com número, volte e use o fluxo por código no WhatsApp.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(contact.trim(), password);
    } catch (e: any) {
      Alert.alert('Erro ao entrar', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={[styles.blob, styles.blob1, { backgroundColor: colors.white }]} />
        <View style={[styles.blob, styles.blob2, { backgroundColor: colors.white }]} />
        <View style={[styles.blob, styles.blob3, { backgroundColor: colors.white }]} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Logo + brand */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoBadge, { backgroundColor: colors.white, shadowColor: colors.shadow }]}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.taglineChip}>
              <Ionicons name="sparkles" size={14} color={colors.white} />
              <AppText variant="caption" color={colors.white} style={{ fontWeight: '700' }}>
                Seu guia inteligente de medicamentos
              </AppText>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.white, shadowColor: colors.shadow }]}>
            <View style={styles.cardHeader}>
              <AppText variant="title" color={colors.textPrimary}>
                Inicie com seu número ou e-mail
              </AppText>
              <AppText variant="caption" color={colors.textSecondary} style={{ marginTop: 6 }}>
                Use e-mail e senha aqui, ou volte para a tela principal para entrar com código pelo WhatsApp.
              </AppText>
            </View>

            <InputField
              label="Número ou e-mail"
              iconName="person-outline"
              placeholder="Seu número ou e-mail"
              value={contact}
              onChangeText={(t) => {
                setContact(t);
                if (errors.contact) setErrors((e) => ({ ...e, contact: undefined }));
              }}
              keyboardType="default"
              autoCapitalize="none"
              error={errors.contact}
            />

            <InputField
              label="Senha"
              iconName="lock-closed-outline"
              placeholder="Digite sua senha"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
              }}
              isPassword
              error={errors.password}
            />

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Esqueci minha senha"
            >
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
                Esqueci minha senha
              </AppText>
            </TouchableOpacity>

            <PrimaryButton
              title="Entrar"
              onPress={handleLogin}
              loading={loading}
              iconName="arrow-forward"
            />

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <AppText variant="caption" color={colors.textMuted} style={{ marginHorizontal: 12 }}>
                ou continue com
              </AppText>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.socialRow}>
              <View style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="logo-google" size={22} color={colors.textPrimary} />
              </View>
            </View>
          </View>

          <View style={styles.registerRow}>
            <AppText variant="caption" color={colors.textSecondary}>Não tem uma conta? </AppText>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Cadastrar-se"
            >
              <AppText variant="caption" color={colors.primary} style={{ fontWeight: '800' }}>
                Cadastrar-se
              </AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 200,
    opacity: 0.08,
  },
  blob1: { width: 220, height: 220, top: -60, right: -40 },
  blob2: { width: 160, height: 160, top: 100, left: -50, opacity: 0.1 },
  blob3: { width: 90, height: 90, top: 40, left: width / 2 - 30, opacity: 0.12 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 32,
  },
  logoContainer: { alignItems: 'center', marginBottom: 24 },
  logoBadge: {
    width: 130,
    height: 130,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  logoImage: { width: '85%', height: '85%' },
  taglineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,42,32,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  card: {
    borderRadius: 28,
    padding: 24,
    paddingTop: 28,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    marginBottom: 24,
  },
  cardHeader: { marginBottom: 24 },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 22,
    padding: 6,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  dividerLine: { flex: 1, height: 1 },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  socialBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
});
