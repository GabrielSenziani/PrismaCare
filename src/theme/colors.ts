export const colors = {
  primary: '#5BAD8F',
  primaryLight: '#E8F5EE',
  primarySoft: '#F0F8F4',
  primaryDark: '#3D8B6E',
  primaryDeep: '#2A6B52',
  accent: '#7DD3AE',

  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFCFB',

  textPrimary: '#0F2A20',
  textSecondary: '#3F5A50',
  textMuted: '#6B8579',

  error: '#E07B6F',
  errorBg: '#FCEFEC',
  success: '#2E8B57',
  successBg: '#E6F4EC',

  border: '#E1EFE8',
  borderFocus: '#5BAD8F',

  background: '#F4FAF7',

  gradientStart: '#7DD3AE',
  gradientMid: '#5BAD8F',
  gradientEnd: '#3D8B6E',

  shadow: '#1A4A3A',
};

export const highContrastColors: typeof colors = {
  primary: '#1F5C45',
  primaryLight: '#E0EEE6',
  primarySoft: '#F0F8F4',
  primaryDark: '#0F3A29',
  primaryDeep: '#082015',
  accent: '#1F5C45',

  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',

  textPrimary: '#000000',
  textSecondary: '#1A1A1A',
  textMuted: '#2A2A2A',

  error: '#A71D1D',
  errorBg: '#FBE7E7',
  success: '#0B5C2E',
  successBg: '#DDF0E3',

  border: '#000000',
  borderFocus: '#000000',

  background: '#FFFFFF',

  gradientStart: '#1F5C45',
  gradientMid: '#1F5C45',
  gradientEnd: '#0F3A29',

  shadow: '#000000',
};

export type ColorPalette = typeof colors;
