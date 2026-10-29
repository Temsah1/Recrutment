const DEFAULT_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export function parseDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    ...DEFAULT_DATE_TIME,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatDateTimeWithZone(value: string | Date | null | undefined, timeZone: string): string {
  if (!value) return '—';
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const formatted = new Intl.DateTimeFormat(undefined, {
    ...DEFAULT_DATE_TIME,
    timeZone,
    timeZoneName: 'short',
  }).format(date);
  return formatted;
}

export function relativeTime(value: string | Date): string {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const minutes = Math.round(diff / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return rtf.format(days, 'day');
  return rtf.format(Math.round(days / 30), 'month');
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || 'ES';
}

export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = parseDate(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function humanizeAction(action: string): string {
  const [scope, ...rest] = action.split('.');
  const verb = rest.join(' ').replace(/_/g, ' ');
  const labels: Record<string, string> = {
    auth: 'Authentication',
    application: 'Application',
    document: 'Document',
    administrator: 'Administrator',
    settings: 'Settings',
    department: 'Department',
    cycle: 'Recruitment cycle',
    export: 'Export',
    backup: 'Backup',
    retention: 'Retention',
  };
  return `${labels[scope ?? ''] ?? scope ?? 'Event'} — ${verb || action}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
