export function nowIso(): string {
  return new Date().toISOString();
}

export function addSeconds(seconds: number, from: Date = new Date()): string {
  return new Date(from.getTime() + seconds * 1000).toISOString();
}

export function isPast(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() <= now.getTime();
}

export function isoDateOf(iso: string): string {
  return iso.slice(0, 10);
}
