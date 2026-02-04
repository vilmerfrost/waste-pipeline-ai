// Shared types for the multi-model extraction pipeline

/**
 * Generic confidence-wrapped value
 */
export interface ConfidenceValue<T> {
  value: T;
  confidence: number;
}

/**
 * A single line item extracted from a waste management document
 */
export interface LineItem {
  date: ConfidenceValue<string>;
  material: ConfidenceValue<string>;
  handling: ConfidenceValue<string>;
  weightKg: ConfidenceValue<number>;
  percentage: ConfidenceValue<string>;
  co2Saved: ConfidenceValue<number>;
  isHazardous: ConfidenceValue<boolean>;
  address: ConfidenceValue<string>;
  receiver: ConfidenceValue<string>;
  _verificationIssues?: VerificationIssue[];
}

/**
 * Issue found during verification
 */
export interface VerificationIssue {
  rowIndex: number;
  field: string;
  issue: string;
  severity: "warning" | "error";
  suggestion?: string;
}

/**
 * Result from any extraction model (Mistral OCR or Gemini)
 */
export interface ExtractionResult {
  items: LineItem[];
  confidence: number;
  language: string;
  processingLog: string[];
  sourceText: string; // Original content for verification
}

/**
 * Result from verification step
 */
export interface VerificationResult {
  passed: boolean;
  items: LineItem[];
  issues: VerificationIssue[];
  confidence: number;
  processingLog: string[];
}

/**
 * Result from reconciliation step
 */
export interface ReconciliationResult {
  items: LineItem[];
  confidence: number;
  changes: string[];
  processingLog: string[];
}

/**
 * Quality assessment for document routing
 */
export interface QualityAssessment {
  fileType: "pdf" | "xlsx" | "xls" | "csv";
  qualityScore: number;
  complexity: "LOW" | "MEDIUM" | "HIGH";
  tableCount: number;
  hasHandwriting: boolean;
  hasMergedCells: boolean;
  detectedLanguage: string;
  suggestedModel: "mistral-ocr" | "gemini-agentic";
  reasoning: string;
}

/**
 * Full extracted data structure with metadata
 */
export interface ExtractedData {
  date: ConfidenceValue<string>;
  supplier: ConfidenceValue<string>;
  address: ConfidenceValue<string>;
  receiver: ConfidenceValue<string>;
  material: ConfidenceValue<string>;
  weightKg: ConfidenceValue<number>;
  cost: ConfidenceValue<number>;
  totalCo2Saved: ConfidenceValue<number>;
  lineItems: LineItem[];
  metadata: {
    totalRows: number;
    extractedRows: number;
    processedRows: number;
    confidence: number;
    extractionRate: number;
    chunked: boolean;
    chunks: number;
    model: string;
    language: {
      detected: string;
      translations: any[];
    };
  };
  _validation: {
    completeness: number;
    confidence: number;
    issues: string[];
  };
  _processingLog: string[];
}

/**
 * Final processing result from the document processor
 */
export interface ProcessingResult {
  success: boolean;
  data: ExtractedData | null;
  status: "approved" | "needs_review" | "error";
  confidence: number;
  processingLog: string[];
  modelPath: string;
}

/**
 * Document context for the assistant
 */
export interface DocumentContext {
  filename: string;
  extractedData: any;
  processingLog: string[];
  status: string;
}

/**
 * Response from the document assistant
 */
export interface AssistantResponse {
  answer: string;
  suggestedActions?: string[];
}
