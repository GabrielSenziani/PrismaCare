const BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

type Level = 'info' | 'warn' | 'error';

export function shipClientLog(event: string, data?: Record<string, unknown>, level: Level = 'info') {
  fetch(`${BASE}/api/client-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, level, data: data ?? null }),
  }).catch(() => {
    // engole erro: log remoto best-effort
  });
}
