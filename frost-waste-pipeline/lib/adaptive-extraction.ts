// ADAPTIVE EXTRACTION SYSTEM WITH SONNET FALLBACK
// Handles chaotic documents with real confidence scores

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ============================================================================
// STEP 1: ANALYZE DOCUMENT STRUCTURE
// ============================================================================
async function analyzeDocumentStructure(
  sampleRows: any[][],
  filename: string
): Promise<any> {
  
  console.log("\n🔍 ANALYZING DOCUMENT STRUCTURE...");
  
  const sample = sampleRows.slice(0, 10)
    .map(row => row.join('\t'))
    .join('\n');
  
  const analysisPrompt = `Analyze this Swedish waste document and map columns.

DOCUMENT: ${filename}

SAMPLE:
${sample}

Identify columns for: DATE, LOCATION, MATERIAL, WEIGHT, UNIT, RECEIVER, COST (optional)

⚠️ DATE COLUMN NOTE: Excel dates may appear as:
- Text: "2024-01-02" or "2024/01/02"
- Numbers: 45294 (Excel serial date = days since 1899-12-30)
- Swedish format: "2 jan 2024"
Look for columns named "Datum", "Date", or containing 5-digit numbers (40000-50000 range = years 2009-2036)

JSON output (no markdown):
{
  "columnMapping": {"Datum": "date", ...},
  "dateColumn": "Datum",
  "locationColumn": "Uppdragsställe",
  "materialColumn": "Material",
  "weightColumn": "Kvantitet",
  "unitColumn": "Enhet",
  "receiverColumn": "Anläggning",
  "costColumn": null,
  "confidence": 0.95
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      temperature: 0,
      messages: [{ role: "user", content: analysisPrompt }]
    });
    
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as any).text)
      .join('');
    
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const analysis = JSON.parse(cleaned);
    
    console.log(`✓ Structure analyzed (confidence: ${(analysis.confidence * 100).toFixed(0)}%)`);
    console.log(`  Date: ${analysis.dateColumn || 'NOT FOUND'}`);
    console.log(`  Location: ${analysis.locationColumn || 'NOT FOUND'}`);
    console.log(`  Material: ${analysis.materialColumn || 'NOT FOUND'}`);
    console.log(`  Weight: ${analysis.weightColumn || 'NOT FOUND'}`);
    
    return analysis;
    
  } catch (error: any) {
    console.error("❌ Structure analysis failed:", error.message);
    return {
      columnMapping: {},
      dateColumn: null,
      locationColumn: null,
      materialColumn: null,
      weightColumn: null,
      unitColumn: null,
      receiverColumn: null,
      costColumn: null,
      confidence: 0.3
    };
  }
}

// ============================================================================
// STEP 2: EXTRACT CHUNK WITH SONNET FALLBACK
// ============================================================================
async function extractChunkWithFallback(
  header: any[],
  chunkRows: any[][],
  structure: any,
  filename: string,
  chunkNum: number,
  totalChunks: number,
  settings: any
): Promise<any[]> {
  
  const tsv = [header, ...chunkRows]
    .map(row => row.map(cell => String(cell || "")).join('\t'))
    .join('\n');
  
  // Infer receiver
  let receiver = "Okänd mottagare";
  const fn = filename.toLowerCase();
  if (fn.includes('ragn-sells') || fn.includes('ragnsells')) receiver = "Ragn-Sells";
  else if (fn.includes('renova')) receiver = "Renova";
  else if (fn.includes('nsr')) receiver = "NSR";
  else if (fn.includes('collecct')) receiver = "Collecct";
  
  // Extract date from filename
  const dateMatch = filename.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
  const filenameDate = dateMatch ? dateMatch[0].replace(/[-_]/g, '-') : null;
  
  // Material synonyms
  const synonyms = Object.entries(settings.material_synonyms || {})
    .map(([std, syns]) => `${std}: ${(syns as string[]).join(", ")}`)
    .join("\n");
  
  const prompt = `Extract ALL rows from table to clean JSON.

DOCUMENT STRUCTURE (confidence: ${(structure.confidence * 100).toFixed(0)}%):
- DATE: "${structure.dateColumn}" column → OUTPUT as YYYY-MM-DD
  ⚠️ EXCEL SERIAL DATES: If date is a NUMBER (like 45294), convert it!
     Formula: days since 1899-12-30. Example: 45294 = 2024-01-02, 46024 = 2026-01-02
     If date is already text like "2024-01-02", use as-is.
     If no date found, use fallback: ${filenameDate || 'today\'s date'}
- LOCATION: "${structure.locationColumn}" column
- MATERIAL: "${structure.materialColumn}" column (use standard names from synonyms)
- WEIGHT: "${structure.weightColumn}" column (convert to kg!)
- RECEIVER: "${structure.receiverColumn}" or use "${receiver}"

MATERIAL SYNONYMS:
${synonyms}

WEIGHT CONVERSION:
- ton/t → ×1000
- g → ÷1000
- lbs/lb → ×0.454
- kg → as-is

TABLE (chunk ${chunkNum}/${totalChunks}, ${chunkRows.length} rows):
${tsv}

JSON OUTPUT (no markdown, no backticks, just JSON, NO {value, confidence} wrappers):
{"items":[{"date":"2024-01-16","location":"Address","material":"Material","weightKg":185,"unit":"Kg","receiver":"${receiver}"}]}

CRITICAL: Extract ALL ${chunkRows.length} rows! ALWAYS output date as YYYY-MM-DD string!`;

  // TRY 1: Haiku (fast & cheap)
  console.log(`   🔄 Attempt 1: Using Haiku`);
  
  try {
    const haikuResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    
    const text = haikuResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as any).text)
      .join('');
    
    // Aggressive JSON cleaning
    let cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/^[^{[]+/, '')
      .replace(/[^}\]]+$/, '')
      .trim();
    
    // Try multiple JSON parsing strategies
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e1: any) {
      // Strategy 2: Find first { and last }
      try {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } else {
          throw new Error("No JSON found");
        }
      } catch (e2: any) {
        // Strategy 3: Try to fix common issues
        try {
          cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
          const openQuotes = (cleaned.match(/"/g) || []).length;
          if (openQuotes % 2 !== 0) {
            cleaned = cleaned.trim() + '"';
          }
          parsed = JSON.parse(cleaned);
        } catch (e3: any) {
          throw new Error(`JSON parse failed: ${e1?.message || 'Unknown'}`);
        }
      }
    }
    
    const items = parsed?.items || parsed || [];
    
    if (Array.isArray(items) && items.length > 0) {
      console.log(`   ✓ Extracted ${items.length} rows (Haiku)`);
      return items;
    }
    
    throw new Error("No items in Haiku response");
    
  } catch (haikuError: any) {
    console.log(`   ❌ Haiku failed: ${haikuError.message.substring(0, 50)}...`);
  }
  
  // TRY 2: Sonnet (more reliable but expensive)
  console.log(`   🔄 Attempt 2: Falling back to Sonnet`);
  
  try {
    const sonnetResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    
    const text = sonnetResponse.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as any).text)
      .join('');
    
    let cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/^[^{[]+/, '')
      .replace(/[^}\]]+$/, '')
      .trim();
    
    // Try multiple JSON parsing strategies
    let parsed: any = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e1: any) {
      try {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } else {
          throw new Error("No JSON found");
        }
      } catch (e2: any) {
        try {
          cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
          const openQuotes = (cleaned.match(/"/g) || []).length;
          if (openQuotes % 2 !== 0) {
            cleaned = cleaned.trim() + '"';
          }
          parsed = JSON.parse(cleaned);
        } catch (e3: any) {
          throw new Error(`JSON parse failed: ${e1?.message || 'Unknown'}`);
        }
      }
    }
    
    const items = parsed?.items || parsed || [];
    
    if (Array.isArray(items) && items.length > 0) {
      console.log(`   ✓ Extracted ${items.length} rows (Sonnet)`);
      return items;
    }
    
    throw new Error("No items in Sonnet response");
    
  } catch (sonnetError: any) {
    console.error(`   ❌ Sonnet also failed: ${sonnetError.message.substring(0, 50)}...`);
    return [];
  }
}

// ============================================================================
// STEP 3: MAIN ADAPTIVE EXTRACTION FLOW
// ============================================================================
export async function extractAdaptive(
  excelData: any[][],
  filename: string,
  settings: any
): Promise<{
  lineItems: any[];
  metadata: any;
  totalWeightKg: number;
  uniqueAddresses: number;
  uniqueReceivers: number;
  uniqueMaterials: number;
  _validation: any;
}> {
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 ADAPTIVE EXTRACTION: ${filename}`);
  console.log(`${"=".repeat(80)}`);
  
  // Find header
  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, excelData.length); i++) {
    const row = excelData[i];
    if (row.some(cell => 
      String(cell).toLowerCase().match(/datum|material|vikt|kvantitet|adress/)
    )) {
      headerIndex = i;
      console.log(`✓ Header found at row ${i + 1}`);
      break;
    }
  }
  
  const header = excelData[headerIndex];
  const dataRows = excelData.slice(headerIndex + 1).filter(row => 
    row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== "")
  );
  
  const totalRows = dataRows.length;
  console.log(`✓ Total rows: ${totalRows}`);
  
  if (totalRows === 0) {
    throw new Error("No data rows found");
  }
  
  // STEP 1: Analyze structure
  const structure = await analyzeDocumentStructure(
    [header, ...dataRows.slice(0, 20)],
    filename
  );
  
  // STEP 2: Extract with Sonnet fallback
  const CHUNK_SIZE = 50;  // Smaller chunks for more reliable extraction
  const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);
  const allItems: any[] = [];
  
  console.log(`\n📦 EXTRACTING: ${totalChunks} chunks of ${CHUNK_SIZE} rows\n`);
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalRows);
    const chunkRows = dataRows.slice(start, end);
    
    console.log(`📦 Chunk ${chunkIndex + 1}/${totalChunks}: rows ${start + 1}-${end}`);
    
    const items = await extractChunkWithFallback(
      header,
      chunkRows,
      structure,
      filename,
      chunkIndex + 1,
      totalChunks,
      settings
    );
    
    allItems.push(...items);
  }
  
  console.log(`\n✅ TOTAL EXTRACTED: ${allItems.length}/${totalRows} rows (${((allItems.length/totalRows)*100).toFixed(0)}%)`);
  
  // Infer receiver and date from filename for all items
  let receiver = "Okänd mottagare";
  const fn = filename.toLowerCase();
  if (fn.includes('ragn-sells') || fn.includes('ragnsells')) receiver = "Ragn-Sells";
  else if (fn.includes('renova')) receiver = "Renova";
  else if (fn.includes('nsr')) receiver = "NSR";
  
  // Extract date from filename (multiple patterns)
  // Remove (1), (2), etc. before extracting to handle duplicate filenames
  const cleanFilename = filename.replace(/\s*\(\d+\)/g, '');
  const dateMatch = cleanFilename.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
  const documentDate = dateMatch ? dateMatch[1].replace(/[-_]/g, '-') : null;
  
  // Helper to parse Excel dates (handles serial dates)
  function parseExcelDate(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return value;
    }
    if (typeof value === 'number' && value > 1 && value < 1000000) {
      // Excel serial date
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 86400000);
      if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    }
    return null;
  }
  
  // Helper to validate and fix dates
  function validateAndFixDate(extractedDate: string | null, filenameDate: string | null): string {
    const today = new Date().toISOString().split('T')[0];
    
    if (!extractedDate) {
      return filenameDate || today;
    }
    
    const parsed = parseExcelDate(extractedDate);
    if (!parsed) {
      return filenameDate || today;
    }
    
    // If filename has a date, compare and prefer filename if dates differ significantly
    if (filenameDate) {
      const extractedDateObj = new Date(parsed);
      const filenameDateObj = new Date(filenameDate);
      const todayObj = new Date(today);
      
      // If extracted date is more than 2 years old or in the future, use filename date
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      
      if (extractedDateObj < twoYearsAgo || extractedDateObj > todayObj) {
        console.log(`⚠️  Extracted date ${parsed} seems wrong, using filename date ${filenameDate}`);
        return filenameDate;
      }
      
      // If dates differ by more than 30 days, prefer filename date
      const diffDays = Math.abs((extractedDateObj.getTime() - filenameDateObj.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 30) {
        console.log(`⚠️  Extracted date ${parsed} differs from filename date ${filenameDate} by ${diffDays} days, using filename date`);
        return filenameDate;
      }
    }
    
    return parsed;
  }
  
  // Ensure all items have date and receiver
  const processedItems = allItems.map((item: any) => {
    const itemDate = item.date ? parseExcelDate(item.date) : null;
    const finalDate = validateAndFixDate(itemDate, documentDate) || new Date().toISOString().split('T')[0];
    
    return {
      ...item,
      date: finalDate,
      receiver: item.receiver || receiver,
    };
  });
  
  // STEP 3: Aggregate duplicates (preserve date!)
  const grouped = new Map<string, any>();
  
  for (const item of processedItems) {
    // Ensure date is set before aggregation
    const itemDate = item.date || documentDate || new Date().toISOString().split('T')[0];
    
    const key = `${itemDate}|${item.location}|${item.material}|${item.receiver}`;
    
    if (grouped.has(key)) {
      const existing = grouped.get(key)!;
      existing.weightKg = (existing.weightKg || 0) + (item.weightKg || 0);
      // Preserve date if it exists
      if (!existing.date && itemDate) {
        existing.date = itemDate;
      }
    } else {
      grouped.set(key, { 
        ...item,
        date: itemDate, // Ensure date is always set
      });
    }
  }
  
  const aggregated = Array.from(grouped.values());
  const totalWeight = aggregated.reduce((sum: number, item: any) => sum + (item.weightKg || 0), 0);
  
  const uniqueAddresses = new Set(aggregated.map((item: any) => item.location)).size;
  const uniqueReceivers = new Set(aggregated.map((item: any) => item.receiver)).size;
  const uniqueMaterials = new Set(aggregated.map((item: any) => item.material)).size;
  
  // Calculate REAL confidence
  const extractionRate = allItems.length / totalRows;
  const overallConfidence = Math.min(
    structure.confidence,
    extractionRate
  );
  
  console.log(`\n📊 RESULTS:`);
  console.log(`   Extracted: ${allItems.length}/${totalRows} (${(extractionRate*100).toFixed(0)}%)`);
  console.log(`   Aggregated: ${aggregated.length} rows`);
  console.log(`   Total weight: ${(totalWeight/1000).toFixed(2)} ton`);
  console.log(`   Unique addresses: ${uniqueAddresses}`);
  console.log(`   Unique materials: ${uniqueMaterials}`);
  console.log(`   Confidence: ${(overallConfidence*100).toFixed(0)}%`);
  console.log(`${"=".repeat(80)}\n`);
  
  return {
    lineItems: aggregated,
    metadata: {
      totalRows,
      extractedRows: allItems.length,
      aggregatedRows: aggregated.length,
      structure: structure.columnMapping,
      confidence: overallConfidence,
      extractionRate,
      chunked: true,
      chunks: totalChunks,
      model: "adaptive-haiku-sonnet"
    },
    totalWeightKg: totalWeight,
    uniqueAddresses,
    uniqueReceivers,
    uniqueMaterials,
    _validation: {
      completeness: extractionRate * 100,
      confidence: overallConfidence * 100,
      issues: allItems.length < totalRows * 0.9 
        ? [`Missing ${totalRows - allItems.length} rows`] 
        : []
    }
  };
}
