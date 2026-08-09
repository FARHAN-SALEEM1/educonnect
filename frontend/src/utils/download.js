/** Browser-side file downloads for the report/export buttons. */

const save = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** Escapes a value for CSV: quotes it, and doubles any inner quotes. */
const cell = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * @param {string} filename
 * @param {Array<Object>} rows
 * @param {Array<[string,string]>} [columns] [header, key] pairs; defaults to the keys of the first row
 */
export const downloadCsv = (filename, rows, columns) => {
  if (!rows?.length) return false;

  const cols = columns ?? Object.keys(rows[0]).map((k) => [k, k]);
  const lines = [
    cols.map(([header]) => cell(header)).join(","),
    ...rows.map((row) => cols.map(([, key]) => cell(row[key])).join(",")),
  ];

  // BOM so Excel opens UTF-8 (student names, ₨, en-dashes) correctly.
  save(filename, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  return true;
};

export const downloadJson = (filename, data) => {
  save(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  return true;
};

/** "institute-report-2026-08-09.csv" */
export const stamped = (base, ext) => `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
