import { getAccessToken, getApiBaseUrl } from './api';

type Level = 'info' | 'warn' | 'error';

export function shipClientLog(event: string, data?: Record<string, unknown>, level: Level = 'info') {
  const token = getAccessToken();
  if (!token) {
    // Sem sessão ativa não há para quem atribuir o log; o endpoint exige auth.
    return;
  }
  fetch(`${getApiBaseUrl()}/api/client-logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ event, level, data: data ?? null }),
  }).catch(() => {
    // engole erro: log remoto best-effort
  });
}
