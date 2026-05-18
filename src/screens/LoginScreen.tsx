import React, { useContext, useState } from 'react';
import {
  View,
  Text,
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
import { colors } from '../theme/colors';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
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
    <View style={styles.flex}>
      {/* Hero gradient background */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Decorative blurred circles */}
        <View style={[styles.blob, styles.blob1]} />
        <View style={[styles.blob, styles.blob2]} />
        <View style={[styles.blob, styles.blob3]} />
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
            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.taglineChip}>
              <Ionicons name="sparkles" size={13} color={colors.white} />
              <Text style={styles.tagline}>Seu guia inteligente de medicamentos</Text>
            </View>
          </View>

          {/* Glass card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Inicie com seu número ou e-mail</Text>
              <Text style={styles.cardSubtitle}>Use e-mail e senha aqui, ou volte para a tela principal para entrar com código pelo WhatsApp.</Text>
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.forgotText}>Esqueci minha senha</Text>
            </TouchableOpacity>

            <PrimaryButton
              title="Entrar"
              onPress={handleLogin}
              loading={loading}
              iconName="arrow-forward"
              style={styles.loginBtn}
            />

            {/* Divisor */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou continue com</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social buttons placeholder */}
            <View style={styles.socialRow}>
              <View style={styles.socialBtn}>
                <Ionicons name="logo-google" size={20} color={colors.textPrimary} />
              </View>
            </View>
          </View>

          {/* Cadastro */}
          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Não tem uma conta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Cadastrar-se</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    backgroundColor: colors.white,
    opacity: 0.08,
  },
  blob1: {
    width: 220,
    height: 220,
    top: -60,
    right: -40,
  },
  blob2: {
    width: 160,
    height: 160,
    top: 100,
    left: -50,
    opacity: 0.1,
  },
  blob3: {
    width: 90,
    height: 90,
    top: 40,
    left: width / 2 - 30,
    opacity: 0.12,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 130,
    height: 130,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  logoImage: {
    width: '85%',
    height: '85%',
  },
  taglineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,42,32,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  tagline: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 24,
    paddingTop: 28,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    marginBottom: 24,
  },
  cardHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 22,
  },
  forgotText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
  },
  loginBtn: {
    width: '100%',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
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
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  socialBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  registerText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  registerLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '800',
  },
});
