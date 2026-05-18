import React, { useContext, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColors } from '../contexts/AccessibilityContext';
import InputField from '../components/InputField';
import PrimaryButton from '../components/PrimaryButton';
import AppText from '../components/AppText';
import { RootStackParamList } from '../../App';
import { api } from '../services/api';
import { AuthContext } from '../contexts/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const colors = useColors();
  const { signIn } = useContext(AuthContext);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const next: Record<string, string> = {};
    if (!nome.trim()) next.nome = 'Informe seu nome.';
    if (!email.trim()) next.email = 'Informe seu e-mail.';
    if (!telefone.trim()) next.telefone = 'Informe seu telefone.';
    if (senha.length < 6) next.senha = 'Senha deve ter ao menos 6 caracteres.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;
    setLoading(true);
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ nome: nome.trim(), email: email.trim(), telefone: telefone.trim(), senha }),
      });
      await signIn(email.trim(), senha);
    } catch (e: any) {
      Alert.alert('Erro ao cadastrar', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="body" color={colors.textSecondary} style={{ marginBottom: 24 }}>
            Preencha os dados para criar sua conta
          </AppText>

          <InputField
            label="Nome completo"
            iconName="person-outline"
            placeholder="Seu nome"
            value={nome}
            onChangeText={(t) => { setNome(t); setErrors((e) => ({ ...e, nome: '' })); }}
            error={errors.nome}
          />
          <InputField
            label="E-mail"
            iconName="mail-outline"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: '' })); }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />
          <InputField
            label="Telefone"
            iconName="call-outline"
            placeholder="(11) 99999-9999"
            value={telefone}
            onChangeText={(t) => { setTelefone(t); setErrors((e) => ({ ...e, telefone: '' })); }}
            keyboardType="phone-pad"
            error={errors.telefone}
          />
          <InputField
            label="Senha"
            iconName="lock-closed-outline"
            placeholder="Mínimo 6 caracteres"
            value={senha}
            onChangeText={(t) => { setSenha(t); setErrors((e) => ({ ...e, senha: '' })); }}
            isPassword
            error={errors.senha}
          />

          <View style={{ marginTop: 8 }}>
            <PrimaryButton
              title="Criar conta"
              onPress={handleRegister}
              loading={loading}
              iconName="checkmark"
            />
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 16 },
});
