import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerPushTokenRequest } from './api';
import { shipClientLog } from './clientLog';
import { isExpoGoRuntime } from '../utils/googleSignin';

function log(event: string, data?: Record<string, unknown>) {
  console.log(`[push] ${event}`, data ?? '');
  shipClientLog(`push.${event}`, data);
}

function warn(event: string, data?: Record<string, unknown>) {
  console.warn(`[push] ${event}`, data ?? '');
  shipClientLog(`push.${event}`, data, 'warn');
}

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let lastRegisteredKey: string | null = null;

function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === 'web' || isExpoGoRuntime()) return null;
  if (notificationsModule !== undefined) return notificationsModule;

  try {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch (error) {
    warn('expo_notifications_require_falhou', { error: String(error) });
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
  log('sync_chamada', {
    userId,
    timezoneConfirmed,
    platform: Platform.OS,
    appOwnership: Constants.appOwnership,
    executionEnvironment: Constants.executionEnvironment,
  });

  if (!userId) {
    log('skip_userId_ausente');
    return;
  }
  if (!timezoneConfirmed) {
    log('skip_timezone_nao_confirmado');
    return;
  }
  if (Platform.OS === 'web') {
    log('skip_platform_web');
    return;
  }
  if (isExpoGoRuntime()) {
    log('skip_expo_go');
    return;
  }

  const Notifications = getNotificationsModule();
  if (!Notifications) {
    log('skip_modulo_notifications_indisponivel');
    return;
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    log('skip_projectId_ausente', {
      extra: Constants.expoConfig?.extra,
      easConfig: Constants.easConfig,
    });
    return;
  }

  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    log('permissao_atual', { status });

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
      log('permissao_apos_request', { status });
    }

    if (status !== 'granted') {
      log('skip_permissao_negada');
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;
    log('expo_token_obtido', { preview: expoPushToken ? `${expoPushToken.slice(0, 20)}...` : null });
    if (!expoPushToken) {
      log('skip_token_vazio');
      return;
    }

    const registrationKey = `${userId}:${expoPushToken}`;
    if (registrationKey === lastRegisteredKey) {
      log('skip_token_ja_registrado_na_sessao');
      return;
    }

    log('post_iniciando');
    const response = await registerPushTokenRequest({
      expo_push_token: expoPushToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: resolveDeviceName(),
    });
    lastRegisteredKey = registrationKey;
    log('post_ok', { response: response as unknown as Record<string, unknown> });
  } catch (error) {
    warn('falha_registro_remoto', { error: String(error) });
  }
}

export function resetPushRegistrationCache() {
  lastRegisteredKey = null;
}
