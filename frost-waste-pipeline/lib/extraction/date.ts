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

/**
 * Parse a period range and extract the END date
 * Handles formats like:
 * - "20251201-20251231" → "2025-12-31"
 * - "2025-12-01-2025-12-31" → "2025-12-31"
 * - "Period: 20251201-20251231" → "2025-12-31"
 * - "Period 2025-12-01 - 2025-12-31" → "2025-12-31"
 * 
 * @param value - The period string to parse
 * @returns The END date in YYYY-MM-DD format, or null if not a period
 */
export function parsePeriodEndDate(value: unknown): string | null {
  if (value == null || typeof value !== "string") return null;
  
  const s = value.trim();
  
  // Pattern 1: "YYYYMMDD-YYYYMMDD" (compact format, no dashes in dates)
  // Example: "20251201-20251231"
  const compactPeriod = s.match(/(\d{8})\s*[-–]\s*(\d{8})/);
  if (compactPeriod) {
    const endDate = compactPeriod[2];
    const year = endDate.slice(0, 4);
    const month = endDate.slice(4, 6);
    const day = endDate.slice(6, 8);
    const formatted = `${year}-${month}-${day}`;
    // Validate it's a real date
    const d = new Date(formatted);
    if (!Number.isNaN(d.getTime())) {
      return formatted;
    }
  }
  
  // Pattern 2: "YYYY-MM-DD - YYYY-MM-DD" or "YYYY-MM-DD-YYYY-MM-DD"
  // Example: "2025-12-01 - 2025-12-31" or "2025-12-01-2025-12-31"
  const isoPeriod = s.match(/(\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})/);
  if (isoPeriod) {
    const endDate = isoPeriod[2];
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) {
      return endDate;
    }
  }
  
  // Pattern 3: "DD/MM/YYYY - DD/MM/YYYY" (European format)
  const euPeriod = s.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*[-–]\s*(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (euPeriod) {
    const endDate = `${euPeriod[6]}-${euPeriod[5]}-${euPeriod[4]}`;
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) {
      return endDate;
    }
  }
  
  return null;
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

  // ✅ NEW: Check for period range first and extract END date
  // This handles "Period 20251201-20251231" → "2025-12-31"
  const periodEndDate = parsePeriodEndDate(s);
  if (periodEndDate) {
    return periodEndDate;
  }

  // Common: "2024-01-16" or "2024-01-16 09:59:46"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "2024/01/16"
  const iso2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s.*)?$/);
  if (iso2) return `${iso2[1]}-${iso2[2]}-${iso2[3]}`;

  // "16/01/2024" or "16-01-2024"
  const dmy = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(?:\s.*)?$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // ✅ NEW: Compact date without dashes "YYYYMMDD"
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const formatted = `${compact[1]}-${compact[2]}-${compact[3]}`;
    const d = new Date(formatted);
    if (!Number.isNaN(d.getTime())) {
      return formatted;
    }
  }

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

