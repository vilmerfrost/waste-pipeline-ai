// Mistral OCR 3 Extraction for PDF Documents
// Uses Mistral's OCR endpoint for text extraction, then structures with chat

import { getMistral } from "./ai-clients";

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
}

interface MistralExtractionResult {
  items: LineItem[];
  confidence: number;
  language: string;
  processingLog: string[];
  sourceText: string; // OCR text for verification
}

export async function extractWithMistralOCR(
  buffer: Buffer,
  filename: string,
  settings: any
): Promise<MistralExtractionResult> {
  const log: string[] = [];
  const timestamp = () => new Date().toISOString().split("T")[1].split(".")[0];

  log.push(`[${timestamp()}] 🔷 MISTRAL OCR 3: Starting PDF extraction`);
  log.push(`[${timestamp()}] 📄 File: ${filename}`);

  const base64Pdf = buffer.toString("base64");

  const materialSynonyms = settings.material_synonyms
    ? Object.entries(settings.material_synonyms)
        .map(([key, values]) => `- ${key}: ${(values as string[]).join(", ")}`)
        .join("\n")
    : "";

  const receiverFallback = settings.default_receiver || "";
  const filenameDate = extractDateFromFilename(filename);

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: OCR - Extract text from PDF using Mistral OCR endpoint
    // ═══════════════════════════════════════════════════════════════════════
    log.push(`[${timestamp()}] 📤 Step 1: Running Mistral OCR on PDF...`);

    const ocrResponse = await getMistral().ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        documentUrl: `data:application/pdf;base64,${base64Pdf}`,
      },
    });

    // Extract markdown text from all pages
    const ocrText = ocrResponse.pages?.map((p: any) => p.markdown).join("\n\n") || "";
    
    if (!ocrText || ocrText.trim().length === 0) {
      throw new Error("OCR returned empty text - document may be unreadable");
    }

    log.push(`[${timestamp()}] ✅ OCR complete: ${ocrResponse.pages?.length || 0} pages, ${ocrText.length} chars`);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: STRUCTURING - Use chat to extract structured data from OCR text
    // ═══════════════════════════════════════════════════════════════════════
    log.push(`[${timestamp()}] 📤 Step 2: Structuring extracted text...`);

    const structuringPrompt = `You are a document extraction specialist for Swedish waste management.

DOCUMENT: ${filename}

OCR EXTRACTED TEXT:
${ocrText.substring(0, 50000)}

═══════════════════════════════════════════════════════════════════════════════
MULTI-LANGUAGE SUPPORT
═══════════════════════════════════════════════════════════════════════════════
Document may be in: Swedish, Norwegian, Danish, Finnish, or English.
- Swedish: Vikt, Material, Datum, Mottagare, Plats
- Norwegian: Vekt, Materiale, Dato, Mottaker, Sted
- Danish: Vægt, Materiale, Dato, Modtager, Sted
- Finnish: Paino, Materiaali, Päivämäärä, Vastaanottaja, Paikka
- English: Weight, Material, Date, Receiver, Location

═══════════════════════════════════════════════════════════════════════════════
MATERIAL STANDARDIZATION
═══════════════════════════════════════════════════════════════════════════════
${materialSynonyms}

═══════════════════════════════════════════════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════════════════════════════════════════════
1. Extract EVERY row from tables found in the OCR text
2. Convert all weights to kg (ton × 1000, g ÷ 1000)
3. Dates as YYYY-MM-DD
4. If date is a PERIOD (e.g., "2025-01-01 - 2025-01-31"), use END date
5. If no date in row, use document header date or: ${filenameDate || new Date().toISOString().split("T")[0]}
6. RECEIVER: Extract from document content ONLY. If not found in the row/document, leave EMPTY string "". Do NOT guess or use defaults.
7. isHazardous = true if "Farligt avfall", "FA", "Hazardous" indicated

${settings.custom_instructions ? `
═══════════════════════════════════════════════════════════════════════════════
CUSTOM INSTRUCTIONS (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════════════════
${settings.custom_instructions}
` : ""}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown, no backticks)
═══════════════════════════════════════════════════════════════════════════════
{
  "documentInfo": {
    "date": "YYYY-MM-DD",
    "projectName": "string or null",
    "address": "string or null",
    "supplier": "string or null"
  },
  "items": [
    {
      "date": "YYYY-MM-DD",
      "location": "string",
      "material": "string",
      "weightKg": number,
      "unit": "Kg",
      "receiver": "string",
      "isHazardous": boolean
    }
  ],
  "language": "Swedish|Norwegian|Danish|Finnish|English",
  "confidence": 0.0-1.0
}`;

    const chatResponse = await getMistral().chat.complete({
      model: "mistral-large-latest",
      messages: [
        {
          role: "user",
          content: structuringPrompt,
        },
      ],
      temperature: 0,
    });

    const content = chatResponse.choices?.[0]?.message?.content;
    const responseText = typeof content === "string" ? content : "";

    log.push(`[${timestamp()}] 📥 Structuring response received (${responseText.length} chars)`);

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in structuring response");
    }

    const extracted = JSON.parse(jsonMatch[0]);

    // Transform to LineItem format
    const items: LineItem[] = (extracted.items || []).map((item: any) => ({
      date: {
        value: item.date || filenameDate || new Date().toISOString().split("T")[0],
        confidence: 0.9,
      },
      material: { value: item.material || "Okänt", confidence: 0.9 },
      handling: { value: item.handling || "", confidence: 0.8 },
      weightKg: { value: item.weightKg || 0, confidence: 0.95 },
      percentage: { value: "", confidence: 0 },
      co2Saved: { value: 0, confidence: 0 },
      isHazardous: { value: item.isHazardous || false, confidence: 0.9 },
      address: {
        value: item.location || extracted.documentInfo?.address || "",
        confidence: 0.85,
      },
      receiver: { value: (item.receiver && String(item.receiver).trim() !== "") ? item.receiver : (receiverFallback || ""), confidence: (item.receiver && String(item.receiver).trim() !== "") ? 0.9 : 0.5 },
    }));

    log.push(`[${timestamp()}] ✅ Extracted ${items.length} line items`);
    log.push(`[${timestamp()}] 🌍 Language: ${extracted.language || "Swedish"}`);
    log.push(`[${timestamp()}] 📊 Confidence: ${((extracted.confidence || 0.85) * 100).toFixed(0)}%`);

    return {
      items,
      confidence: extracted.confidence || 0.85,
      language: extracted.language || "Swedish",
      processingLog: log,
      sourceText: ocrText, // Return OCR text for verification
    };
  } catch (error: any) {
    log.push(`[${timestamp()}] ❌ Mistral extraction failed: ${error.message}`);
    throw error;
  }
}

function extractDateFromFilename(filename: string): string | null {
  // Pattern 1: YYYY-MM-DD (ISO format)
  const isoMatch = filename.match(/\b(20[0-2]\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Pattern 2: YYYYMMDD (8 digits starting with 20)
  const compactMatch = filename.match(/\b(20[0-2]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  // Pattern 3: DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
  const euroMatch = filename.match(/\b(0[1-9]|[12]\d|3[01])[-./](0[1-9]|1[0-2])[-./](20[0-2]\d)\b/);
  if (euroMatch) {
    return `${euroMatch[3]}-${euroMatch[2]}-${euroMatch[1]}`;
  }

  // No valid date found - return null instead of garbage
  return null;
}
