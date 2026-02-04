// Gemini 3 Flash Agentic Vision Extraction for Excel Documents
// Uses Gemini via OpenRouter for complex Excel handling

import { callGeminiFlash, callGeminiFlashAgentic } from "./ai-clients";
import * as XLSX from "xlsx";

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

interface GeminiExtractionResult {
  items: LineItem[];
  confidence: number;
  language: string;
  processingLog: string[];
  sourceText: string; // Markdown table for verification
}

export async function extractWithGeminiAgentic(
  buffer: Buffer,
  filename: string,
  settings: any
): Promise<GeminiExtractionResult> {
  const log: string[] = [];
  const timestamp = () => new Date().toISOString().split("T")[1].split(".")[0];
  
  log.push(`[${timestamp()}] 🟢 GEMINI 3 FLASH AGENTIC: Starting Excel extraction`);
  log.push(`[${timestamp()}] 📄 File: ${filename}`);

  // Read Excel file
  const workbook = XLSX.read(buffer);
  let allData: any[][] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    
    if (allData.length > 0) {
      // Skip header row on subsequent sheets
      const firstRow = sheetData[0];
      const looksLikeHeader = firstRow?.some((cell: any) => 
        typeof cell === "string" && /material|vikt|datum|weight|date/i.test(cell)
      );
      allData = [...allData, ...sheetData.slice(looksLikeHeader ? 1 : 0)];
    } else {
      allData = sheetData;
    }
  }

  log.push(`[${timestamp()}] 📊 Loaded ${allData.length} rows from ${workbook.SheetNames.length} sheet(s)`);

  // Convert to markdown table for better visual understanding
  const headerRow = allData[0] || [];
  const dataRows = allData.slice(1);
  
  // Create markdown representation
  let markdownTable = "| " + headerRow.map((h: any) => String(h || "").substring(0, 30)).join(" | ") + " |\n";
  markdownTable += "| " + headerRow.map(() => "---").join(" | ") + " |\n";
  
  // Include first 100 rows in initial context
  const sampleRows = dataRows.slice(0, 100);
  for (const row of sampleRows) {
    markdownTable += "| " + row.map((c: any) => String(c || "").substring(0, 30)).join(" | ") + " |\n";
  }

  const materialSynonyms = settings.material_synonyms 
    ? Object.entries(settings.material_synonyms)
        .map(([key, values]) => `- ${key}: ${(values as string[]).join(", ")}`)
        .join("\n")
    : "";

  const receiver = settings.default_receiver || "Ragn-Sells";
  const filenameDate = extractDateFromFilename(filename);

  // STEP 1: Think - Analyze structure
  const analysisPrompt = `Analyze this Excel data for waste management extraction.

FILE: ${filename}
TOTAL ROWS: ${dataRows.length}
SHEETS: ${workbook.SheetNames.join(", ")}

SAMPLE DATA (first 100 rows):
${markdownTable}

═══════════════════════════════════════════════════════════════════════════════
TASK: Analyze the structure and create an extraction plan
═══════════════════════════════════════════════════════════════════════════════

Return JSON (no markdown):
{
  "analysis": {
    "language": "Swedish|Norwegian|Danish|Finnish|English",
    "headerRow": number (0-indexed),
    "dataStartRow": number,
    "columns": {
      "date": "column name or null",
      "material": "column name or null",
      "weight": "column name or null",
      "unit": "column name or null",
      "location": "column name or null",
      "receiver": "column name or null",
      "hazardous": "column name or null"
    },
    "issues": ["list of data quality issues found"],
    "mergedCells": boolean,
    "weightUnit": "kg|ton|g|mixed"
  },
  "extractionStrategy": "description of how to handle this specific file",
  "confidence": 0.0-1.0
}`;

  log.push(`[${timestamp()}] 🔍 Step 1: Analyzing document structure...`);

  const analysisResult = await callGeminiFlash(analysisPrompt);
  const analysisText = analysisResult.content;
  
  let analysisJson: any = {};
  try {
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    analysisJson = JSON.parse(jsonMatch?.[0] || "{}");
  } catch {
    log.push(`[${timestamp()}] ⚠️ Could not parse analysis JSON, using defaults`);
  }
  
  log.push(`[${timestamp()}] ✅ Structure detected: ${analysisJson.analysis?.language || "Unknown"}`);
  log.push(`[${timestamp()}] 📋 Columns mapped: ${Object.entries(analysisJson.analysis?.columns || {}).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join(", ")}`);

  // STEP 2: Act - Extract with agentic prompting
  const extractionPrompt = `Extract ALL ${dataRows.length} rows from this waste management Excel file.

ANALYSIS RESULT:
${JSON.stringify(analysisJson.analysis, null, 2)}

FULL DATA (all ${dataRows.length} rows):
${JSON.stringify(allData, null, 2).substring(0, 100000)}

═══════════════════════════════════════════════════════════════════════════════
MATERIAL SYNONYMS
═══════════════════════════════════════════════════════════════════════════════
${materialSynonyms}

═══════════════════════════════════════════════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════════════════════════════════════════════
1. Extract EVERY data row (not headers)
2. Convert weights to kg (ton × 1000, g ÷ 1000)
3. Dates as YYYY-MM-DD
4. Excel serial dates: Convert (e.g., 45294 = 2024-01-02, formula: days since 1899-12-30)
5. If date is a PERIOD, use END date
6. Default date if missing: ${filenameDate || new Date().toISOString().split("T")[0]}
7. Default receiver: ${receiver}
8. isHazardous = true if hazardous indicator found

${settings.custom_instructions ? `
═══════════════════════════════════════════════════════════════════════════════
CUSTOM INSTRUCTIONS (HIGHEST PRIORITY)
═══════════════════════════════════════════════════════════════════════════════
${settings.custom_instructions}
` : ""}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown)
═══════════════════════════════════════════════════════════════════════════════
{
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
  "totalRowsProcessed": number,
  "confidence": 0.0-1.0
}

CRITICAL: Extract ALL ${dataRows.length} rows!`;

  log.push(`[${timestamp()}] ⚡ Step 2: Extracting data with Agentic Vision...`);

  const extractionResult = await callGeminiFlashAgentic(extractionPrompt);
  
  // Parse JSON from response
  let extractedJson: any = null;
  try {
    const jsonMatch = extractionResult.content.match(/\{[\s\S]*"items"[\s\S]*\}/);
    if (jsonMatch) {
      extractedJson = JSON.parse(jsonMatch[0]);
    }
  } catch {
    log.push(`[${timestamp()}] ⚠️ Could not parse extraction JSON`);
  }

  if (!extractedJson || !extractedJson.items) {
    throw new Error("Failed to extract items from Gemini response");
  }

  // Transform to LineItem format
  const items: LineItem[] = extractedJson.items.map((item: any) => ({
    date: { value: item.date || filenameDate || new Date().toISOString().split("T")[0], confidence: 0.9 },
    material: { value: item.material || "Okänt", confidence: 0.9 },
    handling: { value: item.handling || "", confidence: 0.8 },
    weightKg: { value: item.weightKg || 0, confidence: 0.95 },
    percentage: { value: "", confidence: 0 },
    co2Saved: { value: 0, confidence: 0 },
    isHazardous: { value: item.isHazardous || false, confidence: 0.9 },
    address: { value: item.location || "", confidence: 0.85 },
    receiver: { value: item.receiver || receiver, confidence: 0.9 },
  }));

  log.push(`[${timestamp()}] ✅ Extracted ${items.length} / ${dataRows.length} rows`);
  log.push(`[${timestamp()}] 📊 Confidence: ${((extractedJson.confidence || 0.85) * 100).toFixed(0)}%`);

  // Build full content for verification (include all rows, not just sample)
  let fullMarkdownTable = "| " + headerRow.map((h: any) => String(h || "").substring(0, 50)).join(" | ") + " |\n";
  fullMarkdownTable += "| " + headerRow.map(() => "---").join(" | ") + " |\n";
  for (const row of dataRows) {
    fullMarkdownTable += "| " + row.map((c: any) => String(c || "").substring(0, 50)).join(" | ") + " |\n";
  }

  return {
    items,
    confidence: extractedJson.confidence || 0.85,
    language: analysisJson.analysis?.language || "Swedish",
    processingLog: log,
    sourceText: fullMarkdownTable, // Return full table for verification
  };
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
