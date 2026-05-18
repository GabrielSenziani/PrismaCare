import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../contexts/AccessibilityContext';
import AppText from './AppText';

type ToastKind = 'success' | 'info' | 'error';

type ToastMessage = {
  id: number;
  kind: ToastKind;
  text: string;
};

type ToastContextType = {
  show: (text: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextType>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounter = useRef(0);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 40, duration: 200, useNativeDriver: true }),
    ]).start(() => setCurrent(null));
  }, [opacity, translateY]);

  const show = useCallback<ToastContextType['show']>((text, kind = 'success') => {
    idCounter.current += 1;
    const id = idCounter.current;
    setCurrent({ id, kind, text });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    opacity.setValue(0);
    translateY.setValue(40);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
    ]).start();
    hideTimer.current = setTimeout(() => animateOut(), 2600);
  }, [animateOut, opacity, translateY]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {current && <ToastView toast={current} opacity={opacity} translateY={translateY} />}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  opacity,
  translateY,
}: {
  toast: ToastMessage;
  opacity: Animated.Value;
  translateY: Animated.Value;
}) {
  const colors = useColors();
  const palette = {
    success: { bg: colors.success, icon: 'checkmark-circle' as const },
    info: { bg: colors.primary, icon: 'information-circle' as const },
    error: { bg: colors.error, icon: 'alert-circle' as const },
  }[toast.kind];

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          { backgroundColor: palette.bg, opacity, transform: [{ translateY }] },
        ]}
      >
        <Ionicons name={palette.icon} size={22} color={colors.white} style={styles.icon} />
        <AppText variant="bodyStrong" color={colors.white} style={styles.text}>
          {toast.text}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 48 : 32,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  icon: {
    marginRight: 10,
  },
  text: {
    flexShrink: 1,
  },
});
