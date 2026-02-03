// Main Document Processor Orchestrator
// Coordinates the multi-model extraction pipeline

import { assessDocumentQuality, routeDocument, QualityAssessment } from "./document-router";
import { extractWithMistralOCR, LineItem as MistralLineItem } from "./extraction-mistral";
import { extractWithGeminiAgentic, LineItem as GeminiLineItem } from "./extraction-gemini";
import { reconcileWithSonnet, LineItem as ReconciliationLineItem } from "./reconciliation-sonnet";
import { verifyWithHaiku, LineItem as VerificationLineItem } from "./verification-haiku";
import { THRESHOLDS } from "./ai-clients";
import * as XLSX from "xlsx";

// Unified LineItem type for the processor
export interface LineItem {
  date: { value: string; confidence: number };
  material: { value: string; confidence: number };
  handling: { value: string; confidence: number };
  weightKg: { value: number; confidence: number };
  percentage: { value: string; confidence: number };
  co2Saved: { value: number; confidence: number };
  isHazardous: { value: boolean; confidence: number };
  address: { value: string; confidence: number };
  receiver: { value: string; confidence: number };
  _verificationIssues?: any[];
}

export interface ExtractedData {
  date: { value: string; confidence: number };
  supplier: { value: string; confidence: number };
  address: { value: string; confidence: number };
  receiver: { value: string; confidence: number };
  material: { value: string; confidence: number };
  weightKg: { value: number; confidence: number };
  cost: { value: number; confidence: number };
  totalCo2Saved: { value: number; confidence: number };
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

interface ProcessingResult {
  success: boolean;
  data: ExtractedData | null;
  status: "approved" | "needs_review" | "error";
  confidence: number;
  processingLog: string[];
  modelPath: string;
}

export async function processDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  settings: any
): Promise<ProcessingResult> {
  const log: string[] = [];
  const timestamp = () => new Date().toISOString().split("T")[1].split(".")[0];
  
  log.push(`[${timestamp()}] 🚀 DOCUMENT PROCESSOR: Starting`);
  log.push(`[${timestamp()}] 📄 File: ${filename}`);
  log.push(`[${timestamp()}] 📦 Size: ${(buffer.length / 1024).toFixed(1)} KB`);

  let modelPath = "";
  let items: LineItem[] = [];
  let confidence = 0;
  let language = "Swedish";

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: QUALITY ASSESSMENT & ROUTING
    // ═══════════════════════════════════════════════════════════════════════
    log.push(`[${timestamp()}] 📊 Step 1: Quality Assessment...`);
    
    const assessment = await assessDocumentQuality(buffer, filename, mimeType);
    const selectedModel = routeDocument(assessment);
    
    log.push(`[${timestamp()}] ✅ Assessment complete`);
    log.push(`[${timestamp()}]    Quality: ${(assessment.qualityScore * 100).toFixed(0)}%`);
    log.push(`[${timestamp()}]    Complexity: ${assessment.complexity}`);
    log.push(`[${timestamp()}]    Language: ${assessment.detectedLanguage}`);
    log.push(`[${timestamp()}]    Routed to: ${selectedModel}`);
    
    modelPath = selectedModel;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: PRIMARY EXTRACTION
    // ═══════════════════════════════════════════════════════════════════════
    log.push(`[${timestamp()}] ⚡ Step 2: Primary Extraction...`);

    if (selectedModel === "mistral-ocr") {
      // PDF → Mistral OCR
      const result = await extractWithMistralOCR(buffer, filename, settings);
      items = result.items as LineItem[];
      confidence = result.confidence;
      language = result.language;
      log.push(...result.processingLog);
    } else {
      // Excel → Gemini Flash Agentic
      const result = await extractWithGeminiAgentic(buffer, filename, settings);
      items = result.items as LineItem[];
      confidence = result.confidence;
      language = result.language;
      log.push(...result.processingLog);
    }

    log.push(`[${timestamp()}] ✅ Extraction complete: ${items.length} items, ${(confidence * 100).toFixed(0)}% confidence`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: RECONCILIATION (if confidence < 0.80)
    // ═══════════════════════════════════════════════════════════════════════
    if (confidence < THRESHOLDS.RECONCILIATION_TRIGGER) {
      log.push(`[${timestamp()}] ⚠️ Step 3: Confidence below 80%, triggering Sonnet reconciliation...`);
      modelPath += " → sonnet-reconciliation";
      
      const reconciled = await reconcileWithSonnet(
        items as ReconciliationLineItem[], 
        buffer, 
        filename, 
        log, 
        settings
      );
      items = reconciled.items as LineItem[];
      confidence = reconciled.confidence;
      log.push(...reconciled.processingLog.filter(l => !log.includes(l)));
      
      log.push(`[${timestamp()}] ✅ Reconciliation complete: ${reconciled.changes.length} changes, new confidence ${(confidence * 100).toFixed(0)}%`);
    } else {
      log.push(`[${timestamp()}] ✅ Step 3: Confidence OK (${(confidence * 100).toFixed(0)}%), skipping reconciliation`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: VERIFICATION (ALWAYS ON)
    // ═══════════════════════════════════════════════════════════════════════
    log.push(`[${timestamp()}] 🔍 Step 4: Haiku Verification (ALWAYS ON)...`);
    modelPath += " → haiku-verification";

    // Get original content for verification reference
    let originalContent = "";
    if (filename.toLowerCase().endsWith(".pdf")) {
      originalContent = `[PDF content - see original file: ${filename}]`;
    } else {
      // Convert Excel to TSV for reference
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      originalContent = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
    }

    const verification = await verifyWithHaiku(
      items as VerificationLineItem[], 
      originalContent, 
      filename, 
      log
    );
    items = verification.items as LineItem[];
    log.push(...verification.processingLog.filter(l => !log.includes(l)));

    // Apply verification penalty to confidence
    const verificationPenalty = verification.issues.filter(i => i.severity === "error").length * 0.05;
    confidence = Math.max(0.5, confidence - verificationPenalty);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: DETERMINE STATUS
    // ═══════════════════════════════════════════════════════════════════════
    const threshold = settings.auto_approve_threshold || THRESHOLDS.AUTO_APPROVE_DEFAULT;
    const qualityScore = confidence * 100;
    
    let status: "approved" | "needs_review" | "error";
    if (!verification.passed) {
      status = "needs_review";
      log.push(`[${timestamp()}] 🚨 Status: NEEDS_REVIEW (verification failed)`);
    } else if (qualityScore >= threshold) {
      status = "approved";
      log.push(`[${timestamp()}] ✅ Status: APPROVED (quality ${qualityScore.toFixed(0)}% >= ${threshold}%)`);
    } else {
      status = "needs_review";
      log.push(`[${timestamp()}] ⚠️ Status: NEEDS_REVIEW (quality ${qualityScore.toFixed(0)}% < ${threshold}%)`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUILD FINAL OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    const extractedData: ExtractedData = {
      date: items[0]?.date || { value: new Date().toISOString().split("T")[0], confidence: 0.5 },
      supplier: { value: "", confidence: 0 },
      address: items[0]?.address || { value: "", confidence: 0 },
      receiver: items[0]?.receiver || { value: settings.default_receiver || "Ragn-Sells", confidence: 0.9 },
      material: { value: "Blandat", confidence: 0.8 },
      weightKg: { 
        value: items.reduce((sum, item) => sum + (item.weightKg?.value || 0), 0), 
        confidence: 0.9 
      },
      cost: { value: 0, confidence: 0 },
      totalCo2Saved: { value: 0, confidence: 0 },
      lineItems: items,
      metadata: {
        totalRows: items.length,
        extractedRows: items.length,
        processedRows: items.length,
        confidence: confidence,
        extractionRate: 1.0,
        chunked: false,
        chunks: 1,
        model: modelPath,
        language: {
          detected: language,
          translations: [],
        },
      },
      _validation: {
        completeness: 100,
        confidence: confidence * 100,
        issues: verification.issues.map(i => `Row ${i.rowIndex}: ${i.issue}`),
      },
      _processingLog: log,
    };

    log.push(`[${timestamp()}] 🏁 PROCESSING COMPLETE`);
    log.push(`[${timestamp()}]    Model path: ${modelPath}`);
    log.push(`[${timestamp()}]    Items: ${items.length}`);
    log.push(`[${timestamp()}]    Confidence: ${(confidence * 100).toFixed(0)}%`);
    log.push(`[${timestamp()}]    Status: ${status}`);

    return {
      success: true,
      data: extractedData,
      status,
      confidence,
      processingLog: log,
      modelPath,
    };

  } catch (error: any) {
    log.push(`[${timestamp()}] ❌ PROCESSING FAILED: ${error.message}`);
    
    return {
      success: false,
      data: null,
      status: "error",
      confidence: 0,
      processingLog: log,
      modelPath: modelPath || "failed-before-routing",
    };
  }
}
