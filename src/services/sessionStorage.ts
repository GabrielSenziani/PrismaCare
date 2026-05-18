import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SessionTokens } from './api';

const SESSION_STORAGE_KEY = 'prismacare.session.tokens';

function isWebRuntime() {
  return Platform.OS === 'web';
}

export async function persistSessionTokens(tokens: SessionTokens | null): Promise<void> {
  if (isWebRuntime()) {
    if (typeof localStorage === 'undefined') return;
    if (tokens) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tokens));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return;
  }

  if (tokens) {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(tokens));
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}

export async function readSessionTokens(): Promise<SessionTokens | null> {
  let raw: string | null = null;

  if (isWebRuntime()) {
    if (typeof localStorage === 'undefined') return null;
    raw = localStorage.getItem(SESSION_STORAGE_KEY);
  } else {
    raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionTokens>;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}
