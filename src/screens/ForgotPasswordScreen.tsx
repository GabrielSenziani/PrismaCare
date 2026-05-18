import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColors } from '../contexts/AccessibilityContext';
import AppText from '../components/AppText';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppText variant="title" color={colors.primary} style={{ marginBottom: 12 }}>
        Redefinir Senha
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={{ textAlign: 'center', marginBottom: 32 }}>
        Em breve — recuperação de senha em desenvolvimento.
      </AppText>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Voltar ao login"
      >
        <AppText variant="bodyStrong" color={colors.primary}>← Voltar ao login</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
