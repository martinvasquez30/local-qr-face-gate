// CSV export, made in the browser: no server call and no library.

// Excel in Spanish uses ";" between columns (the comma is the decimal mark),
// so with ";" the file opens in columns with a double click.
const SEPARATOR = ";";

// A value with the separator, quotes or line breaks goes between quotes, and
// its quotes are doubled (the CSV rule).
function csvCell(value) {
  const text = String(value ?? "");
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/** Rows (lists of values) to CSV text. The first row is usually the header. */
export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(SEPARATOR)).join("\r\n");
}

/** Make the browser save `text` as a file named `fileName`. */
export function downloadCsv(fileName, text) {
  // "﻿" (BOM) tells Excel the file is UTF-8, so accents look right.
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
