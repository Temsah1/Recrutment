import { describe, expect, it } from 'vitest';
import { escapeCsvField, sanitizeCsvCell, toCsv } from '../src/csv.js';

describe('sanitizeCsvCell', () => {
  it('preserves ordinary values', () => {
    expect(sanitizeCsvCell('Layla Hassan')).toBe('Layla Hassan');
    expect(sanitizeCsvCell(42)).toBe('42');
    expect(sanitizeCsvCell(false)).toBe('false');
  });

  it('renders null and undefined as an empty cell', () => {
    expect(sanitizeCsvCell(null)).toBe('');
    expect(sanitizeCsvCell(undefined)).toBe('');
  });

  it.each(['=SUM(A1:A9)', '+201009876543', '-5', '@user', '\tname', '\rline'])(
    'neutralises formula-like input %j with a leading apostrophe',
    (value) => {
      expect(sanitizeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it('strips control characters but keeps tab and newline', () => {
    expect(sanitizeCsvCell('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeCsvCell('line1\nline2')).toBe('line1\nline2');
    expect(sanitizeCsvCell('col1\tcol2')).toBe('col1\tcol2');
  });
});

describe('escapeCsvField', () => {
  it('quotes fields containing commas, quotes, CR or LF', () => {
    expect(escapeCsvField('Doe, Jane')).toBe('"Doe, Jane"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('does not quote simple fields', () => {
    expect(escapeCsvField('ESME-2026-ABCD-EFGH-IJKL')).toBe('ESME-2026-ABCD-EFGH-IJKL');
  });

  it('quotes after sanitisation when the prefix introduces no special characters', () => {
    expect(escapeCsvField('=1,2')).toBe('"\'=1,2"');
  });
});

describe('toCsv', () => {
  it('writes a CRLF header, escapes cells and ends with a newline', () => {
    const csv = toCsv(
      ['Name', 'Note'],
      [
        ['Layla', 'a,b'],
        ['Omar', '=cmd'],
      ],
    );
    expect(csv).toBe("Name,Note\r\nLayla,\"a,b\"\r\nOmar,'=cmd\r\n");
  });

  it('produces a header-only document for no rows', () => {
    expect(toCsv(['A', 'B'], [])).toBe('A,B\r\n');
  });
});
