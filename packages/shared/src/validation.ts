const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}'.\- ]{1,79}$/u;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  if (value.length > 254) return false;
  return EMAIL_RE.test(value);
}

/** Accepts international numbers such as +20 100 123 4567 or 01001234567. */
export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 24) return false;
  if (!/^\+?[0-9][0-9\s\-().]*$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export function isValidPersonName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (!NAME_RE.test(trimmed)) return false;
  // Reject control characters and repeated separator-only strings.
  return /[\p{L}\p{M}]{2}/u.test(trimmed);
}

const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;

export function isSafeHttpUrl(value: string): boolean {
  if (value.length > 500) return false;
  if (DANGEROUS_SCHEMES.test(value.trim())) return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  if (!url.hostname || !url.hostname.includes('.')) return false;
  return true;
}

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFilename(value: string): string {
  const base = value.replace(/\\/g, '/').split('/').pop() ?? 'document';
  const cleaned = base.replace(/[^\p{L}\p{N}._\- ]/gu, '_').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || 'document';
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
