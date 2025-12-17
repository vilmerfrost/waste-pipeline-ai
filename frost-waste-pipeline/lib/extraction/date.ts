// src/lib/extraction/date.ts
export function parseSwedishNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  // "185,00" -> 185.00
  const cleaned = value.trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseAnyDateToISO(value: unknown): string | null {
  if (value == null) return null;

  // Already Date
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  // Excel serial date (if some files store dates as numbers)
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial: base 1899-12-30
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  if (typeof value !== "string") return null;
  const s = value.trim();

  // Common: "2024-01-16" or "2024-01-16 09:59:46"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "2024/01/16"
  const iso2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s.*)?$/);
  if (iso2) return `${iso2[1]}-${iso2[2]}-${iso2[3]}`;

  // "16/01/2024" or "16-01-2024"
  const dmy = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(?:\s.*)?$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  return null;
}

export function mustParseDateISO(
  value: unknown,
  ctx: { filename?: string; rowIndex?: number; column?: string; yearHint?: number }
): string {
  const iso = parseAnyDateToISO(value);
  if (!iso) {
    throw new Error(
      `❌ Could not parse date from value="${String(value)}" (${ctx.column ?? "unknown column"})` +
        (ctx.rowIndex != null ? ` at row=${ctx.rowIndex}` : "") +
        (ctx.filename ? ` in file=${ctx.filename}` : "")
    );
  }

  if (ctx.yearHint && !iso.startsWith(String(ctx.yearHint))) {
    // Soft guard: not always fatal, but for demo you probably want strict
    throw new Error(
      `❌ Date "${iso}" does not match expected yearHint=${ctx.yearHint}` +
        (ctx.rowIndex != null ? ` at row=${ctx.rowIndex}` : "") +
        (ctx.filename ? ` in file=${ctx.filename}` : "")
    );
  }

  return iso;
}

