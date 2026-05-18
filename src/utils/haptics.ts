import { Platform } from 'react-native';

let cachedModule: typeof import('expo-haptics') | null = null;
let moduleResolved = false;

function getHapticsModule(): typeof import('expo-haptics') | null {
  if (moduleResolved) return cachedModule;
  moduleResolved = true;
  if (Platform.OS === 'web') {
    cachedModule = null;
    return null;
  }
  try {
    cachedModule = require('expo-haptics');
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export type HapticKind = 'light' | 'medium' | 'success' | 'warning' | 'error';

export function triggerHaptic(kind: HapticKind, enabled: boolean): void {
  if (!enabled) return;
  const mod = getHapticsModule();
  if (!mod) return;
  try {
    if (kind === 'light') {
      void mod.impactAsync(mod.ImpactFeedbackStyle.Light);
    } else if (kind === 'medium') {
      void mod.impactAsync(mod.ImpactFeedbackStyle.Medium);
    } else if (kind === 'success') {
      void mod.notificationAsync(mod.NotificationFeedbackType.Success);
    } else if (kind === 'warning') {
      void mod.notificationAsync(mod.NotificationFeedbackType.Warning);
    } else if (kind === 'error') {
      void mod.notificationAsync(mod.NotificationFeedbackType.Error);
    }
  } catch {
    // ignore
  }
}
