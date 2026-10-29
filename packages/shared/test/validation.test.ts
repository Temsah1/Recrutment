import { describe, expect, it } from 'vitest';
import {
  isSafeHttpUrl,
  isValidEmail,
  isValidPersonName,
  isValidPhone,
  isValidTimezone,
  normalizeEmail,
  normalizePhone,
  sanitizeFilename,
  slugify,
} from '../src/index.js';

describe('email validation', () => {
  it('accepts ordinary addresses and normalises case', () => {
    expect(isValidEmail('layla@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.co.uk')).toBe(true);
    expect(normalizeEmail('  Layla@Example.COM ')).toBe('layla@example.com');
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@example.com')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });
});

describe('phone validation', () => {
  it('accepts international and local Egyptian formats', () => {
    expect(isValidPhone('+20 100 123 4567')).toBe(true);
    expect(isValidPhone('01001234567')).toBe(true);
    expect(isValidPhone('123-456-7890')).toBe(true);
  });

  it('rejects letters, too few digits and overlong numbers', () => {
    expect(isValidPhone('call me')).toBe(false);
    expect(isValidPhone('1234567')).toBe(false);
    expect(isValidPhone('+1234567890123456')).toBe(false);
  });

  it('normalises to a comparable digit string', () => {
    expect(normalizePhone('+20 (100) 123-4567')).toBe('+201001234567');
    expect(normalizePhone('0100 123 4567')).toBe('01001234567');
  });
});

describe('person name validation', () => {
  it('accepts Latin, Arabic and hyphenated names', () => {
    expect(isValidPersonName('Layla Hassan')).toBe(true);
    expect(isValidPersonName("O'Brien")).toBe(true);
    expect(isValidPersonName('Jean-Luc')).toBe(true);
    expect(isValidPersonName('محمد أحمد')).toBe(true);
  });

  it('rejects digits, single characters and symbol-only names', () => {
    expect(isValidPersonName('A')).toBe(false);
    expect(isValidPersonName('John123')).toBe(false);
    expect(isValidPersonName('-- --')).toBe(false);
    expect(isValidPersonName('   ')).toBe(false);
  });
});

describe('URL validation', () => {
  it('accepts http(s) URLs', () => {
    expect(isSafeHttpUrl('https://github.com/esme')).toBe(true);
    expect(isSafeHttpUrl('http://example.com/portfolio?x=1')).toBe(true);
  });

  it('rejects script schemes, credentials and hostless values', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isSafeHttpUrl('ftp://example.com')).toBe(false);
    expect(isSafeHttpUrl('https://user:pass@example.com')).toBe(false);
    expect(isSafeHttpUrl('https://localhost')).toBe(false);
    expect(isSafeHttpUrl('not a url')).toBe(false);
    expect(isSafeHttpUrl(`https://example.com/${'a'.repeat(500)}`)).toBe(false);
  });
});

describe('timezone and filename helpers', () => {
  it('recognises IANA timezones', () => {
    expect(isValidTimezone('Africa/Cairo')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Not/AZone')).toBe(false);
  });

  it('removes directory components from uploaded filenames', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\national id.pdf')).toBe('national id.pdf');
    expect(sanitizeFilename('my<id>.pdf')).toBe('my_id_.pdf');
    expect(sanitizeFilename('')).toBe('document');
  });

  it('slugifies department names', () => {
    expect(slugify('Machine Learning & Data Analysis')).toBe('machine-learning-data-analysis');
    expect(slugify('Café')).toBe('cafe');
    expect(slugify('---')).toBe('');
  });
});
