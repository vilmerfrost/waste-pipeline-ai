import { describe, it, expect } from "vitest";
import { mergeExtractionResults, rowKey, appendNewRowsOnly } from "@/lib/merge-utils";

const item = (date: string, loc: string, mat: string, receiver: string, weight: number) => ({
  date: { value: date, confidence: 1 },
  location: { value: loc, confidence: 1 },
  address: { value: loc, confidence: 1 },
  material: { value: mat, confidence: 1 },
  receiver: { value: receiver, confidence: 1 },
  weightKg: { value: weight, confidence: 1 },
});

describe("mergeExtractionResults", () => {
  it("user deleted 2 rows from 8 → dubbelkoll re-extracts 8 → result should be 6", () => {
    const original = [
      item("2025-01-01", "A", "M1", "R1", 100),
      item("2025-01-01", "A", "M2", "R1", 200),
      item("2025-01-01", "A", "M3", "R1", 300),
      item("2025-01-01", "A", "M4", "R1", 400),
      item("2025-01-01", "A", "M5", "R1", 500),
      item("2025-01-01", "A", "M6", "R1", 600),
      item("2025-01-01", "A", "M7", "R1", 700),
      item("2025-01-01", "A", "M8", "R1", 800),
    ];
    const current = [
      item("2025-01-01", "A", "M1", "R1", 100),
      item("2025-01-01", "A", "M2", "R1", 200),
      item("2025-01-01", "A", "M4", "R1", 400),
      item("2025-01-01", "A", "M5", "R1", 500),
      item("2025-01-01", "A", "M6", "R1", 600),
      item("2025-01-01", "A", "M8", "R1", 800),
    ];
    const newExtraction = [...original];

    const result = mergeExtractionResults(current, newExtraction, original);

    expect(result).toHaveLength(6);
    expect(result.map((r) => getVal(r.material))).toEqual(["M1", "M2", "M4", "M5", "M6", "M8"]);
  });

  it("user edited a weight value → user's edit preserved", () => {
    const original = [item("2025-01-01", "A", "M1", "R1", 100)];
    const current = [item("2025-01-01", "A", "M1", "R1", 999)];
    const newExtraction = [item("2025-01-01", "A", "M1", "R1", 100)];

    const result = mergeExtractionResults(current, newExtraction, original);

    expect(result).toHaveLength(1);
    expect(getVal(result[0].weightKg)).toBe(999);
  });

  it("re-extraction finds 1 new row → it gets added", () => {
    const original = [item("2025-01-01", "A", "M1", "R1", 100)];
    const current = [item("2025-01-01", "A", "M1", "R1", 100)];
    const newExtraction = [
      item("2025-01-01", "A", "M1", "R1", 100),
      item("2025-01-01", "B", "M2", "R1", 200),
    ];

    const result = mergeExtractionResults(current, newExtraction, original);

    expect(result).toHaveLength(2);
    expect(getVal(result[1].material)).toBe("M2");
    expect(getVal(result[1].location)).toBe("B");
  });

  it("user-edited row that new extraction missed → kept", () => {
    const original = [item("2025-01-01", "A", "M1", "R1", 100)];
    const current = [item("2025-01-01", "A", "M1", "R1", 999)];
    const newExtraction: any[] = [];

    const result = mergeExtractionResults(current, newExtraction, original);

    expect(result).toHaveLength(1);
    expect(getVal(result[0].weightKg)).toBe(999);
  });

  it("empty lineItems edge cases", () => {
    expect(mergeExtractionResults([], [], [])).toEqual([]);
    expect(mergeExtractionResults([], [item("2025-01-01", "A", "M1", "R1", 100)], [])).toHaveLength(1);
    expect(mergeExtractionResults([item("2025-01-01", "A", "M1", "R1", 100)], [], [])).toHaveLength(0);
  });

  it("no _originalLineItems (old document) → user state preserved, only new rows added", () => {
    const current = [
      item("2025-01-01", "A", "M1", "R1", 100),
      item("2025-01-01", "A", "M2", "R1", 200),
    ];
    const newExtraction = [
      item("2025-01-01", "A", "M1", "R1", 111),
      item("2025-01-01", "A", "M2", "R1", 222),
      item("2025-01-01", "B", "M3", "R1", 300),
    ];
    const result = appendNewRowsOnly(current, newExtraction);

    expect(result).toHaveLength(3);
    expect(getVal(result[0].weightKg)).toBe(100);
    expect(getVal(result[1].weightKg)).toBe(200);
    expect(getVal(result[2].material)).toBe("M3");
  });
});

describe("rowKey", () => {
  it("handles wrapped {value, confidence} format", () => {
    const i = item("2025-01-01", "Addr", "Mat", "Rec", 100);
    expect(rowKey(i)).toBe("2025-01-01|Addr|Mat|Rec");
  });

  it("handles location vs address (either can provide value)", () => {
    const withLocation = { date: { value: "2025-01-01" }, location: { value: "Loc" }, material: { value: "M" }, receiver: { value: "R" } };
    const withAddress = { date: { value: "2025-01-01" }, address: { value: "Loc" }, material: { value: "M" }, receiver: { value: "R" } };
    expect(rowKey(withLocation)).toBe(rowKey(withAddress));
  });

  it("handles plain values", () => {
    const plain = { date: "2025-01-01", location: "A", material: "M", receiver: "R" };
    expect(rowKey(plain)).toBe("2025-01-01|A|M|R");
  });
});

function getVal(f: any): any {
  if (!f) return undefined;
  if (typeof f === "object" && "value" in f) return f.value;
  return f;
}
