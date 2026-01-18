// ADAPTIVE EXTRACTION SYSTEM WITH SONNET FALLBACK
// Handles chaotic documents with real confidence scores
// Includes optional verification step to detect hallucinations

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ============================================================================
// KNOWN ATTRIBUTE SYNONYMS (Swedish reference - LLM translates on-the-fly)
// The LLM will recognize Norwegian, Danish, Finnish, and English equivalents
// ============================================================================
const KNOWN_ATTRIBUTES = {
  Material: {
    aliases: ["Material", "Materialname", "Materialid", "Artikel", "Avfallstyp", "Avfall", "Beskrivning", "Fraktion", "Restprodukt text", "avfallsfraktion", "Materialbenämning", "Fraktionsnamn", "Taxekod", "BEAst-artikel"],
    required: true,
    description: "Waste material type/name"
  },
  LocationReference: {
    aliases: ["Littra", "Littera", "Uppdragsställe", "Arbetsplatsnamn", "Anläggningsaddress", "Producent adress", "Adress", "Flexplatsadress", "Hämtadress", "Hämtställe", "Anladress", "Delprojektnamn"],
    required: true,
    description: "Pickup location or address reference"
  },
  HazardousWaste: {
    aliases: ["Farligt avfall"],
    required: false,
    description: "Hazardous waste indicator"
  },
  ReceiverReference: {
    aliases: ["Mottagare adress", "Leveransställe", "Mottagarebeskr", "Mottagare", "Mottagningsanläggning"],
    required: false,
    description: "Waste receiver/destination"
  },
  Amount: {
    aliases: ["Kvantitet", "Antal", "faktisk vikt (kg)", "Vikt (kg)", "Vikt kg", "Mängd", "Ackumulerat", "Vikt", "vikt, kg", "antal kg", "enhet kg", "Vikt körtur", "Antalsvärde kg", "Total-Vikt av Fraktioner"],
    required: true,
    description: "Weight/quantity amount"
  },
  Unit: {
    aliases: ["Enhet", "Enhet deb", "Enhet körtur"],
    required: true,
    description: "Unit of measurement"
  },
  WOTimeFinished: {
    aliases: ["Datum", "Date", "Utfört Datum", "Utförtdatum", "Utförd datum", "Utförddatum", "Datum utfört", "Datum utförd", "Utförandedatum", "Arbetsorder utförd", "Hämtdatum", "Utförande utfört", "Leveransdatum"],
    required: true,
    description: "Date when work was completed"
  }
};

// Supported languages for document processing
const SUPPORTED_LANGUAGES = ["Swedish", "Norwegian", "Danish", "Finnish", "English"];

// Build a formatted string of all synonyms for LLM prompts (Swedish reference)
function buildSynonymGuide(): string {
  const header = `MULTI-LANGUAGE SUPPORT: ${SUPPORTED_LANGUAGES.join(", ")}
The Swedish terms below are the REFERENCE. Also recognize translations/equivalents in Norwegian, Danish, Finnish, and English.\n\n`;
  
  const guide = Object.entries(KNOWN_ATTRIBUTES)
    .map(([attr, config]) => {
      const reqLabel = config.required ? "✓ REQUIRED" : "○ Optional";
      return `${attr} (${reqLabel}):
  Description: ${config.description}
  Swedish reference terms: ${config.aliases.join(", ")}`;
    })
    .join("\n\n");
  return header + guide;
}

