import 'react-native-gesture-handler';
import React, { useContext, useEffect } from 'react';
import { Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './src/theme/colors';
import { AuthProvider, AuthContext } from './src/contexts/AuthContext';

import AuthIntroScreen from './src/screens/AuthIntroScreen';
import AuthEntryScreen from './src/screens/AuthEntryScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen from './src/screens/HomeScreen';
import MedicamentosScreen from './src/screens/MedicamentosScreen';
import AgendamentosScreen from './src/screens/AgendamentosScreen';
import ContatosScreen from './src/screens/ContatosScreen';
import DosesScreen from './src/screens/DosesScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { configureDoseNotifications } from './src/services/notificationService';
import { getGoogleSigninModule, isExpoGoRuntime } from './src/utils/googleSignin';

export type RootStackParamList = {
  AuthIntro: undefined;
  AuthEntry: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Onboarding: undefined;
  Home: undefined;
  Medicamentos: undefined;
  Agendamentos: undefined;
  Contatos: undefined;
  Doses: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '700' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function Navigation() {
  const { authReady, token, timezoneConfirmed, sessionExpiredMessage, consumeSessionExpiredMessage } = useContext(AuthContext);

  useEffect(() => {
    if (!sessionExpiredMessage) return;
    consumeSessionExpiredMessage();
    Alert.alert('Sessao expirada', sessionExpiredMessage);
  }, [consumeSessionExpiredMessage, sessionExpiredMessage]);

  if (!authReady) {
    return (
      <View style={styles.bootSplash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {token === null ? (
        <>
          <Stack.Screen name="AuthIntro" component={AuthIntroScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AuthEntry" component={AuthEntryScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Criar Conta' }} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Redefinir Senha' }} />
        </>
      ) : timezoneConfirmed === true ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Medicamentos" component={MedicamentosScreen} options={{ title: 'Medicamentos' }} />
          <Stack.Screen name="Agendamentos" component={AgendamentosScreen} options={{ title: 'Agendamentos' }} />
          <Stack.Screen name="Contatos" component={ContatosScreen} options={{ title: 'Contatos' }} />
          <Stack.Screen name="Doses" component={DosesScreen} options={{ title: 'Doses de Hoje' }} />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    const googleSigninModule = getGoogleSigninModule();
    if (webClientId && googleSigninModule && !isExpoGoRuntime()) {
      googleSigninModule.GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });
    }
    configureDoseNotifications();
  }, []);

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" translucent />
        <Navigation />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  bootSplash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
