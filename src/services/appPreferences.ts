import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const AUTH_INTRO_SEEN_KEY = 'prismacare.authIntroSeen';

function isWebRuntime() {
  return Platform.OS === 'web';
}

export async function readAuthIntroSeen(): Promise<boolean> {
  let raw: string | null = null;

  if (isWebRuntime()) {
    if (typeof localStorage === 'undefined') return false;
    raw = localStorage.getItem(AUTH_INTRO_SEEN_KEY);
  } else {
    raw = await SecureStore.getItemAsync(AUTH_INTRO_SEEN_KEY);
  }

  return raw === 'true';
}

export async function persistAuthIntroSeen(): Promise<void> {
  if (isWebRuntime()) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AUTH_INTRO_SEEN_KEY, 'true');
    return;
  }

  await SecureStore.setItemAsync(AUTH_INTRO_SEEN_KEY, 'true');
}
