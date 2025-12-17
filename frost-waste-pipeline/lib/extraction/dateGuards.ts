// src/lib/extraction/dateGuards.ts
export function assertRowLevelDates(
  datesISO: string[],
  ctx: { filename?: string; minUnique?: number; totalRows?: number; extractedAtISO?: string }
) {
  const total = datesISO.length;
  if (!total) throw new Error(`❌ No dates to validate ${ctx.filename ? `in ${ctx.filename}` : ""}`);

  const unique = new Set(datesISO).size;

  const minUnique = ctx.minUnique ?? (total >= 200 ? 5 : 2);
  if (unique < minUnique) {
    throw new Error(
      `❌ Suspicious date extraction: only ${unique} unique dates across ${total} rows` +
        (ctx.filename ? ` in file=${ctx.filename}` : "")
    );
  }

  // Extra guard: if everything equals extractedAt (classic bug)
  if (ctx.extractedAtISO) {
    const extractedDay = ctx.extractedAtISO.slice(0, 10);
    const allSameAsExtracted = datesISO.every((d) => d === extractedDay);
    if (allSameAsExtracted && total >= 10) {
      throw new Error(
        `❌ Date bug detected: all rows have date=${extractedDay} (looks like extracted_at, not transaction date)` +
          (ctx.filename ? ` in file=${ctx.filename}` : "")
      );
    }
  }
}

