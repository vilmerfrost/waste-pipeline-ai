// Document Quality Assessment & Routing
// Uses Gemini 3 Flash via OpenRouter to assess document quality and route to appropriate extractor

import { callGeminiFlashWithVision } from "./ai-clients";

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

  // For Excel files, route directly to Gemini (no need for quality assessment)
  if (fileType !== "pdf") {
    return {
      fileType,
      qualityScore: 0.85,
      complexity: "MEDIUM",
      tableCount: 1,
      hasHandwriting: false,
      hasMergedCells: true, // Assume true for Excel
      detectedLanguage: "Swedish",
      suggestedModel: "gemini-agentic",
      reasoning: "Excel files route to Gemini 3 Flash with Agentic Vision for merged cell handling",
    };
  }

  // For PDFs, do quick assessment
  const base64 = buffer.toString("base64");
  
  const prompt = `Analyze this PDF document for extraction routing. Quick assessment only.

Return JSON (no markdown, no backticks):
{
  "qualityScore": 0.0-1.0 (1.0 = perfect scan, 0.0 = illegible),
  "complexity": "LOW" | "MEDIUM" | "HIGH",
  "tableCount": number (estimate),
  "hasHandwriting": boolean,
  "hasMergedCells": boolean,
  "detectedLanguage": "Swedish" | "Norwegian" | "Danish" | "Finnish" | "English",
  "reasoning": "brief explanation"
}

Assessment criteria:
- HIGH complexity: 3+ tables, merged cells, handwriting, scanned/low-DPI
- MEDIUM complexity: 1-2 tables, clean layout, some formatting
- LOW complexity: Simple text, single table, clear structure`;

  try {
    const result = await callGeminiFlashWithVision(prompt, base64, "application/pdf");
    
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const assessment = JSON.parse(jsonMatch?.[0] || "{}");

    return {
      fileType: "pdf",
      qualityScore: assessment.qualityScore || 0.7,
      complexity: assessment.complexity || "MEDIUM",
      tableCount: assessment.tableCount || 1,
      hasHandwriting: assessment.hasHandwriting || false,
      hasMergedCells: assessment.hasMergedCells || false,
      detectedLanguage: assessment.detectedLanguage || "Swedish",
      suggestedModel: "mistral-ocr", // ALL PDFs go to Mistral
      reasoning: assessment.reasoning || "PDF routed to Mistral OCR",
    };
  } catch (error) {
    console.error("[Router] Quality assessment failed, defaulting to Mistral:", error);
    return {
      fileType: "pdf",
      qualityScore: 0.7,
      complexity: "MEDIUM",
      tableCount: 1,
      hasHandwriting: false,
      hasMergedCells: false,
      detectedLanguage: "Swedish",
      suggestedModel: "mistral-ocr",
      reasoning: "Assessment failed, defaulting to Mistral OCR for PDF",
    };
  }
}

export function routeDocument(assessment: QualityAssessment): "mistral-ocr" | "gemini-agentic" {
  // Simple rule: PDFs → Mistral, Excel → Gemini
  if (assessment.fileType === "pdf") {
    return "mistral-ocr";
  }
  return "gemini-agentic";
}
