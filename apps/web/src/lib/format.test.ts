import { describe, expect, it, vi } from 'vitest';
import { formatBytes, formatDate, formatDateTime, initials, relativeTime } from './format.js';

describe('formatting helpers', () => {
  it('formats byte sizes with sensible precision', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('derives up to two initials', () => {
    expect(initials('Layla Hassan')).toBe('LH');
    expect(initials('Omar')).toBe('O');
    expect(initials('  ')).toBe('ES');
    expect(initials('Mohamed Ahmed Ali')).toBe('MA');
  });

  it('renders an em dash for missing or invalid dates', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(relativeTime('not-a-date')).toBe('—');
  });

  it('formats valid dates in the requested timezone', () => {
    const value = '2026-01-15T12:00:00.000Z';
    expect(formatDate(value, 'Africa/Cairo')).toContain('2026');
    expect(formatDateTime(value, 'UTC')).toContain('2026');
    expect(formatDate(value, 'UTC')).not.toBe('—');
  });

  it('renders relative time for past and future instants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    expect(relativeTime('2026-06-01T13:00:00.000Z')).toMatch(/in 1 hour/);
    expect(relativeTime('2026-06-01T11:00:00.000Z')).toMatch(/1 hour ago/);
    expect(relativeTime('2026-06-03T12:00:00.000Z')).toMatch(/in 2 days/);
    vi.useRealTimers();
  });
});
