// ADAPTIVE EXTRACTION SYSTEM WITH SONNET FALLBACK
// Handles chaotic documents with real confidence scores
// Includes optional verification step to detect hallucinations

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Types for verification results
interface VerificationResult {
  verifiedItems: any[];
  hallucinations: HallucinationIssue[];
  verificationConfidence: number;
  verificationTime: number;
}

interface HallucinationIssue {
  rowIndex: number;
  field: string;
  extracted: any;
  issue: string;
  severity: 'warning' | 'error';
}

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
// STEP 2.5: VERIFY EXTRACTION AGAINST SOURCE (Anti-Hallucination)
// ============================================================================
async function verifyExtractionAgainstSource(
  originalTsv: string,
  extractedItems: any[],
  chunkNum: number,
  totalChunks: number
): Promise<VerificationResult> {
  
  const startTime = Date.now();
  console.log(`   🔍 Verifying ${extractedItems.length} items against source (chunk ${chunkNum}/${totalChunks})...`);
  
  // Limit items to verify (for cost control)
  const itemsToVerify = extractedItems.slice(0, 25);
  
  const verificationPrompt = `You are a data verification agent. Your job is to check if extracted data actually exists in the source document.

SOURCE DOCUMENT (chunk ${chunkNum}/${totalChunks}):
${originalTsv}

EXTRACTED DATA TO VERIFY:
${JSON.stringify(itemsToVerify, null, 2)}

For EACH extracted row (by index), verify these fields exist in the source:
1. DATE - Does this date (or similar format) appear in source?
2. LOCATION - Does this address/location text appear?
3. MATERIAL - Does this material name (or synonym) appear?
4. WEIGHT - Does this weight value appear? Watch for unit conversion errors (500 kg vs 5000 kg)
5. RECEIVER - Does this appear, or was it likely inferred from filename?

⚠️ COMMON HALLUCINATION PATTERNS TO DETECT:
- Made-up addresses that don't exist in source
- Wrong weight magnitude (10x errors: 185 vs 1850)
- Dates from wrong rows
- Materials that don't appear anywhere in source

OUTPUT FORMAT (JSON only, no markdown):
{
  "verified": [
    {
      "rowIndex": 0,
      "date": { "found": true, "sourceMatch": "2024-01-02", "confidence": 1.0 },
      "location": { "found": true, "sourceMatch": "Kungsgatan 5", "confidence": 1.0 },
      "material": { "found": true, "sourceMatch": "Brännbart", "confidence": 0.95 },
      "weightKg": { "found": true, "sourceMatch": "185 kg", "confidence": 1.0 },
      "receiver": { "found": false, "inferred": true, "confidence": 0.7 }
    }
  ],
  "hallucinations": [
    { "rowIndex": 2, "field": "weightKg", "extracted": 5000, "issue": "Source shows 500, possible 10x error", "severity": "error" }
  ],
  "overallConfidence": 0.92
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: "user", content: verificationPrompt }]
    });
    
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as any).text)
      .join('');
    
    // Parse JSON response
    let cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/^[^{[]+/, '')
      .replace(/[^}\]]+$/, '')
      .trim();
    
    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON object
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        result = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } else {
        throw new Error("Could not parse verification response");
      }
    }
    
    // Calculate per-item verification confidence
    const verifiedItems = extractedItems.map((item, idx) => {
      const verification = result.verified?.find((v: any) => v.rowIndex === idx);
      
      if (!verification) {
        // Item wasn't verified (beyond limit)
        return {
          ...item,
          _verified: idx >= 25 ? 'skipped' : false,
          _verificationConfidence: idx >= 25 ? null : 0.5,
        };
      }
      
      // Calculate average confidence across verified fields
      const fields = ['date', 'location', 'material', 'weightKg', 'receiver'];
      const confidences = fields
        .map(f => verification[f]?.confidence)
        .filter((c): c is number => typeof c === 'number');
      
      const avgConfidence = confidences.length > 0 
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
        : 0.5;
      
      // Flag potential issues
      const unfoundFields = fields.filter(f => verification[f]?.found === false && !verification[f]?.inferred);
      
      return {
        ...item,
        _verified: true,
        _verificationConfidence: avgConfidence,
        _possibleHallucination: avgConfidence < 0.7 || unfoundFields.length > 1,
        _unfoundFields: unfoundFields.length > 0 ? unfoundFields : undefined,
      };
    });
    
    const hallucinations: HallucinationIssue[] = (result.hallucinations || []).map((h: any) => ({
      rowIndex: h.rowIndex,
      field: h.field,
      extracted: h.extracted,
      issue: h.issue,
      severity: h.severity || 'warning'
    }));
    
    const verificationTime = Date.now() - startTime;
    const overallConfidence = result.overallConfidence || 0.8;
    
    console.log(`   ✓ Verification complete: ${(overallConfidence * 100).toFixed(0)}% confidence (${verificationTime}ms)`);
    
    if (hallucinations.length > 0) {
      console.log(`   ⚠️  Found ${hallucinations.length} potential hallucination(s):`);
      hallucinations.slice(0, 3).forEach(h => {
        console.log(`      - Row ${h.rowIndex}: ${h.field} = ${h.extracted} (${h.issue})`);
      });
    }
    
    return {
      verifiedItems,
      hallucinations,
      verificationConfidence: overallConfidence,
      verificationTime
    };
    
  } catch (error: any) {
    const verificationTime = Date.now() - startTime;
    console.log(`   ⚠️  Verification failed (${verificationTime}ms): ${error.message}`);
    
    // Return items without verification
    return {
      verifiedItems: extractedItems.map(item => ({ 
        ...item, 
        _verified: false,
        _verificationError: error.message 
      })),
      hallucinations: [],
      verificationConfidence: 0,
      verificationTime
    };
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
  _verification?: {
    enabled: boolean;
    confidence: number;
    hallucinations: HallucinationIssue[];
    totalTime: number;
    itemsVerified: number;
    itemsFlagged: number;
  };
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
  
  // Check if verification is enabled (default: false to save costs)
  const enableVerification = settings.enable_verification ?? false;
  const verificationThreshold = settings.verification_confidence_threshold ?? 0.85;
  
  // Verification tracking
  let totalVerificationTime = 0;
  let allHallucinations: HallucinationIssue[] = [];
  let totalVerifiedItems = 0;
  let totalFlaggedItems = 0;
  let verificationConfidenceSum = 0;
  let verificationChunks = 0;
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalRows);
    const chunkRows = dataRows.slice(start, end);
    
    console.log(`📦 Chunk ${chunkIndex + 1}/${totalChunks}: rows ${start + 1}-${end}`);
    
    // Build TSV for this chunk (needed for verification)
    const chunkTsv = [header, ...chunkRows]
      .map(row => row.map(cell => String(cell || "")).join('\t'))
      .join('\n');
    
    let items = await extractChunkWithFallback(
      header,
      chunkRows,
      structure,
      filename,
      chunkIndex + 1,
      totalChunks,
      settings
    );
    
    // VERIFICATION STEP (if enabled)
    if (enableVerification && items.length > 0) {
      // Conditionally verify: always verify if structure confidence is low, or sample verify otherwise
      const shouldVerify = structure.confidence < verificationThreshold || chunkIndex === 0;
      
      if (shouldVerify) {
        const verificationResult = await verifyExtractionAgainstSource(
          chunkTsv,
          items,
          chunkIndex + 1,
          totalChunks
        );
        
        items = verificationResult.verifiedItems;
        allHallucinations.push(...verificationResult.hallucinations);
        totalVerificationTime += verificationResult.verificationTime;
        verificationConfidenceSum += verificationResult.verificationConfidence;
        verificationChunks++;
        
        // Count verified and flagged items
        items.forEach(item => {
          if (item._verified === true) totalVerifiedItems++;
          if (item._possibleHallucination) totalFlaggedItems++;
        });
      }
    }
    
    allItems.push(...items);
  }
  
  console.log(`\n✅ TOTAL EXTRACTED: ${allItems.length}/${totalRows} rows (${((allItems.length/totalRows)*100).toFixed(0)}%)`);
  
  // Log verification summary if enabled
  if (enableVerification) {
    const avgVerificationConfidence = verificationChunks > 0 
      ? verificationConfidenceSum / verificationChunks 
      : 0;
    console.log(`\n🔍 VERIFICATION SUMMARY:`);
    console.log(`   Chunks verified: ${verificationChunks}/${totalChunks}`);
    console.log(`   Items verified: ${totalVerifiedItems}`);
    console.log(`   Items flagged: ${totalFlaggedItems}`);
    console.log(`   Hallucinations found: ${allHallucinations.length}`);
    console.log(`   Avg confidence: ${(avgVerificationConfidence * 100).toFixed(0)}%`);
    console.log(`   Total time: ${totalVerificationTime}ms`);
  }
  
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
  
  // Build verification summary for metadata
  const avgVerificationConfidence = verificationChunks > 0 
    ? verificationConfidenceSum / verificationChunks 
    : 0;
  
  // Adjust overall confidence based on verification results
  let finalConfidence = overallConfidence;
  if (enableVerification && verificationChunks > 0) {
    // Blend extraction confidence with verification confidence
    finalConfidence = (overallConfidence * 0.6) + (avgVerificationConfidence * 0.4);
    
    // Penalize for hallucinations
    const hallucinationPenalty = Math.min(allHallucinations.length * 0.05, 0.3);
    finalConfidence = Math.max(0, finalConfidence - hallucinationPenalty);
  }
  
  console.log(`\n📊 RESULTS:`);
  console.log(`   Extracted: ${allItems.length}/${totalRows} (${(extractionRate*100).toFixed(0)}%)`);
  console.log(`   Aggregated: ${aggregated.length} rows`);
  console.log(`   Total weight: ${(totalWeight/1000).toFixed(2)} ton`);
  console.log(`   Unique addresses: ${uniqueAddresses}`);
  console.log(`   Unique materials: ${uniqueMaterials}`);
  console.log(`   Confidence: ${(finalConfidence*100).toFixed(0)}%${enableVerification ? ' (verified)' : ''}`);
  if (enableVerification && allHallucinations.length > 0) {
    console.log(`   ⚠️  Potential issues: ${allHallucinations.length} hallucination(s) detected`);
  }
  console.log(`${"=".repeat(80)}\n`);
  
  // Build verification metadata
  const verificationMetadata = enableVerification ? {
    enabled: true,
    confidence: avgVerificationConfidence,
    hallucinations: allHallucinations,
    totalTime: totalVerificationTime,
    itemsVerified: totalVerifiedItems,
    itemsFlagged: totalFlaggedItems,
    chunksVerified: verificationChunks,
    totalChunks: totalChunks,
  } : {
    enabled: false,
    confidence: 0,
    hallucinations: [],
    totalTime: 0,
    itemsVerified: 0,
    itemsFlagged: 0,
  };
  
  return {
    lineItems: aggregated,
    metadata: {
      totalRows,
      extractedRows: allItems.length,
      aggregatedRows: aggregated.length,
      structure: structure.columnMapping,
      confidence: finalConfidence,
      extractionRate,
      chunked: true,
      chunks: totalChunks,
      model: "adaptive-haiku-sonnet",
      // Verification info in metadata
      verification: {
        enabled: enableVerification,
        confidence: avgVerificationConfidence,
        hallucinationsFound: allHallucinations.length,
        itemsFlagged: totalFlaggedItems,
        timeMs: totalVerificationTime,
      }
    },
    totalWeightKg: totalWeight,
    uniqueAddresses,
    uniqueReceivers,
    uniqueMaterials,
    _validation: {
      completeness: extractionRate * 100,
      confidence: finalConfidence * 100,
      issues: [
        ...(allItems.length < totalRows * 0.9 
          ? [`Missing ${totalRows - allItems.length} rows`] 
          : []),
        ...(allHallucinations.length > 0 
          ? [`${allHallucinations.length} potential hallucination(s) detected`] 
          : []),
        ...(totalFlaggedItems > 0 
          ? [`${totalFlaggedItems} items flagged for review`] 
          : []),
      ]
    },
    _verification: verificationMetadata
  };
}
