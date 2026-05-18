import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { scaleTypography, TypographyVariant } from '../theme/typography';
import { useColors } from '../contexts/AccessibilityContext';

interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: string;
}

export default function AppText({
  variant = 'body',
  color,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { fontScale } = useAccessibility();
  const colors = useColors();
  const typographyStyle = scaleTypography(variant, fontScale);
  const resolvedColor = color ?? colors.textPrimary;

  return (
    <Text
      allowFontScaling
      style={[typographyStyle, { color: resolvedColor }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export const appTextStyles = StyleSheet.create({});
