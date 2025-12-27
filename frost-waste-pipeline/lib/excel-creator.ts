/**
 * Excel Creator - TypeScript Implementation
 * Matches Collecct/Martin's expected format EXACTLY
 * Creates multiple rows per document (one row per material)
 */

import * as XLSX from "xlsx";

export interface ExtractedDataRow {
  date: string;              // Datum (YYYY-MM-DD)
  filename: string;          // Filnamn (original filename - CRITICAL!)
  supplier: string;          // Leverantör
  material: string;          // Material
  weight_kg: string;         // Vikt (kg) - format: "XXX,XX" (comma separator)
  unit: string;              // Enhet (always "kg")
  cost_kr: string;           // Kostnad (kr)
  address: string;           // Adress
  receiver: string;          // Mottagare
  handling: string;          // Hantering (e.g., "Energiåtervinning")
  hazardous: string;         // Farligt Avfall ("Ja"/"Nej")
  co2_saved: string;         // CO2 Besparing
  status: string;            // Status (e.g., "verified")
}

export interface SummaryData {
  total_rows: number;
  valid_rows: number;
  changes?: string[];
  flags?: string[];
}

export class ExcelCreator {
  private headers = [
    "Datum",
    "Filnamn",
    "Leverantör",
    "Material",
    "Vikt (kg)",
    "Enhet",
    "Kostnad (kr)",
    "Adress",
    "Mottagare",
    "Hantering",
    "Farligt Avfall",
    "CO2 Besparing",
    "Status"
  ];

  /**
   * Format weight to Swedish format: "XXX,XX" (no thousand separator, comma decimal)
   */
  private formatWeight(weight: number): string {
    return weight.toFixed(2).replace(".", ",");
  }

  /**
   * Format cost to Swedish format
   */
  private formatCost(cost: number): string {
    return cost.toFixed(2).replace(".", ",");
  }

  /**
   * Create Excel file from extracted data
   * Each row in extractedData represents ONE MATERIAL from the document
   */
  createExcelWithSummary(
    extractedData: ExtractedDataRow[],
    summary: SummaryData,
    originalFilename: string
  ): Buffer {
    const wb = XLSX.utils.book_new();

    // === SUMMARY SHEET ===
    const summaryData: any[][] = [
      ["PROCESSING SUMMARY"],
      [],
      ["Original File:", originalFilename],
      ["Total Rows:", summary.total_rows],
      ["Valid Rows:", summary.valid_rows],
      ["Errors:", summary.flags?.length || 0],
    ];

    if (summary.changes && summary.changes.length > 0) {
      summaryData.push([]);
      summaryData.push(["CHANGES MADE:"]);
      summary.changes.forEach((change) => {
        summaryData.push([` • ${change}`]);
      });
    }

    if (summary.flags && summary.flags.length > 0) {
      summaryData.push([]);
      summaryData.push(["ISSUES FOUND:"]);
      summary.flags.forEach((flag) => {
        summaryData.push([` ⚠ ${flag}`]);
      });
    }

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary["!cols"] = [{ wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // === DATA SHEET ===
    const dataRows: any[][] = [this.headers];

    extractedData.forEach((item) => {
      dataRows.push([
        item.date || "",
        item.filename || "",
        item.supplier || "",
        item.material || "",
        item.weight_kg || "",
        item.unit || "kg",
        item.cost_kr || "0,00",
        item.address || "",
        item.receiver || "",
        item.handling || "",
        item.hazardous || "Nej",
        item.co2_saved || "",
        item.status || "pending_review"
      ]);
    });

    const wsData = XLSX.utils.aoa_to_sheet(dataRows);
    wsData["!cols"] = [
      { wch: 12 },  // Datum
      { wch: 25 },  // Filnamn
      { wch: 20 },  // Leverantör
      { wch: 25 },  // Material
      { wch: 12 },  // Vikt (kg)
      { wch: 8 },   // Enhet
      { wch: 12 },  // Kostnad (kr)
      { wch: 35 },  // Adress
      { wch: 30 },  // Mottagare
      { wch: 20 },  // Hantering
      { wch: 15 },  // Farligt Avfall
      { wch: 12 },  // CO2 Besparing
      { wch: 15 },  // Status
    ];

    XLSX.utils.book_append_sheet(wb, wsData, "Data");

    // Convert to buffer
    return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  }

  /**
   * Create simple Excel file (without summary)
   */
  createExcel(extractedData: ExtractedDataRow[], originalFilename: string): Buffer {
    return this.createExcelWithSummary(
      extractedData,
      {
        total_rows: extractedData.length,
        valid_rows: extractedData.filter(
          (r) => r.weight_kg && r.address && r.date && r.material
        ).length,
      },
      originalFilename
    );
  }

  /**
   * Convert WasteRecord (from your schema) to Excel rows
   * This creates MULTIPLE rows - one per lineItem (material)
   */
  convertWasteRecordToExcelRows(
    wasteRecord: any,
    originalFilename: string
  ): ExtractedDataRow[] {
    const rows: ExtractedDataRow[] = [];

    // If there are lineItems, create one row per lineItem
    if (wasteRecord.lineItems && wasteRecord.lineItems.length > 0) {
      wasteRecord.lineItems.forEach((lineItem: any) => {
        rows.push({
          date: wasteRecord.date?.value || "",
          filename: originalFilename,
          supplier: wasteRecord.supplier?.value || "",
          material: lineItem.material?.value || "",
          weight_kg: this.formatWeight(lineItem.weightKg?.value || 0),
          unit: "kg",
          cost_kr: this.formatCost(wasteRecord.cost?.value || 0),
          address: lineItem.address?.value || wasteRecord.address?.value || "",
          receiver: lineItem.receiver?.value || wasteRecord.receiver?.value || "",
          handling: lineItem.handling?.value || "",
          hazardous: lineItem.isHazardous?.value ? "Ja" : "Nej",
          co2_saved: lineItem.co2Saved?.value ? String(lineItem.co2Saved.value) : "",
          status: "pending_review"
        });
      });
    } else {
      // Fallback: If no lineItems, create single row with main data
      rows.push({
        date: wasteRecord.date?.value || "",
        filename: originalFilename,
        supplier: wasteRecord.supplier?.value || "",
        material: wasteRecord.material?.value || "",
        weight_kg: this.formatWeight(wasteRecord.weightKg?.value || 0),
        unit: "kg",
        cost_kr: this.formatCost(wasteRecord.cost?.value || 0),
        address: wasteRecord.address?.value || "",
        receiver: wasteRecord.receiver?.value || "",
        handling: "",
        hazardous: "Nej",
        co2_saved: wasteRecord.totalCo2Saved?.value ? String(wasteRecord.totalCo2Saved.value) : "",
        status: "pending_review"
      });
    }

    return rows;
  }
}