// Build a compact lookup format for extraction
function buildColumnLookup(): string {
  return Object.entries(KNOWN_ATTRIBUTES)
    .map(([attr, config]) => `${attr}: [${config.aliases.join(" | ")}]`)
    .join("\n");
}

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
  
  // Build synonym guide for column detection
  const synonymGuide = buildSynonymGuide();
  const columnLookup = buildColumnLookup();
  
  const analysisPrompt = `Analyze this waste management document and map columns to standard attributes.

DOCUMENT: ${filename}

SAMPLE DATA:
${sample}

═══════════════════════════════════════════════════════════════════════════════
MULTI-LANGUAGE SUPPORT
═══════════════════════════════════════════════════════════════════════════════
This document may be in: Swedish, Norwegian, Danish, Finnish, or English.

Below are the SWEDISH REFERENCE TERMS for each attribute. 
If the document is in another language, recognize the EQUIVALENT TERMS:
- Norwegian (NO): Similar to Swedish, e.g., "Vekt" = "Vikt", "Mengde" = "Mängd"
- Danish (DK): Similar to Swedish/Norwegian, e.g., "Vægt" = "Vikt", "Mængde" = "Mängd"
- Finnish (FI): Different language family, e.g., "Paino" = "Vikt", "Määrä" = "Mängd", "Päivämäärä" = "Datum"
- English (EN): e.g., "Weight" = "Vikt", "Quantity" = "Mängd", "Date" = "Datum"

═══════════════════════════════════════════════════════════════════════════════
SWEDISH REFERENCE TERMS (match these OR their translations)
═══════════════════════════════════════════════════════════════════════════════
${synonymGuide}

═══════════════════════════════════════════════════════════════════════════════
COLUMN DETECTION INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════
1. First DETECT the document language from column headers and content
2. MATCH columns to attributes using Swedish reference OR equivalent terms in detected language
3. Use FUZZY MATCHING - columns may have slight variations (case, spacing, abbreviations)
4. For DATE columns, also look for Excel serial dates (5-digit numbers like 45294)

Priority order for ambiguous matches:
- LOCATION: Littra > Uppdragsställe > Adress (or equivalents)
- MATERIAL: Material > Fraktion > Avfallstyp (or equivalents)
- WEIGHT: Vikt > Kvantitet > Mängd (or equivalents)

COMPACT SWEDISH REFERENCE:
${columnLookup}

JSON OUTPUT (no markdown, no backticks):
{
  "detectedLanguage": "Swedish|Norwegian|Danish|Finnish|English",
  "columnMapping": {"ColumnName": "attributeType", ...},
  "dateColumn": "matched column name or null",
  "locationColumn": "matched column name or null",
  "materialColumn": "matched column name or null",
  "weightColumn": "matched column name or null",
  "unitColumn": "matched column name or null",
  "receiverColumn": "matched column name or null",
  "hazardousColumn": "matched column name or null",
  "costColumn": null,
  "confidence": 0.95,
  "translations": [
    {"originalColumn": "Vægt", "detectedLanguage": "Danish", "mappedTo": "Amount", "swedishEquivalent": "Vikt"}
  ]
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
    console.log(`  Language: ${analysis.detectedLanguage || 'Swedish (assumed)'}`);
    console.log(`  Date: ${analysis.dateColumn || 'NOT FOUND'}`);
    console.log(`  Location: ${analysis.locationColumn || 'NOT FOUND'}`);
    console.log(`  Material: ${analysis.materialColumn || 'NOT FOUND'}`);
    console.log(`  Weight: ${analysis.weightColumn || 'NOT FOUND'}`);
    
    // Log any translations detected
    if (analysis.translations && analysis.translations.length > 0) {
      console.log(`  Translations detected:`);
      analysis.translations.forEach((t: any) => {
        console.log(`    - "${t.originalColumn}" (${t.detectedLanguage}) → ${t.mappedTo} (Swedish: ${t.swedishEquivalent})`);
      });
    }
    
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
  
  // Material synonyms from settings
  const materialSynonyms = Object.entries(settings.material_synonyms || {})
    .map(([std, syns]) => `${std}: ${(syns as string[]).join(", ")}`)
    .join("\n");
  
  // Build attribute synonym reference for extraction
  const attributeSynonymRef = buildColumnLookup();
  
  const prompt = `Extract ALL rows from this waste document table to clean JSON.

═══════════════════════════════════════════════════════════════════════════════
MULTI-LANGUAGE SUPPORT
═══════════════════════════════════════════════════════════════════════════════
Document may be in: Swedish, Norwegian, Danish, Finnish, or English.
Recognize column names and values in any of these languages.
Output data in ENGLISH field names with original values preserved.

