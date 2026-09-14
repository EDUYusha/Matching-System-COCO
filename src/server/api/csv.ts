/** RFC 4180 quoting, as the admin CSV exports used. */
export function toCsv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\r\n');
}

/**
 * A CSV download. The leading BOM is deliberate: without it Excel on Windows
 * renders the Japanese columns as mojibake.
 */
export function csvResponse(rows: Array<Array<string | number>>, filename: string): Response {
  return new Response(`﻿${toCsv(rows)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
