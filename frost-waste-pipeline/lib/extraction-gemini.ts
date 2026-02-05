// Gemini 3 Flash Agentic Vision Extraction for Excel Documents
// Uses Gemini via OpenRouter for complex Excel handling
// Chunked extraction for handling large files

import { callGeminiFlash } from "./ai-clients";
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
  sourceText: string;
}

const CHUNK_SIZE = 25; // Rows per chunk

/**
 * Extract a chunk of rows from Excel data
 */
async function extractChunk(
  headerRow: any[],
  dataRows: any[][],
  startIdx: number,
  endIdx: number,
  filename: string,
  analysisJson: any,
  settings: any,
  log: string[]
): Promise<LineItem[]> {
  const timestamp = () => new Date().toISOString().split("T")[1].split(".")[0];
  const chunkRows = dataRows.slice(startIdx, endIdx);
  
  // Build TSV for this chunk (compact format)
  const tsvHeader = headerRow.map((h: any) => String(h || "").substring(0, 50)).join("\t");
  const tsvData = chunkRows.map((row: any[]) => 
    row.map((cell: any) => String(cell || "").substring(0, 50)).join("\t")
  ).join("\n");
  const chunkTsv = tsvHeader + "\n" + tsvData;

  const filenameDate = extractDateFromFilename(filename);
  const receiver = settings.default_receiver || "Ragn-Sells";
  
  const materialSynonyms = settings.material_synonyms 
    ? Object.entries(settings.material_synonyms)
        .map(([key, values]) => `- ${key}: ${(values as string[]).join(", ")}`)
        .join("\n")
    : "";

  const prompt = `Extract waste management data from this Excel chunk.

CONTEXT FROM ANALYSIS:
- Language: ${analysisJson.analysis?.language || 'Swedish'}
- Columns: ${JSON.stringify(analysisJson.analysis?.columns || {})}

DATA (rows ${startIdx + 1}-${endIdx} of ${dataRows.length}):
${chunkTsv}

${materialSynonyms ? `MATERIAL SYNONYMS:\n${materialSynonyms}\n` : ""}

RULES:
1. Extract EVERY row shown above - do NOT skip any rows
2. If a row has partial data, extract what exists and leave other fields empty
3. Only skip rows that are completely empty (all cells blank)
4. Convert weights to kg (ton × 1000, g ÷ 1000)
5. Dates as YYYY-MM-DD (Excel serial: days since 1899-12-30)
6. Default date if missing: ${filenameDate || new Date().toISOString().split("T")[0]}
7. Default receiver: ${receiver}
8. isHazardous = true if hazardous indicator found

CRITICAL: You MUST return exactly ${chunkRows.length} items (one per row in the data above).

${settings.custom_instructions ? `CUSTOM INSTRUCTIONS:\n${settings.custom_instructions}\n` : ""}

Return JSON array ONLY (no markdown, no explanation):
[
  {
    "date": "YYYY-MM-DD",
    "material": "material type",
    "handling": "handling method or empty",
    "weightKg": number,
    "percentage": "percentage or empty",
    "co2Saved": number_or_0,
    "isHazardous": true/false,
    "address": "location/address",
    "receiver": "receiving company"
  }
]`;

  const response = await callGeminiFlash(prompt);
  
  // Parse response - look for JSON array
  const jsonMatch = response.content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    log.push(`[${timestamp()}] ⚠️ Failed to parse chunk rows ${startIdx + 1}-${endIdx}`);
    return [];
  }
  
  try {
    const rawItems = JSON.parse(jsonMatch[0]);
    
    // Transform to LineItem format with confidence scores
    const items: LineItem[] = rawItems.map((item: any) => ({
      date: { value: item.date || filenameDate || new Date().toISOString().split("T")[0], confidence: 0.9 },
      material: { value: item.material || "Okänt", confidence: 0.9 },
      handling: { value: item.handling || "", confidence: 0.8 },
      weightKg: { value: Number(item.weightKg) || 0, confidence: 0.95 },
      percentage: { value: item.percentage || "", confidence: 0.7 },
      co2Saved: { value: Number(item.co2Saved) || 0, confidence: 0.7 },
      isHazardous: { value: Boolean(item.isHazardous), confidence: 0.9 },
      address: { value: item.address || item.location || "", confidence: 0.85 },
      receiver: { value: item.receiver || receiver, confidence: 0.9 },
    }));
    
    return items;
  } catch (e) {
    log.push(`[${timestamp()}] ⚠️ JSON parse error for chunk rows ${startIdx + 1}-${endIdx}`);
    return [];
  }
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

  const headerRow = allData[0] || [];
  const dataRows = allData.slice(1).filter(row => 
    row.some((cell: any) => cell !== "" && cell !== null && cell !== undefined)
  );

  log.push(`[${timestamp()}] 📋 ${dataRows.length} data rows (excluding header and empty rows)`);

  // Create markdown sample for analysis (first 50 rows)
  let markdownSample = "| " + headerRow.map((h: any) => String(h || "").substring(0, 30)).join(" | ") + " |\n";
  markdownSample += "| " + headerRow.map(() => "---").join(" | ") + " |\n";
  const sampleRows = dataRows.slice(0, 50);
  for (const row of sampleRows) {
    markdownSample += "| " + row.map((c: any) => String(c || "").substring(0, 30)).join(" | ") + " |\n";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Analyze document structure
  // ═══════════════════════════════════════════════════════════════════════════
  const analysisPrompt = `Analyze this Excel data for waste management extraction.

FILE: ${filename}
TOTAL DATA ROWS: ${dataRows.length}
SHEETS: ${workbook.SheetNames.join(", ")}

SAMPLE DATA (first ${sampleRows.length} rows):
${markdownSample}

TASK: Analyze the structure and identify column mappings.

Return JSON (no markdown):
{
  "analysis": {
    "language": "Swedish|Norwegian|Danish|Finnish|English",
    "headerRow": 0,
    "columns": {
      "date": "column name or null",
      "material": "column name or null", 
      "weight": "column name or null",
      "unit": "column name or null",
      "location": "column name or null",
      "receiver": "column name or null",
      "hazardous": "column name or null"
    },
    "weightUnit": "kg|ton|g|mixed",
    "issues": ["list of potential issues"]
  },
  "confidence": 0.0-1.0
}`;

  log.push(`[${timestamp()}] 🔍 Step 1: Analyzing document structure...`);

  const analysisResult = await callGeminiFlash(analysisPrompt);
  
  let analysisJson: any = {};
  try {
    const jsonMatch = analysisResult.content.match(/\{[\s\S]*\}/);
    analysisJson = JSON.parse(jsonMatch?.[0] || "{}");
  } catch {
    log.push(`[${timestamp()}] ⚠️ Could not parse analysis JSON, using defaults`);
  }
  
  log.push(`[${timestamp()}] ✅ Structure detected: ${analysisJson.analysis?.language || "Unknown"}`);
  log.push(`[${timestamp()}] 📋 Columns mapped: ${Object.entries(analysisJson.analysis?.columns || {}).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join(", ")}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Chunked extraction
  // ═══════════════════════════════════════════════════════════════════════════
  const totalChunks = Math.ceil(dataRows.length / CHUNK_SIZE);
  
  log.push(`[${timestamp()}] ⚡ Step 2: Extracting ${dataRows.length} rows in ${totalChunks} chunk(s)...`);

  const allItems: LineItem[] = [];
  let successfulChunks = 0;

  for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
    const endIdx = Math.min(i + CHUNK_SIZE, dataRows.length);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    
    log.push(`[${timestamp()}] 📦 Chunk ${chunkNum}/${totalChunks}: rows ${i + 1}-${endIdx}`);
    
    try {
      const chunkItems = await extractChunk(
        headerRow,
        dataRows,
        i,
        endIdx,
        filename,
        analysisJson,
        settings,
        log
      );
      
      if (chunkItems.length > 0) {
        allItems.push(...chunkItems);
        successfulChunks++;
        log.push(`[${timestamp()}] ✅ Chunk ${chunkNum}: extracted ${chunkItems.length} items`);
      } else {
        log.push(`[${timestamp()}] ⚠️ Chunk ${chunkNum}: no items extracted`);
      }
    } catch (error) {
      log.push(`[${timestamp()}] ❌ Chunk ${chunkNum} failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Calculate confidence and build source text
  // ═══════════════════════════════════════════════════════════════════════════
  const extractionRate = dataRows.length > 0 ? allItems.length / dataRows.length : 0;
  const chunkSuccessRate = totalChunks > 0 ? successfulChunks / totalChunks : 0;
  const overallConfidence = Math.min(
    (analysisJson.confidence || 0.85) * 0.3 + 
    extractionRate * 0.5 + 
    chunkSuccessRate * 0.2,
    0.98
  );

  log.push(`[${timestamp()}] ✅ Extraction complete: ${allItems.length} items from ${dataRows.length} rows`);
  log.push(`[${timestamp()}] 📊 Extraction rate: ${(extractionRate * 100).toFixed(0)}%`);
  log.push(`[${timestamp()}] 📊 Overall confidence: ${(overallConfidence * 100).toFixed(0)}%`);

  // Build full markdown table for verification
  let fullMarkdownTable = "| " + headerRow.map((h: any) => String(h || "").substring(0, 50)).join(" | ") + " |\n";
  fullMarkdownTable += "| " + headerRow.map(() => "---").join(" | ") + " |\n";
  for (const row of dataRows) {
    fullMarkdownTable += "| " + row.map((c: any) => String(c || "").substring(0, 50)).join(" | ") + " |\n";
  }

  return {
    items: allItems,
    confidence: overallConfidence,
    language: analysisJson.analysis?.language || "Swedish",
    processingLog: log,
    sourceText: fullMarkdownTable,
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

  return null;
}
