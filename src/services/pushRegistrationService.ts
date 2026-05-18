import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerPushTokenRequest } from './api';
import { isExpoGoRuntime } from '../utils/googleSignin';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let lastRegisteredKey: string | null = null;

function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === 'web' || isExpoGoRuntime()) return null;
  if (notificationsModule !== undefined) return notificationsModule;

  try {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch (error) {
    console.warn('[push] expo-notifications require falhou', error);
    notificationsModule = null;
  }

  return notificationsModule;
}

function resolveProjectId(): string | null {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEasConfig = Constants.easConfig?.projectId;
  return (typeof fromConfig === 'string' && fromConfig) || (typeof fromEasConfig === 'string' && fromEasConfig) || null;
}

function resolveDeviceName(): string | undefined {
  if (Platform.OS === 'android') return 'Android device';
  if (Platform.OS === 'ios') return 'iPhone';
  return undefined;
}

export async function syncRemotePushTokenRegistration(userId: number | null, timezoneConfirmed: boolean) {
  console.log('[push] sync chamada', {
    userId,
    timezoneConfirmed,
    platform: Platform.OS,
    appOwnership: Constants.appOwnership,
    executionEnvironment: Constants.executionEnvironment,
  });

  if (!userId) {
    console.log('[push] skip: userId ausente');
    return;
  }
  if (!timezoneConfirmed) {
    console.log('[push] skip: timezone nao confirmado');
    return;
  }
  if (Platform.OS === 'web') {
    console.log('[push] skip: platform web');
    return;
  }
  if (isExpoGoRuntime()) {
    console.log('[push] skip: rodando em Expo Go');
    return;
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) {
    console.log('[push] skip: modulo expo-notifications indisponivel');
    return;
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    console.log('[push] skip: projectId ausente', {
      extra: Constants.expoConfig?.extra,
      easConfig: Constants.easConfig,
    });
    return;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    console.log('[push] permissao atual', status);

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
      console.log('[push] permissao apos request', status);
    }

    if (status !== 'granted') {
      console.log('[push] skip: permissao negada');
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;
    console.log('[push] expo token obtido', expoPushToken ? `${expoPushToken.slice(0, 20)}...` : '(vazio)');
    if (!expoPushToken) {
      console.log('[push] skip: token vazio');
      return;
    }

    const registrationKey = `${userId}:${expoPushToken}`;
    if (registrationKey === lastRegisteredKey) {
      console.log('[push] skip: token ja registrado nesta sessao');
      return;
    }

    console.log('[push] POST /api/push-tokens iniciando');
    const response = await registerPushTokenRequest({
      expo_push_token: expoPushToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: resolveDeviceName(),
    });
    lastRegisteredKey = registrationKey;
    console.log('[push] POST /api/push-tokens ok', response);
  } catch (error) {
    console.warn('[push] falha no registro remoto', error);
  }
}

export function resetPushRegistrationCache() {
  lastRegisteredKey = null;
}
