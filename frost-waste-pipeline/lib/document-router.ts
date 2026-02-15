// Document Quality Assessment & Routing
// Routes PDFs to Mistral OCR, Excel to Gemini Flash
// Quality assessment is done via hardcoded rules (no API call needed)

export interface QualityAssessment {
  fileType: "pdf" | "xlsx" | "xls" | "csv";
  qualityScore: number; // 0-1
  complexity: "LOW" | "MEDIUM" | "HIGH";
  tableCount: number;
  hasHandwriting: boolean;
  hasMergedCells: boolean;
  detectedLanguage: string;
  suggestedModel: "mistral-ocr" | "gemini-agentic";
  reasoning: string;
}

/**
 * Assess document quality and determine extraction model.
 * Uses hardcoded routing: PDFs -> Mistral OCR, Excel -> Gemini Flash.
 * No API call needed since routing is deterministic by file type.
 */
export async function assessDocumentQuality(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<QualityAssessment> {
  const fileType = filename.toLowerCase().endsWith(".pdf") 
    ? "pdf" 
    : filename.toLowerCase().endsWith(".xlsx") || filename.toLowerCase().endsWith(".xls")
    ? "xlsx"
    : "csv";

  if (fileType === "pdf") {
    return {
      fileType: "pdf",
      qualityScore: 0.8,
      complexity: "MEDIUM",
      tableCount: 1,
      hasHandwriting: false,
      hasMergedCells: false,
      detectedLanguage: "Swedish",
      suggestedModel: "mistral-ocr",
      reasoning: "PDF routed to Mistral OCR for text extraction",
    };
  }

  // Excel/CSV files route to Gemini
  return {
    fileType,
    qualityScore: 0.85,
    complexity: "MEDIUM",
    tableCount: 1,
    hasHandwriting: false,
    hasMergedCells: true,
    detectedLanguage: "Swedish",
    suggestedModel: "gemini-agentic",
    reasoning: "Excel files route to Gemini 3 Flash with Agentic Vision for merged cell handling",
  };
}

export function routeDocument(assessment: QualityAssessment): "mistral-ocr" | "gemini-agentic" {
  // Simple rule: PDFs → Mistral, Excel → Gemini
  if (assessment.fileType === "pdf") {
    return "mistral-ocr";
  }
  return "gemini-agentic";
}