═══════════════════════════════════════════════════════════════════════════════
DOCUMENT STRUCTURE (confidence: ${(structure.confidence * 100).toFixed(0)}%)
Detected language: ${structure.detectedLanguage || 'Swedish (assumed)'}
═══════════════════════════════════════════════════════════════════════════════
Detected columns:
- DATE: "${structure.dateColumn}" → OUTPUT as YYYY-MM-DD
- LOCATION: "${structure.locationColumn}"
- MATERIAL: "${structure.materialColumn}"
- WEIGHT: "${structure.weightColumn}" (convert to kg!)
- UNIT: "${structure.unitColumn}"
- RECEIVER: "${structure.receiverColumn}" or use default: "${receiver}"
- HAZARDOUS: "${structure.hazardousColumn || 'not detected'}"

═══════════════════════════════════════════════════════════════════════════════
SWEDISH REFERENCE TERMS (match these OR translations in other languages)
═══════════════════════════════════════════════════════════════════════════════
${attributeSynonymRef}

If document is NOT in Swedish, recognize equivalent terms:
- NO: Vekt=Vikt, Mengde=Mängd, Dato=Datum, Mottaker=Mottagare
- DK: Vægt=Vikt, Mængde=Mängd, Dato=Datum, Modtager=Mottagare
- FI: Paino=Vikt, Määrä=Mängd, Päivämäärä=Datum, Vastaanottaja=Mottagare
- EN: Weight=Vikt, Quantity=Mängd, Date=Datum, Receiver=Mottagare

═══════════════════════════════════════════════════════════════════════════════
DATE HANDLING
═══════════════════════════════════════════════════════════════════════════════
⚠️ EXCEL SERIAL DATES: If date is a NUMBER (like 45294), convert it!
   Formula: days since 1899-12-30. Example: 45294 = 2024-01-02
   
Recognize date formats in all languages and output as YYYY-MM-DD:
- "2 jan 2024" / "2. januar 2024" / "2.1.2024" / "Jan 2, 2024" → "2024-01-02"
   
If no date found, use fallback: ${filenameDate || 'today\'s date'}

═══════════════════════════════════════════════════════════════════════════════
MATERIAL STANDARDIZATION
═══════════════════════════════════════════════════════════════════════════════
${materialSynonyms}

═══════════════════════════════════════════════════════════════════════════════
WEIGHT CONVERSION (always output in kg)
═══════════════════════════════════════════════════════════════════════════════
- ton/t/tonn/tonnes → ×1000
- g/gram → ÷1000
- kg/kilogram → as-is

═══════════════════════════════════════════════════════════════════════════════
TABLE DATA (chunk ${chunkNum}/${totalChunks}, ${chunkRows.length} rows)
═══════════════════════════════════════════════════════════════════════════════
${tsv}

═══════════════════════════════════════════════════════════════════════════════
JSON OUTPUT FORMAT (no markdown, no backticks)
═══════════════════════════════════════════════════════════════════════════════
{"items":[{"date":"2024-01-16","location":"Address","material":"Material","weightKg":185,"unit":"Kg","receiver":"${receiver}","isHazardous":false}]}

CRITICAL:
1. Extract ALL ${chunkRows.length} rows!
2. Output dates as YYYY-MM-DD
3. Convert all weights to kg
4. Set isHazardous:true if hazardous waste indicator present (Farligt avfall / Farlig avfall / Vaarallinen jäte / Hazardous)`;

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
  console.log(`   Document language: ${structure.detectedLanguage || 'Swedish (assumed)'}`);
  if (structure.translations && structure.translations.length > 0) {
    console.log(`   Translations applied: ${structure.translations.length}`);
    structure.translations.slice(0, 3).forEach((t: any) => {
      console.log(`      "${t.originalColumn}" → ${t.mappedTo}`);
    });
    if (structure.translations.length > 3) {
      console.log(`      ... and ${structure.translations.length - 3} more`);
    }
  }
  console.log(`   Extracted: ${allItems.length}/${totalRows} (${(extractionRate*100).toFixed(0)}%)`);
  console.log(`   Total rows: ${processedItems.length} (${aggregated.length} unique combinations)`);  
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
    lineItems: processedItems,
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
      // Language detection and translations
      language: {
        detected: structure.detectedLanguage || "Swedish",
        translations: structure.translations || [],
      },
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
