import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors as defaultColors, highContrastColors, ColorPalette } from '../theme/colors';

export type FontScaleOption = 1 | 1.2 | 1.4;

type AccessibilityState = {
  fontScale: FontScaleOption;
  highContrast: boolean;
  hapticsEnabled: boolean;
};

type AccessibilityContextType = AccessibilityState & {
  colors: ColorPalette;
  setFontScale: (scale: FontScaleOption) => void;
  setHighContrast: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  ready: boolean;
};

const STORAGE_KEY = 'prismacare.accessibility.prefs';

const DEFAULT_STATE: AccessibilityState = {
  fontScale: 1,
  highContrast: false,
  hapticsEnabled: true,
};

async function readPrefs(): Promise<AccessibilityState> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    } else {
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AccessibilityState>;
    return {
      fontScale: (parsed.fontScale === 1.2 || parsed.fontScale === 1.4 ? parsed.fontScale : 1) as FontScaleOption,
      highContrast: Boolean(parsed.highContrast),
      hapticsEnabled: parsed.hapticsEnabled !== false,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

async function writePrefs(state: AccessibilityState): Promise<void> {
  try {
    const json = JSON.stringify(state);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, json);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, json);
  } catch {
    // ignore persistence errors
  }
}

export const AccessibilityContext = createContext<AccessibilityContextType>({
  ...DEFAULT_STATE,
  colors: defaultColors,
  setFontScale: () => {},
  setHighContrast: () => {},
  setHapticsEnabled: () => {},
  ready: false,
});

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessibilityState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readPrefs().then((prefs) => {
      if (!cancelled) {
        setState(prefs);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<AccessibilityState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      void writePrefs(next);
      return next;
    });
  }, []);

  const value = useMemo<AccessibilityContextType>(() => ({
    ...state,
    colors: state.highContrast ? highContrastColors : defaultColors,
    setFontScale: (scale) => update({ fontScale: scale }),
    setHighContrast: (enabled) => update({ highContrast: enabled }),
    setHapticsEnabled: (enabled) => update({ hapticsEnabled: enabled }),
    ready,
  }), [state, update, ready]);

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

export function useColors(): ColorPalette {
  return useContext(AccessibilityContext).colors;
}
