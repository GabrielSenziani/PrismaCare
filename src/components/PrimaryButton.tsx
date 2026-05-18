import React from 'react';
import {
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useColors, useAccessibility } from '../contexts/AccessibilityContext';
import AppText from './AppText';
import { triggerHaptic } from '../utils/haptics';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  iconName?: keyof typeof Ionicons.glyphMap;
  large?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export default function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  iconName,
  large = false,
  accessibilityLabel,
  accessibilityHint,
}: PrimaryButtonProps) {
  const colors = useColors();
  const { hapticsEnabled } = useAccessibility();
  const isDisabled = disabled || loading;

  function handlePress() {
    triggerHaptic('light', hapticsEnabled);
    onPress();
  }

  return (
    <TouchableOpacity
      style={[
        styles.wrapper,
        { shadowColor: colors.primaryDeep },
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      <LinearGradient
        colors={
          isDisabled
            ? [colors.border, colors.textMuted]
            : [colors.gradientStart, colors.gradientMid, colors.gradientEnd]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, large && styles.gradientLarge]}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <View style={styles.content}>
            <AppText variant="button" color={colors.white}>
              {title}
            </AppText>
            {iconName && (
              <Ionicons name={iconName} size={20} color={colors.white} style={styles.icon} />
            )}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  gradient: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  gradientLarge: {
    minHeight: 64,
    paddingVertical: 18,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginLeft: 8,
  },
});
