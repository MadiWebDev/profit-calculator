/**
 * CSV/Excel formula injection neutralization (R7).
 * A cell that starts with =, +, -, @ (optionally after whitespace, or
 * after a tab/CR) is executed as a formula by Excel/Sheets. Prefixing
 * with a single quote neutralizes it while keeping the value readable.
 * Also strips control characters that could smuggle a formula.
 */
export function neutralizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const trimmed = s.replace(/^[\s\t\r\n]+/, "");
  if (/^[=+\-@]/.test(trimmed)) {
    // Preserve original leading whitespace? No — a leading tab/space is
    // itself part of the smuggling trick, so normalize to the quote.
    s = "'" + trimmed;
  }
  return s;
}

export function csvEscape(value: unknown): string {
  const s = neutralizeCsvCell(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from headers + rows, with every cell neutralized. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\n");
}
