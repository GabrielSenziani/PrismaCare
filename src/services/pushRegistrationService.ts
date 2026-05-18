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
  } catch {
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
  if (!userId || !timezoneConfirmed || Platform.OS === 'web' || isExpoGoRuntime()) {
    return;
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) return;

  const projectId = resolveProjectId();
  if (!projectId) return;

  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;
    if (!expoPushToken) return;

    const registrationKey = `${userId}:${expoPushToken}`;
    if (registrationKey === lastRegisteredKey) return;

    await registerPushTokenRequest({
      expo_push_token: expoPushToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: resolveDeviceName(),
    });
    lastRegisteredKey = registrationKey;
  } catch (error) {
    console.warn('Falha ao registrar push token remoto.', error);
  }
}
