// Configure EXPO_PUBLIC_API_BASE_URL no seu .env:
//   Simulador iOS       → http://localhost:8000
//   Emulador Android    → http://10.0.2.2:8000
//   Dispositivo físico  → http://<IP_DA_MAQUINA>:8000
//   Produção            → https://seudominio.com
const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: number;
    nome: string | null;
    email: string | null;
  };
};

export type PhoneLookupResponse = {
  ok: true;
  formatted_phone: string;
  channel: 'whatsapp';
};

export type PhoneCodeSendResponse = {
  ok: true;
  formatted_phone: string;
  expires_in_seconds: number;
};

export type PhoneCodeVerificationResponse =
  | AuthResponse
  | {
      authenticated: false;
      needs_name: true;
      verification_token: string;
      formatted_phone: string;
    };

type AuthHandlers = {
  onSessionUpdate?: (tokens: SessionTokens) => void;
  onSessionExpired?: () => void;
};

let _sessionTokens: SessionTokens | null = null;
let _handlers: AuthHandlers = {};
let _refreshPromise: Promise<boolean> | null = null;
let _sessionExpiredTriggered = false;

export function configureAuthHandlers(handlers: AuthHandlers) {
  _handlers = handlers;
}

export function setSessionTokens(tokens: SessionTokens | null) {
  _sessionTokens = tokens;
  if (tokens) _sessionExpiredTriggered = false;
}

function readErrorDetail(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return `Erro ${status}`;
}

async function fetchJson(path: string, options: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, options);
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = _sessionTokens?.refreshToken;
  if (!refreshToken) return false;

  const res = await fetchJson('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) return false;

  const payload = (await res.json()) as AuthResponse;
  if (!payload.access_token || !payload.refresh_token) return false;

  const nextTokens: SessionTokens = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
  setSessionTokens(nextTokens);
  _handlers.onSessionUpdate?.(nextTokens);
  return true;
}

async function ensureRefreshed(): Promise<boolean> {
  if (!_refreshPromise) {
    _refreshPromise = refreshAccessToken().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

function triggerSessionExpired() {
  if (_sessionExpiredTriggered) return;
  _sessionExpiredTriggered = true;
  setSessionTokens(null);
  _handlers.onSessionExpired?.();
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (_sessionTokens?.accessToken) headers['Authorization'] = `Bearer ${_sessionTokens.accessToken}`;

  let res = await fetchJson(path, { ...options, headers });
  if (res.status === 401) {
    const refreshed = await ensureRefreshed();
    if (!refreshed) {
      triggerSessionExpired();
      throw new Error('Sua sessão expirou. Entre novamente para continuar.');
    }

    const retryHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (_sessionTokens?.accessToken) retryHeaders['Authorization'] = `Bearer ${_sessionTokens.accessToken}`;
    res = await fetchJson(path, { ...options, headers: retryHeaders });
  }

  if (res.status === 401) {
    triggerSessionExpired();
    throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(readErrorDetail(body, res.status));
  }
  return res.json();
}

export type UserProfile = {
  id: number;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  timezone: string;
  timezone_confirmed: boolean;
  phone_verified_at?: string | null;
};

export async function fetchMe(): Promise<UserProfile> {
  return api<UserProfile>('/api/users/me');
}

export async function patchTimezone(timezone: string): Promise<{ timezone: string; timezone_confirmed: boolean }> {
  return api('/api/users/me/timezone', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timezone }),
  });
}

export async function patchProfileName(name: string): Promise<UserProfile> {
  return api<UserProfile>('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function lookupEmail(email: string): Promise<{ exists: boolean }> {
  return api<{ exists: boolean }>('/api/auth/lookup-email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function registerRequest(email: string, password: string): Promise<void> {
  await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function loginRequest(username: string, password: string) {
  const body = new URLSearchParams({ username, password, grant_type: 'password' });
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? 'Login falhou');
  return res.json() as Promise<AuthResponse>;
}

export async function googleLoginRequest(idToken: string) {
  return api<AuthResponse>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function lookupPhoneRequest(ddd: string, numero: string) {
  return api<PhoneLookupResponse>('/api/auth/lookup-phone', {
    method: 'POST',
    body: JSON.stringify({ ddd, numero }),
  });
}

export async function sendPhoneCodeRequest(ddd: string, numero: string) {
  return api<PhoneCodeSendResponse>('/api/auth/send-phone-code', {
    method: 'POST',
    body: JSON.stringify({ ddd, numero }),
  });
}

export async function verifyPhoneCodeRequest(ddd: string, numero: string, codigo: string) {
  return api<PhoneCodeVerificationResponse>('/api/auth/verify-phone-code', {
    method: 'POST',
    body: JSON.stringify({ ddd, numero, codigo }),
  });
}

export async function completePhoneRegistrationRequest(verificationToken: string, nome: string) {
  return api<AuthResponse>('/api/auth/complete-phone-registration', {
    method: 'POST',
    body: JSON.stringify({ verification_token: verificationToken, nome }),
  });
}
