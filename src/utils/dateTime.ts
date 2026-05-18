function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function extractTimeFromString(value: string): string | null {
  const match = value.match(/(?:T| )(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function formatDateAsLocalTime(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatBusinessTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return extractTimeFromString(value) ?? '—';
}

export function formatConfirmationTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    return formatDateAsLocalTime(new Date(value));
  }

  const extracted = extractTimeFromString(value);
  if (extracted) {
    return extracted;
  }

  return formatDateAsLocalTime(new Date(value));
}
