/**
 * Summary Generator - TypeScript Implementation
 * Matches Python summary_generator.py functionality
 */

export interface ValidationIssue {
  row: number;
  field: string;
  type: "error" | "warning";
  message: string;
}

export interface ExtractedDataRow {
  id?: number;
  weight_kg?: number;
  address?: string;
  date?: string;
  recipient?: string;
  waste_type?: string;
  original_unit?: string;
  original_value?: number;
  confidence?: number;
}

export interface SummaryResult {
  total_rows: number;
  valid_rows: number;
  changes: string[];
  flags: string[];
  missing_fields: Record<string, number>;
  conversions: number;
  text: string;
}

export class SummaryGenerator {
  /**
   * Generate complete summary of processing
   */
  generateSummary(
    extractedData: ExtractedDataRow[],
    validationIssues: ValidationIssue[]
  ): SummaryResult {
    const summary: SummaryResult = {
      total_rows: extractedData.length,
      valid_rows: 0,
      changes: [],
      flags: [],
      missing_fields: {},
      conversions: 0,
      text: "",
    };

    // Count valid rows (has all required fields)
    extractedData.forEach((row) => {
      if (row.weight_kg && row.address && row.date) {
        summary.valid_rows++;
      }
    });

    // Track missing fields
    extractedData.forEach((row) => {
      const fields = ["weight_kg", "address", "date", "recipient", "waste_type"];
      fields.forEach((field) => {
        if (!row[field as keyof ExtractedDataRow]) {
          summary.missing_fields[field] = (summary.missing_fields[field] || 0) + 1;
        }
      });
    });

    // Track conversions
    extractedData.forEach((row) => {
      if (row.original_unit && row.original_unit !== "kg" && row.original_value) {
        summary.conversions++;
        summary.changes.push(
          `Row ${row.id || "?"}: Konverterade ${row.original_value} ${row.original_unit} → ${row.weight_kg} kg`
        );
      }
    });

    // Process validation issues
    validationIssues.forEach((issue) => {
      const issueType = issue.type || "error";
      const rowIndex = issue.row || "?";
      const message = issue.message || "Unknown issue";

      if (issueType === "error") {
        summary.flags.push(`Rad ${rowIndex}: ${message}`);
      } else {
        summary.flags.push(`Rad ${rowIndex}: ⚠️ ${message}`);
      }
    });

    // Generate human-readable text summary
    summary.text = this.generateTextSummary(summary);

    return summary;
  }

  /**
   * Generate human-readable text summary
   */
  private generateTextSummary(summary: SummaryResult): string {
    const parts: string[] = [];

    parts.push(`Processade ${summary.total_rows} rader`);
    parts.push(`${summary.valid_rows} giltiga`);

    const errorCount = summary.flags.length;
    if (errorCount > 0) {
      parts.push(`${errorCount} problem`);
    }

    if (summary.conversions > 0) {
      parts.push(`${summary.conversions} konverteringar`);
    }

    return parts.join(", ");
  }

  /**
   * Generate detailed text report
   */
  generateDetailedReport(
    extractedData: ExtractedDataRow[],
    validationIssues: ValidationIssue[],
    originalFilename: string
  ): string {
    const summary = this.generateSummary(extractedData, validationIssues);

    const report: string[] = [];
    report.push("=".repeat(60));
    report.push(`PROCESSING REPORT: ${originalFilename}`);
    report.push("=".repeat(60));
    report.push("");

    // Stats
    report.push("📊 STATISTICS:");
    report.push(`  Total rows: ${summary.total_rows}`);
    report.push(`  Valid rows: ${summary.valid_rows}`);
    report.push(`  Issues: ${summary.flags.length}`);
    report.push(`  Conversions: ${summary.conversions}`);
    report.push("");

    // Missing fields
    if (Object.keys(summary.missing_fields).length > 0) {
      report.push("⚠️  MISSING FIELDS:");
      Object.entries(summary.missing_fields).forEach(([field, count]) => {
        report.push(`  ${field}: ${count} rows`);
      });
      report.push("");
    }

    // Changes
    if (summary.changes.length > 0) {
      report.push("🔄 CHANGES MADE:");
      summary.changes.forEach((change) => {
        report.push(`  • ${change}`);
      });
      report.push("");
    }

    // Flags
    if (summary.flags.length > 0) {
      report.push("🚩 ISSUES FOUND:");
      summary.flags.slice(0, 10).forEach((flag) => {
        report.push(`  • ${flag}`);
      });
      if (summary.flags.length > 10) {
        report.push(`  ... and ${summary.flags.length - 10} more`);
      }
      report.push("");
    }

    report.push("=".repeat(60));

    return report.join("\n");
  }
}

