import 'react-native-gesture-handler';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
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
import { readAuthIntroSeen } from './src/services/appPreferences';
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
  Doses: { confirmacaoId?: number } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '700' as const },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function Navigation() {
  const { authReady, token, timezoneConfirmed, sessionExpiredMessage, consumeSessionExpiredMessage } = useContext(AuthContext);
  const [authIntroSeen, setAuthIntroSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessionExpiredMessage) return;
    consumeSessionExpiredMessage();
    Alert.alert('Sessao expirada', sessionExpiredMessage);
  }, [consumeSessionExpiredMessage, sessionExpiredMessage]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthIntroSeen() {
      const seen = await readAuthIntroSeen();
      if (!cancelled) {
        setAuthIntroSeen(seen);
      }
    }

    void loadAuthIntroSeen();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!authReady || authIntroSeen === null) {
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
          {!authIntroSeen && (
            <Stack.Screen name="AuthIntro" component={AuthIntroScreen} options={{ headerShown: false }} />
          )}
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

function AppShell() {
  const { authReady, token } = useContext(AuthContext);
  const [navigationReady, setNavigationReady] = useState(false);
  const pendingConfirmacaoIdRef = useRef<number | null>(null);

  const flushPendingDoseNavigation = useCallback(() => {
    if (!authReady || !navigationReady || !navigationRef.isReady()) {
      return;
    }

    if (!token) {
      pendingConfirmacaoIdRef.current = null;
      return;
    }

    const confirmacaoId = pendingConfirmacaoIdRef.current;
    if (!confirmacaoId) {
      return;
    }

    pendingConfirmacaoIdRef.current = null;
    navigationRef.navigate('Doses', { confirmacaoId });
  }, [authReady, navigationReady, token]);

  const handleDoseNotificationPress = useCallback((confirmacaoId: number) => {
    pendingConfirmacaoIdRef.current = confirmacaoId;
    flushPendingDoseNavigation();
  }, [flushPendingDoseNavigation]);

  useEffect(() => {
    configureDoseNotifications(handleDoseNotificationPress);
  }, [handleDoseNotificationPress]);

  useEffect(() => {
    flushPendingDoseNavigation();
  }, [flushPendingDoseNavigation]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setNavigationReady(true)}
    >
      <StatusBar style="light" translucent />
      <Navigation />
    </NavigationContainer>
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
  }, []);

  return (
    <AuthProvider>
      <AppShell />
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
