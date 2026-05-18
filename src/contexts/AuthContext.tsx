import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AuthResponse,
  configureAuthHandlers,
  fetchMe,
  googleLoginRequest,
  loginRequest,
  patchProfileName,
  SessionTokens,
  setSessionTokens,
  UserProfile,
} from '../services/api';
import { getGoogleSigninModule, isExpoGoRuntime } from '../utils/googleSignin';

type AuthContextType = {
  token: string | null;
  profile: UserProfile | null;
  timezoneConfirmed: boolean | null;
  sessionExpiredMessage: string | null;
  signIn(username: string, password: string): Promise<void>;
  hydrateSession(payload: AuthResponse): Promise<void>;
  signInWithGoogle(): Promise<boolean>;
  signOut(): void;
  consumeSessionExpiredMessage(): void;
  markTimezoneConfirmed(): void;
  updateProfileName(name: string): Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<SessionTokens | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [timezoneConfirmed, setTimezoneConfirmed] = useState<boolean | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  const setSession = useCallback((tokens: SessionTokens | null) => {
    setSessionTokens(tokens);
    setSessionState(tokens);
  }, []);

  const handleSessionExpired = useCallback(() => {
    setSession(null);
    setProfile(null);
    setTimezoneConfirmed(null);
    setSessionExpiredMessage('Sua sessão expirou. Entre novamente para continuar.');
  }, [setSession]);

  useEffect(() => {
    configureAuthHandlers({
      onSessionUpdate: setSession,
      onSessionExpired: handleSessionExpired,
    });
  }, [handleSessionExpired, setSession]);

  async function signIn(username: string, password: string) {
    const payload = await loginRequest(username, password);
    await applySessionPayload(payload);
  }

  async function applySessionPayload(payload: AuthResponse) {
    setSession({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
    });
    setSessionExpiredMessage(null);
    setTimezoneConfirmed(null);
    const profile = await fetchMe();
    setProfile(profile);
    setTimezoneConfirmed(profile.timezone_confirmed);
  }

  async function signInWithGoogle(): Promise<boolean> {
    const googleSigninModule = getGoogleSigninModule();
    if (!googleSigninModule || isExpoGoRuntime()) {
      throw new Error('Entrar com Google fica disponível no app instalado, não no Expo Go.');
    }

    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = googleSigninModule;

    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        return false;
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        throw new Error('Não foi possível obter sua credencial Google. Tente novamente.');
      }

      const payload = await googleLoginRequest(idToken);
      await applySessionPayload(payload);
      return true;
    } catch (error: unknown) {
      if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services indisponível neste dispositivo.');
      }
      throw error instanceof Error ? error : new Error('Não foi possível entrar com Google.');
    }
  }

  function signOut() {
    setSession(null);
    setProfile(null);
    setTimezoneConfirmed(null);
  }

  function consumeSessionExpiredMessage() {
    setSessionExpiredMessage(null);
  }

  function markTimezoneConfirmed() {
    setTimezoneConfirmed(true);
    setProfile((current) => current ? { ...current, timezone_confirmed: true } : current);
  }

  async function updateProfileName(name: string) {
    const updated = await patchProfileName(name);
    setProfile(updated);
  }

  const contextValue = useMemo(
    () => ({
      token: session?.accessToken ?? null,
      profile,
      timezoneConfirmed,
      sessionExpiredMessage,
      signIn,
      hydrateSession: applySessionPayload,
      signInWithGoogle,
      signOut,
      consumeSessionExpiredMessage,
      markTimezoneConfirmed,
      updateProfileName,
    }),
    [session, profile, timezoneConfirmed, sessionExpiredMessage],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
