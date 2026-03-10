/**
 * Recompute extraction stats from merged line items.
 * Used after dubbelkoll merge to ensure no NaN/undefined in displayed stats.
 */

function getVal(f: any): any {
  if (f === null || f === undefined) return undefined;
  if (typeof f === "object" && "value" in f) return f.value;
  return f;
}

export interface ExtractionStats {
  totalWeightKg: number;
  uniqueAddresses: number;
  uniqueReceivers: number;
  uniqueMaterials: number;
}

export function computeExtractionStats(lineItems: any[]): ExtractionStats {
  const totalWeightKg = (lineItems || []).reduce((sum: number, item: any) => {
    const val = getVal(item.weightKg);
    return sum + (parseFloat(String(val)) || 0);
  }, 0);

  const getLocation = (i: any) => getVal(i.location) || getVal(i.address);
  const uniqueAddresses = new Set(
    (lineItems || []).map(getLocation).filter((v) => v != null && v !== "")
  ).size;
  const uniqueReceivers = new Set(
    (lineItems || []).map((i) => getVal(i.receiver)).filter((v) => v != null && v !== "")
  ).size;
  const uniqueMaterials = new Set(
    (lineItems || []).map((i) => getVal(i.material)).filter((v) => v != null && v !== "")
  ).size;

  return {
    totalWeightKg,
    uniqueAddresses,
    uniqueReceivers,
    uniqueMaterials,
  };
}
