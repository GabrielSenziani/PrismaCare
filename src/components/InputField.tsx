import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessibility, useColors } from '../contexts/AccessibilityContext';
import { scaleTypography } from '../theme/typography';
import AppText from './AppText';

interface InputFieldProps extends TextInputProps {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
  error?: string;
}

export default function InputField({
  label,
  iconName,
  isPassword = false,
  error,
  onFocus,
  onBlur,
  ...rest
}: InputFieldProps) {
  const colors = useColors();
  const { fontScale } = useAccessibility();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? colors.error
    : focused
      ? colors.borderFocus
      : colors.border;

  const iconColor = error
    ? colors.error
    : focused
      ? colors.primary
      : colors.textMuted;

  const bodyStyle = scaleTypography('body', fontScale);

  return (
    <View style={styles.wrapper}>
      <AppText
        variant="caption"
        color={focused ? colors.primary : colors.textSecondary}
        style={styles.label}
      >
        {label}
      </AppText>
      <View
        style={[
          styles.inputRow,
          { borderColor, backgroundColor: colors.surface },
          focused && { shadowColor: colors.primary, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
          error ? { backgroundColor: colors.errorBg } : null,
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: focused ? colors.primaryLight : colors.primarySoft },
          ]}
        >
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>
        <TextInput
          style={[
            styles.input,
            { color: colors.textPrimary, fontSize: bodyStyle.fontSize },
          ]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={isPassword && !visible}
          autoCapitalize="none"
          accessibilityLabel={label}
          accessibilityHint={error}
          allowFontScaling
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setVisible((v) => !v)}
            style={styles.eyeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <Ionicons
              name={visible ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={15} color={colors.error} />
          <AppText variant="caption" color={colors.error}>{error}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 18,
  },
  label: {
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  input: {
    flex: 1,
    minHeight: 48,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 10,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 4,
    gap: 6,
  },
});
