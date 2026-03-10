/**
 * Merge utility for AI Dubbelkoll re-extraction.
 * Preserves user edits when re-running extraction on an existing document.
 */

function getFieldValue(f: any): string {
  if (f === null || f === undefined) return '';
  if (typeof f === 'object' && 'value' in f) return String(f.value ?? '');
  return String(f);
}

function rowKey(item: any): string {
  return [
    getFieldValue(item.date),
    getFieldValue(item.location) || getFieldValue(item.address),
    getFieldValue(item.material),
    getFieldValue(item.receiver),
  ].join('|');
}

function matchRow(a: any, b: any): boolean {
  return rowKey(a) === rowKey(b);
}

function hasUserEdits(current: any, original: any): boolean {
  const fields = ['date', 'location', 'address', 'material', 'weightKg', 'receiver', 'unit'];
  return fields.some(field => getFieldValue(current[field]) !== getFieldValue(original[field]));
}

/**
 * Merges re-extraction results with current (user-edited) data.
 *
 * Rules:
 * - Deleted rows (in original but not in current) → stay deleted
 * - User-edited rows → keep user's version
 * - Untouched rows → use new extraction value
 * - New rows found by re-extraction → add them
 * - User-edited rows that new extraction missed → keep them
 */
export function mergeExtractionResults(
  currentItems: any[],
  newItems: any[],
  originalItems: any[]
): any[] {
  const deletedKeys = new Set(
    originalItems
      .filter(orig => !currentItems.some(curr => matchRow(curr, orig)))
      .map(item => rowKey(item))
  );

  const userEditedMap = new Map<string, any>();
  for (const curr of currentItems) {
    const orig = originalItems.find(o => matchRow(o, curr));
    if (orig && hasUserEdits(curr, orig)) {
      userEditedMap.set(rowKey(curr), curr);
    }
  }

  const merged: any[] = [];

  for (const newItem of newItems) {
    const key = rowKey(newItem);
    if (deletedKeys.has(key)) continue;
    if (userEditedMap.has(key)) {
      merged.push(userEditedMap.get(key));
    } else {
      merged.push(newItem);
    }
  }

  // Keep user-edited rows that new extraction missed
  for (const [key, item] of userEditedMap) {
    if (!merged.some(m => rowKey(m) === key)) {
      merged.push(item);
    }
  }

  return merged;
}
