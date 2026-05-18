import { TextStyle } from 'react-native';

export type TypographyVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'button';

export const typography: Record<TypographyVariant, TextStyle> = {
  display: { fontSize: 28, lineHeight: 36, fontWeight: '800' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '800' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '500' },
  bodyStrong: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: 0.5 },
};

export function scaleTypography(variant: TypographyVariant, fontScale: number): TextStyle {
  const base = typography[variant];
  return {
    ...base,
    fontSize: Math.round((base.fontSize ?? 16) * fontScale),
    lineHeight: Math.round((base.lineHeight ?? 22) * fontScale),
  };
}
