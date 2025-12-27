import { createServiceRoleClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { extractAdaptive } from "@/lib/adaptive-extraction";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ============================================================================
// SETTINGS
// ============================================================================
async function getSettings() {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", "default")
    .single();
  
  return data || {
    auto_approve_threshold: 80,
    material_synonyms: {
      "Trä": ["Brädor", "Virke", "Lastpall", "Spont"],
      "Metall": ["Järn", "Stål", "Aluminium"],
      "Gips": ["Gipsplattor", "Gipsskivor"],
      "Betong": ["Cement", "Ballast"]
    }
  };
}

// ============================================================================
// OLD CHUNKED EXTRACTION - REMOVED (replaced by adaptive extraction)
// ============================================================================
// This function is no longer used - all Excel files now use extractAdaptive()
// Keeping for reference only - can be deleted
async function _extractAllRows_DEPRECATED(
  excelData: any[][],
  filename: string,
  settings: any
): Promise<any> {
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📊 PROCESSING: ${filename}`);
  console.log(`${"=".repeat(80)}`);
  
  // Find header row
  let headerIndex = 0;
  for (let i = 0; i < Math.min(10, excelData.length); i++) {
    const row = excelData[i];
    if (row.some(cell => 
      String(cell).toLowerCase().includes('datum') ||
      String(cell).toLowerCase().includes('material') ||
      String(cell).toLowerCase().includes('kvantitet')
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
  console.log(`\n📊 TOTAL ROWS TO EXTRACT: ${totalRows}`);
  
  if (totalRows === 0) {
    throw new Error("No data rows found!");
  }
  
  // Infer receiver from filename
  let receiver = "Okänd mottagare";
  const fn = filename.toLowerCase();
  if (fn.includes('ragn-sells') || fn.includes('ragnsells')) receiver = "Ragn-Sells";
  else if (fn.includes('renova')) receiver = "Renova";
  else if (fn.includes('nsr')) receiver = "NSR";
  
  // Extract date from filename
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  const documentDate = dateMatch ? dateMatch[1] : null;
  
  console.log(`✓ Receiver: ${receiver}`);
  console.log(`✓ Date from filename: ${documentDate || 'NOT FOUND'}\n`);
  
  // Material synonyms
  const synonyms = Object.entries(settings.material_synonyms || {})
    .map(([std, syns]) => `${std}: ${(syns as string[]).join(", ")}`)
    .join("\n");
  
  // CHUNK SIZE - Use Haiku for cost efficiency
  const CHUNK_SIZE = 150; // Haiku can handle larger chunks
  const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);
  
  console.log(`📦 CHUNKING: ${totalChunks} chunks of ${CHUNK_SIZE} rows each\n`);
  
  const allItems: any[] = [];
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalRows);
    const chunkRows = dataRows.slice(start, end);
    
    console.log(`📦 Chunk ${chunkIndex + 1}/${totalChunks}: rows ${start + 1}-${end}`);
    
    // Convert to TSV
    const tsv = [header, ...chunkRows]
      .map(row => row.map(cell => String(cell || "")).join('\t'))
      .join('\n');
    
    // EXTRACTION PROMPT
    const prompt = `⚠️ CRITICAL: EXTRACT EVERY SINGLE ROW FROM THIS TABLE!

This is chunk ${chunkIndex + 1} of ${totalChunks}. Total file has ${totalRows} rows.

MATERIAL SYNONYMS:
${synonyms}

MANDATORY FIELDS:
- date: Datum column (YYYY-MM-DD)${documentDate ? ` - If missing, use "${documentDate}" from filename` : ''}
- location: Uppdragsställe column  
- material: Material column (use standard names)
- weightKg: Kvantitet column (convert to kg if needed)
- unit: Always "Kg"
- receiver: Use "${receiver}" for all rows

CRITICAL RULES:
1. EXTRACT EVERY ROW - Do NOT skip any!
2. If Enhet = "ton", multiply Kvantitet by 1000
3. If Enhet = "g", divide Kvantitet by 1000
4. Use ${receiver} as receiver for ALL rows
5. Use "${documentDate || 'today\'s date'}" as date if date column is missing

TABLE DATA:
${tsv}

OUTPUT (JSON only, no markdown, NO {value, confidence} wrappers):
{
  "items": [
    {"date": "${documentDate || "2024-01-16"}", "location": "Artedigränd 10 UMEÅ", "material": "Papper, kontor", "weightKg": 185.00, "unit": "Kg", "receiver": "${receiver}"}
  ]
}

Extract ALL ${chunkRows.length} rows from this chunk!`;

    // Retry logic with Sonnet fallback
    let processedItems: any[] = [];
    let chunkSuccess = false;
    let lastError: any = null;
    
    // Try with Haiku first (cheaper)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = attempt === 0 
          ? "claude-haiku-4-5-20251001"  // Try Haiku first
          : "claude-sonnet-4-20250514";  // Fallback to Sonnet
        
        console.log(`   🔄 Attempt ${attempt + 1}/2: Using ${model === "claude-haiku-4-5-20251001" ? "Haiku" : "Sonnet"}`);
        
        const response = await anthropic.messages.create({
          model: model as any,
          max_tokens: attempt === 0 ? 8192 : 16384, // More tokens for Sonnet
          messages: [{ role: "user", content: prompt }]
        });
        
        const text = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => (b as any).text)
          .join('');
        
        // Better JSON extraction - try multiple strategies
        let parsed: any = null;
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Strategy 1: Direct parse
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
              // Remove trailing commas before closing braces/brackets
              cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
              // Fix unclosed strings (add quote at end if missing)
              const openQuotes = (cleaned.match(/"/g) || []).length;
              if (openQuotes % 2 !== 0) {
                cleaned = cleaned.trim() + '"';
              }
              parsed = JSON.parse(cleaned);
            } catch (e3: any) {
              throw new Error(`JSON parse failed after 3 strategies: ${e1?.message || 'Unknown error'}`);
            }
          }
        }
        
        const items = parsed?.items || [];
        
        // Ensure all items have date and receiver
        processedItems = items.map((item: any) => ({
          ...item,
          date: item.date || documentDate || new Date().toISOString().split('T')[0],
          receiver: item.receiver || receiver,
        }));
        
        allItems.push(...processedItems);
        chunkSuccess = true;
        
        console.log(`   ✓ Extracted ${processedItems.length} rows (${model === "claude-haiku-4-5-20251001" ? "Haiku" : "Sonnet"})`);
        break; // Success, exit retry loop
        
      } catch (error: any) {
        lastError = error;
        console.error(`   ⚠️ Attempt ${attempt + 1} failed:`, error.message);
        
        // If it's a JSON parse error and we haven't tried Sonnet yet, continue to retry
        if (attempt === 0 && (error.message.includes('JSON') || error.message.includes('parse'))) {
          console.log(`   🔄 Retrying with Sonnet (better JSON handling)...`);
          continue;
        }
        
        // If it's not a JSON error or we've already tried Sonnet, break
        if (attempt === 1 || !error.message.includes('JSON')) {
          break;
        }
      }
    }
    
    if (!chunkSuccess) {
      console.error(`   ❌ Chunk ${chunkIndex + 1} failed after all retries:`, lastError?.message);
      // Don't throw - continue processing other chunks
    }
  }
  
  console.log(`\n✅ TOTAL EXTRACTED: ${allItems.length} rows (expected: ${totalRows})`);
  
  if (allItems.length < totalRows * 0.9) {
    console.warn(`⚠️ WARNING: Only got ${allItems.length}/${totalRows} rows!`);
  }
  
  // Aggregate by primary key
  const grouped = new Map<string, any>();
  
  for (const item of allItems) {
    const key = `${item.date}|${item.location}|${item.material}|${item.receiver}`;
    
    if (grouped.has(key)) {
      // Merge weights
      const existing = grouped.get(key);
      existing.weightKg = (existing.weightKg || 0) + (item.weightKg || 0);
      } else {
      grouped.set(key, { ...item });
    }
  }
  
  const aggregated = Array.from(grouped.values());
  
  console.log(`\n📊 AGGREGATION:`);
  console.log(`   Original: ${allItems.length} rows`);
  console.log(`   Aggregated: ${aggregated.length} rows`);
  console.log(`   Merged: ${allItems.length - aggregated.length} duplicates`);
  
  const totalWeight = aggregated.reduce((sum: number, item: any) => sum + (item.weightKg || 0), 0);
  console.log(`   Total weight: ${totalWeight.toFixed(2)} kg = ${(totalWeight/1000).toFixed(2)} ton`);
  
  const uniqueAddresses = new Set(aggregated.map((item: any) => item.location)).size;
  const uniqueMaterials = new Set(aggregated.map((item: any) => item.material)).size;
  
  console.log(`   Unique addresses: ${uniqueAddresses}`);
  console.log(`   Unique materials: ${uniqueMaterials}`);
  console.log(`${"=".repeat(80)}\n`);
  
  return {
    lineItems: aggregated,
    metadata: {
      totalRows,
      extractedRows: allItems.length,
      aggregatedRows: aggregated.length,
      chunked: true,
      chunks: totalChunks,
      model: "haiku" // Track which model was used
    },
    totalWeightKg: totalWeight,
    totalCostSEK: 0,
    documentType: "waste_report",
    uniqueAddresses,
    uniqueReceivers: 1,
    uniqueMaterials,
    _validation: {
      completeness: (allItems.length / totalRows) * 100,
      confidence: 95,
      issues: allItems.length < totalRows ? [`Missing ${totalRows - allItems.length} rows`] : []
    }
  };
}

// ============================================================================
// PDF EXTRACTION WITH CLAUDE VISION
// ============================================================================

// Helper function to clean PDF extraction results (remove {value, confidence} wrappers)
function cleanPDFExtractionData(items: any[]): any[] {
  return items.map(item => {
    // Handle both wrapped ({value, confidence}) and clean formats
    // Note: location might be "USE_DOCUMENT_ADDRESS" marker - will be replaced later
    const cleanItem: any = {
      date: item.date?.value || item.date || null,
      location: item.location?.value || item.location || item.address?.value || item.address || null, // Keep null, will use document address
      material: item.material?.value || item.material || "Okänt material",
      weightKg: parseFloat(String(item.weightKg?.value || item.weightKg || item.weight?.value || item.weight || 0)),
      unit: item.unit?.value || item.unit || "Kg",
      receiver: item.receiver?.value || item.receiver || "Okänd mottagare",
    };
    
    // Add optional fields if they exist
    if (item.cost?.value !== undefined || item.cost !== undefined) {
      cleanItem.costSEK = parseFloat(String(item.cost?.value || item.cost || 0));
    }
    
    if (item.wasteCode?.value || item.wasteCode) {
      cleanItem.wasteCode = item.wasteCode?.value || item.wasteCode;
    }
    
    if (item.handling?.value || item.handling) {
      cleanItem.handling = item.handling?.value || item.handling;
    }
    
    if (item.isHazardous?.value !== undefined || item.isHazardous !== undefined) {
      cleanItem.isHazardous = item.isHazardous?.value || item.isHazardous;
    }
    
    return cleanItem;
  });
}

async function extractFromPDF(
  pdfBuffer: ArrayBuffer,
  filename: string,
  settings: any
): Promise<any> {
  
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📄 PROCESSING PDF: ${filename}`);
  console.log(`${"=".repeat(80)}`);
  
  // Convert PDF to base64
  const base64Data = Buffer.from(pdfBuffer).toString("base64");
  
  // Infer receiver from filename
  let receiver = "Okänd mottagare";
  const fn = filename.toLowerCase();
  if (fn.includes('ragn-sells') || fn.includes('ragnsells')) receiver = "Ragn-Sells";
  else if (fn.includes('renova')) receiver = "Renova";
  else if (fn.includes('nsr')) receiver = "NSR";
  
  // Extract date from filename
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  const documentDate = dateMatch ? dateMatch[1] : null;
  
  console.log(`✓ Receiver: ${receiver}`);
  console.log(`✓ Date from filename: ${documentDate || 'NOT FOUND'}\n`);
  
  // Material synonyms
  const synonyms = Object.entries(settings.material_synonyms || {})
    .map(([std, syns]) => `${std}: ${(syns as string[]).join(", ")}`)
    .join("\n");
  
  // Build extraction prompt - Extract document-level info AND table rows
  const prompt = `Extract ALL waste data from this Swedish PDF document.

CRITICAL: This PDF has TWO types of information:
1. DOCUMENT-LEVEL info (at top/header): Project name, address, project location
2. TABLE ROWS: Material, weight, receiver, etc.

EXTRACT BOTH!

MATERIAL SYNONYMS:
${synonyms}

OUTPUT FORMAT (JSON, no markdown, NO {value, confidence} wrappers):
{
  "documentInfo": {
    "projectName": "Östergårds Förskola",
    "address": "Östergårds Förskola",
    "date": "${documentDate || "2024-01-16"}"
  },
  "items": [
    {
      "date": "${documentDate || "2024-01-16"}",
      "location": "USE_DOCUMENT_ADDRESS",
      "material": "Trä",
      "weightKg": 3820,
      "unit": "Kg",
      "receiver": "${receiver}"
    }
  ]
}

RULES:
1. Extract document-level address from header/top of PDF (look for "Projekt:", "Adress:", etc.)
2. If table has NO address/location column, use "USE_DOCUMENT_ADDRESS" as location marker
3. Extract project name from document header if available
4. All weights in kg (convert from ton: × 1000, from g: ÷ 1000)
5. Extract EVERY row from table
6. Use "${receiver}" as receiver if not specified
7. Use "${documentDate || 'current date'}" as date if not in document

WEIGHT CONVERSION:
- If unit is "ton" or "t": multiply by 1000
- If unit is "g": divide by 1000
- If unit is "kg": use as-is

CRITICAL: Output CLEAN JSON (NO {value, confidence} wrappers!)
Return values directly: "material": "Betong" NOT "material": {"value": "Betong"}
Extract ALL material rows from the table. Return JSON only!`;

  try {
    console.log("📤 Sending PDF to Claude Vision API...");
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929", // Use Sonnet for better PDF OCR quality
      max_tokens: 16384,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => (b as any).text)
      .join('');
    
    // Clean and parse
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
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
    
    // Extract document-level info
    const documentInfo = parsed.documentInfo || {};
    const documentAddress = documentInfo.address || 
                            documentInfo.projectName || 
                            documentInfo.location ||
                            null;
    
    if (documentAddress) {
      console.log(`✓ Document address found: ${documentAddress}`);
    } else {
      console.log(`⚠️ No document address found in PDF header`);
    }
    
    const rawItems = parsed.items || [];
    
    // CRITICAL: Clean the data to remove {value, confidence} wrappers
    const cleanedItems = cleanPDFExtractionData(rawItems);
    
    // Ensure all items have date, receiver, and location (use document address if missing)
    const processedItems = cleanedItems.map((item: any) => {
      // Determine location: use document address if row has "USE_DOCUMENT_ADDRESS" marker or missing location
      let location = item.location?.value || item.location;
      
      if (!location || 
          location === "USE_DOCUMENT_ADDRESS" || 
          location === "SAKNAS" || 
          location === "" ||
          String(location).toLowerCase() === "okänd adress") {
        location = documentAddress || "Okänd adress";
      }
      
      return {
        ...item,
        date: item.date || documentInfo.date || documentDate || new Date().toISOString().split('T')[0],
        receiver: item.receiver || receiver,
        location: location, // Use document address if row doesn't have one
        weightKg: parseFloat(String(item.weightKg || 0)), // Ensure it's a number
      };
    });
    
    if (documentAddress) {
      const rowsWithDocumentAddress = processedItems.filter((item: any) => 
        item.location === documentAddress
      ).length;
      console.log(`✓ Applied document address to ${rowsWithDocumentAddress} rows`);
    }
    
    console.log(`✅ Extracted ${processedItems.length} items from PDF`);
    
    // Aggregate by primary key
    const grouped = new Map<string, any>();
    
    for (const item of processedItems) {
      const key = `${item.date}|${item.location}|${item.material}|${item.receiver}`;
      
      // Ensure weightKg is a number
      const weightKg = parseFloat(String(item.weightKg || 0));
      
      if (grouped.has(key)) {
        const existing = grouped.get(key)!;
        existing.weightKg = parseFloat(String(existing.weightKg || 0)) + weightKg;
        // Merge optional fields if they exist
        if (item.costSEK && !existing.costSEK) {
          existing.costSEK = parseFloat(String(item.costSEK));
        }
      } else {
        grouped.set(key, { 
          ...item,
          weightKg: weightKg // Ensure it's a number
        });
      }
    }
    
    const aggregated = Array.from(grouped.values());
    const totalWeight = aggregated.reduce((sum: number, item: any) => {
      const weight = parseFloat(String(item.weightKg || 0));
      return sum + weight;
    }, 0);
    
    const uniqueAddresses = new Set(aggregated.map((item: any) => item.location)).size;
    const uniqueMaterials = new Set(aggregated.map((item: any) => item.material)).size;
    
    console.log(`\n📊 AGGREGATION:`);
    console.log(`   Original: ${processedItems.length} items`);
    console.log(`   Aggregated: ${aggregated.length} items`);
    console.log(`   Merged: ${processedItems.length - aggregated.length} duplicates`);
    console.log(`   Total weight: ${totalWeight.toFixed(2)} kg = ${(totalWeight/1000).toFixed(2)} ton`);
    console.log(`   Unique addresses: ${uniqueAddresses}`);
    console.log(`   Unique materials: ${uniqueMaterials}`);
    console.log(`${"=".repeat(80)}\n`);
    
    // Calculate total cost if available
    const totalCostSEK = aggregated.reduce((sum: number, item: any) => {
      const cost = parseFloat(String(item.costSEK || 0));
      return sum + cost;
    }, 0);
    
    return {
      lineItems: aggregated, // Clean data, no wrappers!
      metadata: {
        totalRows: processedItems.length,
        extractedRows: processedItems.length,
        aggregatedRows: aggregated.length,
        chunked: false,
        chunks: 1,
        model: "sonnet-4-5" // Track which model was used
      },
      totalWeightKg: totalWeight,
      totalCostSEK: totalCostSEK,
      documentType: "waste_report",
      uniqueAddresses,
      uniqueReceivers: 1,
      uniqueMaterials,
      _validation: {
        completeness: processedItems.length > 0 ? 95 : 0,
        confidence: 90,
        issues: processedItems.length === 0 ? ["No data extracted from PDF"] : []
      }
    };
    
  } catch (error: any) {
    console.error("❌ PDF extraction failed:", error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// ============================================================================
// MAIN PROCESS ROUTE
// ============================================================================
export async function GET() {
  let docId: string | null = null;
  
  try {
    const supabase = createServiceRoleClient();
    const settings = await getSettings();
    
    // Get next document to process
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("status", "processing")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    
    if (error || !doc) {
      return NextResponse.json({
        success: false,
        message: "No documents to process"
      });
    }
    
    docId = doc.id; // Store for error handling
    console.log(`\n🔄 Processing: ${doc.filename}`);
    
    // Download file from URL or storage path
    let arrayBuffer: ArrayBuffer;
    
    if (doc.url) {
      // Download from URL
      const response = await fetch(doc.url);
      arrayBuffer = await response.arrayBuffer();
    } else if (doc.storage_path) {
      // Download from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("raw_documents")
        .download(doc.storage_path);
      
      if (downloadError) {
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }
      
      arrayBuffer = await fileData.arrayBuffer();
    } else {
      throw new Error("No file URL or storage path found");
    }
    
    // Check file type
    const isExcel = doc.filename.match(/\.(xlsx|xls)$/i);
    const isPDF = doc.filename.match(/\.pdf$/i);
    
    let extractedData: any;
    
    if (isExcel) {
      console.log("📊 Excel file detected - using ADAPTIVE extraction");
      
      // EXCEL PROCESSING WITH ADAPTIVE EXTRACTION
      const workbook = XLSX.read(arrayBuffer);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
      
      // Use adaptive extraction for better handling of chaotic documents!
      const adaptiveResult = await extractAdaptive(
        jsonData as any[][],
        doc.filename,
        settings
      );
      
      // Convert to expected format
      extractedData = {
        ...adaptiveResult,
        totalCostSEK: 0,
        documentType: "waste_report",
        uniqueReceivers: adaptiveResult.uniqueReceivers || 1,
      };
    } else if (isPDF) {
      console.log("📄 PDF file detected - using Claude Vision OCR (Sonnet)");
      
      // PDF PROCESSING WITH CLAUDE VISION
      extractedData = await extractFromPDF(
        arrayBuffer,
        doc.filename,
        settings
      );
    } else {
      throw new Error(`Unsupported file type: ${doc.filename}. Only Excel (.xlsx, .xls) and PDF (.pdf) are supported.`);
    }
    
    // Generate AI summary
    const completeness = extractedData._validation.completeness;
    const confidence = extractedData._validation.confidence || completeness;
    
    // Use adaptive confidence if available (from adaptive extraction)
    const overallConfidence = extractedData.metadata?.confidence 
      ? extractedData.metadata.confidence * 100 
      : confidence;
    
    const aiSummary = completeness >= 95 && overallConfidence >= 90
      ? `✓ Dokument med ${extractedData.metadata.aggregatedRows} rader från ${extractedData.uniqueAddresses} adresser. Total vikt: ${(extractedData.totalWeightKg/1000).toFixed(2)} ton. Data komplett (${overallConfidence.toFixed(0)}% säkerhet) - redo för godkännande.`
      : `⚠️ Dokument med ${extractedData.metadata.aggregatedRows} rader. ${(100 - completeness).toFixed(0)}% data saknas, ${overallConfidence.toFixed(0)}% säkerhet - behöver granskning.`;
    
    extractedData.aiSummary = aiSummary;
    
    // Determine status based on both completeness and confidence
    // Adaptive extraction provides better confidence scores
    const qualityScore = (completeness + overallConfidence) / 2;
    const newStatus = qualityScore >= settings.auto_approve_threshold 
      ? "approved" 
      : "needs_review";
    
    // Save to database
    await supabase
      .from("documents")
      .update({
        status: newStatus,
        extracted_data: extractedData,
        updated_at: new Date().toISOString()
      })
      .eq("id", doc.id);
    
    console.log(`✅ Processing complete: ${doc.filename}`);
    console.log(`   Status: ${newStatus}`);
    console.log(`   Completeness: ${completeness.toFixed(1)}%`);
    console.log(`   Confidence: ${overallConfidence.toFixed(1)}%`);
    console.log(`   Quality Score: ${qualityScore.toFixed(1)}%`);
    console.log(`   Model: ${extractedData.metadata?.model || 'adaptive'}`);
    console.log(`   Chunks: ${extractedData.metadata?.chunks || 1}\n`);

    return NextResponse.json({ 
      success: true, 
      file: doc.filename, 
      data: extractedData,
      status: newStatus,
      validation: extractedData._validation
    });

  } catch (error: any) {
    console.error("❌ Processing error:", error);
    
    // Update document status to error
    if (docId) {
      try {
        const supabase = createServiceRoleClient();
        await supabase
          .from("documents")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", docId);
        console.log(`❌ Updated document ${docId} to error status`);
      } catch (updateError) {
        console.error("Failed to update error status:", updateError);
      }
    }
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
