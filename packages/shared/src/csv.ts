const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Neutralises spreadsheet formula injection while preserving the visible value.
 * Excel/LibreOffice/Sheets treat leading = + - @ (and tab/CR) as formulas.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : String(value);
  // Strip control characters except tab/newline, which are quoted safely.
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return text;
}

export function escapeCsvField(value: unknown): string {
  const text = sanitizeCsvCell(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
