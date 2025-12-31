// CREATE THIS FILE: app/api/test-process/route.ts
// This is a TEST endpoint to process files directly without Azure/Supabase

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// CHUNKED EXTRACTION (same as nuclear option)
async function extractAllRows(
  excelData: any[][],
  filename: string
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
  
  // Infer receiver
  let receiver = "Okänd mottagare";
  const fn = filename.toLowerCase();
  if (fn.includes('ragn-sells') || fn.includes('ragnsells')) receiver = "Ragn-Sells";
  else if (fn.includes('renova')) receiver = "Renova";
  else if (fn.includes('nsr')) receiver = "NSR";
  
  console.log(`✓ Receiver: ${receiver}\n`);
  
  // Material synonyms
  const synonyms = `Trä: Brädor, Virke, Lastpall, Spont
Metall: Järn, Stål, Aluminium
Gips: Gipsplattor, Gipsskivor
Betong: Cement, Ballast`;
  
  // CHUNK SIZE
  const CHUNK_SIZE = 100;
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
- date: Datum column (YYYY-MM-DD)
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

TABLE DATA:
${tsv}

OUTPUT (JSON only, no markdown):
{
  "items": [
    {"date": "2024-01-16", "location": "Artedigränd 10 UMEÅ", "material": "Papper, kontor", "weightKg": 185.00, "unit": "Kg", "receiver": "${receiver}"}
  ]
}

Extract ALL ${chunkRows.length} rows from this chunk!`;

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }]
      });
      
      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      
      // Clean and parse
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      const items = parsed.items || [];
      allItems.push(...items);
      
      console.log(`   ✓ Extracted ${items.length} rows`);
      
    } catch (error) {
      console.error(`   ❌ Chunk ${chunkIndex + 1} failed:`, error);
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
      const existing = grouped.get(key);
      existing.weightKg += item.weightKg;
    } else {
      grouped.set(key, { ...item });
    }
  }
  
  const aggregated = Array.from(grouped.values());
  
  console.log(`\n📊 AGGREGATION:`);
  console.log(`   Original: ${allItems.length} rows`);
  console.log(`   Aggregated: ${aggregated.length} rows`);
  console.log(`   Merged: ${allItems.length - aggregated.length} duplicates`);
  
  const totalWeight = aggregated.reduce((sum, item) => sum + item.weightKg, 0);
  console.log(`   Total weight: ${totalWeight.toFixed(2)} kg = ${(totalWeight/1000).toFixed(2)} ton`);
  
  const uniqueAddresses = new Set(aggregated.map(item => item.location)).size;
  const uniqueMaterials = new Set(aggregated.map(item => item.material)).size;
  
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
      chunks: totalChunks
    },
    totalWeightKg: totalWeight,
    uniqueAddresses,
    uniqueMaterials,
    _validation: {
      completeness: (allItems.length / totalRows) * 100,
      issues: allItems.length < totalRows ? [`Missing ${totalRows - allItems.length} rows`] : []
    }
  };
}

// TEST ENDPOINT
export async function GET() {
  try {
    console.log("\n🧪 TEST ENDPOINT - Processing Ragn-Sells from local file");
    
    // Read the file from your uploads folder
// Read the file from your uploads folder (robust: find matching xlsx)
const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  return NextResponse.json(
    { success: false, error: `Uploads folder not found at ${uploadsDir}` },
    { status: 404 }
  );
}

const files = fs
  .readdirSync(uploadsDir)
  .filter((f) => f.toLowerCase().endsWith(".xlsx"));

const ragnSells = files.find((f) =>
  f.toLowerCase().includes("ragn-sells") || f.toLowerCase().includes("ragnsells")
);

const chosenFile = ragnSells ?? files[0];

if (!chosenFile) {
  return NextResponse.json(
    { success: false, error: "No .xlsx files found. Put one in /uploads" },
    { status: 404 }
  );
}

const filePath = path.join(uploadsDir, chosenFile);
console.log(`✓ Found file: ${filePath}`);

    
    // Read Excel
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
    
    // Extract all rows
    const result = await extractAllRows(
      jsonData as any[][],
      "Ragn-Sells_avfallsstatistik_2024.xlsx"
    );
    
    console.log("✅ TEST COMPLETE!\n");
    
    return NextResponse.json({
      success: true,
      result
    });
    
  } catch (error: any) {
    console.error("❌ Test failed:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}