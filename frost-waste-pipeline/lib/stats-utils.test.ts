import { describe, it, expect } from "vitest";
import { computeExtractionStats } from "@/lib/stats-utils";

describe("computeExtractionStats", () => {
  it("computes totalWeightKg, uniqueAddresses, uniqueReceivers, uniqueMaterials correctly", () => {
    const items = [
      { weightKg: { value: 100 }, location: { value: "A" }, receiver: { value: "R1" }, material: { value: "M1" } },
      { weightKg: { value: 200 }, location: { value: "A" }, receiver: { value: "R1" }, material: { value: "M2" } },
      { weightKg: { value: 150 }, location: { value: "B" }, receiver: { value: "R2" }, material: { value: "M1" } },
    ];
    const stats = computeExtractionStats(items);

    expect(stats.totalWeightKg).toBe(450);
    expect(stats.uniqueAddresses).toBe(2);
    expect(stats.uniqueReceivers).toBe(2);
    expect(stats.uniqueMaterials).toBe(2);
  });

  it("no NaN, undefined, or null in any stat field", () => {
    const empty = computeExtractionStats([]);
    expect(Number.isNaN(empty.totalWeightKg)).toBe(false);
    expect(empty.totalWeightKg).toBe(0);
    expect(empty.uniqueAddresses).toBe(0);
    expect(empty.uniqueReceivers).toBe(0);
    expect(empty.uniqueMaterials).toBe(0);

    const withInvalid = [
      { weightKg: { value: "bad" }, location: null, receiver: undefined, material: "" },
    ];
    const stats = computeExtractionStats(withInvalid);
    expect(Number.isNaN(stats.totalWeightKg)).toBe(false);
    expect(stats.totalWeightKg).toBe(0);
    expect(stats.uniqueAddresses).toBe(0);
    expect(stats.uniqueReceivers).toBe(0);
    expect(stats.uniqueMaterials).toBe(0);
  });

  it("handles both wrapped {value, confidence} and plain values", () => {
    const mixed = [
      { weightKg: { value: 100 }, location: "Addr1", receiver: "R1", material: "M1" },
      { weightKg: 200, location: { value: "Addr2" }, receiver: { value: "R2" }, material: { value: "M2" } },
    ];
    const stats = computeExtractionStats(mixed);

    expect(stats.totalWeightKg).toBe(300);
    expect(stats.uniqueAddresses).toBe(2);
    expect(stats.uniqueReceivers).toBe(2);
    expect(stats.uniqueMaterials).toBe(2);
  });

  it("uses address when location is missing", () => {
    const items = [
      { weightKg: 100, address: { value: "Via Address" }, receiver: "R", material: "M" },
    ];
    const stats = computeExtractionStats(items);
    expect(stats.uniqueAddresses).toBe(1);
  });
});
