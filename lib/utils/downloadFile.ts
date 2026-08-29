/**
 * Trigger a browser download for a Blob. The anchor is appended to the
 * document before the click (a click on a detached anchor starts nothing in
 * Firefox) and the object URL is revoked only after the click has been
 * dispatched — revoking synchronously is the classic cancelled-download bug.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** RFC 4180-ish: quote a cell when it holds a comma, quote or newline. */
export function csvFromRows(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  downloadBlob(filename, new Blob([csvFromRows(rows)], { type: "text/csv" }));
}
