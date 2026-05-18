import Constants from 'expo-constants';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

let cachedModule: GoogleSigninModule | null | undefined;

export function isExpoGoRuntime() {
  return Constants.appOwnership === 'expo';
}

export function getGoogleSigninModule(): GoogleSigninModule | null {
  if (isExpoGoRuntime()) {
    return null;
  }

  if (cachedModule !== undefined) {
    return cachedModule;
  }

  try {
    cachedModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
  } catch {
    cachedModule = null;
  }

  return cachedModule;
}
