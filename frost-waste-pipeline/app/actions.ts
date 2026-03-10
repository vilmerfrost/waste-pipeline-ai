"use server";

import { createServiceRoleClient } from "../lib/supabase";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { WasteRecordSchema } from "@/lib/schemas";
import * as XLSX from "xlsx";
import { extractAdaptive } from "@/lib/adaptive-extraction"; 
import { extractFromImage } from "@/lib/extraction-image";
import { mergeExtractionResults, appendNewRowsOnly } from "@/lib/merge-utils";

const STORAGE_BUCKET = "raw_documents";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- 1. UPPDATERADE SÖKORD (Inkluderar SYSAV-termer) ---
const ALIASES = {
  weight: /vikt|mängd|kvantitet|antal|netto|amount|weight/i, // "Mängd" fångar Sysav
  cost: /belopp|pris|cost|summa|totalt|sek|kr|à-pris/i,      // "Belopp" fångar Sysav
  co2: /co2|klimat|utsläpp|besparing|emission/i,
  hazardous: /farligt|fa\b|asbest|lys|batteri|elavfall|elektronik/i,
  material: /material|fraktion|benämning|artikel|avfallsslag/i, // "Artikelbenämning"
  
  // NYTT: ADRESS-SÖKORD
  address: /arbetsplats|hämtställe|ursprung|littera|projekt|adress/i,
  receiver: /mottagare|anläggning|destination/i
};

// --- 2. HJÄLPFUNKTION: PARSA SVENSKA TAL ---
// Hanterar "220,00", "1 000,50" och "220.00"
function parseSwedishNumber(val: any): number {
  if (!val) return 0;
  // Gör om till sträng, ta bort mellanslag (tusenavgränsare)
  let str = String(val).trim().replace(/\s/g, "");
  // Byt komma mot punkt för att göra det till "datorspråk"
  str = str.replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// --- 3. DEN NYA SMARTA RÄKNE-SNURRAN ---
function calculateBigDataTotals(sheet: XLSX.WorkSheet) {
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  if (json.length < 2) return { weight: 0, cost: 0, co2: 0, hazardousCount: 0 };

  // STEG 1: HITTA RUBRIKRADEN (Den smarta delen 🧠)
  // Vi scannar de första 30 raderna. Den rad som har flest träffar på våra alias vinner.
  let headerRowIndex = 0;
  let maxMatches = 0;

  for (let i = 0; i < Math.min(json.length, 30); i++) {
    const rowStr = json[i].map(c => String(c).toLowerCase()).join(" ");
    let matches = 0;
    if (ALIASES.weight.test(rowStr)) matches++;
    if (ALIASES.cost.test(rowStr)) matches++;
    if (ALIASES.material.test(rowStr)) matches++;
    
    // Om vi hittar en rad med både "Mängd" och "Artikel", då är det nog bingolotto!
    if (matches > maxMatches) {
      maxMatches = matches;
      headerRowIndex = i;
    }
  }

  console.log(`📊 Hittade tabellrubriker på rad: ${headerRowIndex + 1}`);

  // Hämta rubrikerna från den vinnande raden
  const headers = json[headerRowIndex].map(h => String(h).toLowerCase());

  // STEG 2: HITTA KOLUMN-INDEX BASERAT PÅ RUBRIKERNA
  const idx = {
    weight: headers.findIndex(h => h.match(ALIASES.weight)),
    cost: headers.findIndex(h => h.match(ALIASES.cost)), // Ofta "Belopp"
    co2: headers.findIndex(h => h.match(ALIASES.co2)),
    material: headers.findIndex(h => h.match(ALIASES.material)), // Ofta "Artikelbenämning"
    
    // NYTT: Hitta Adress-kolumner
    address: headers.findIndex(h => h.match(ALIASES.address)),
    receiver: headers.findIndex(h => h.match(ALIASES.receiver))
  };

  let totalWeight = 0;
  let totalCost = 0;
  let totalCo2 = 0;
  let hazardousCount = 0;

  // STEG 3: LOOPA DATAN (Starta på raden EFTER rubrikerna)
  for (let i = headerRowIndex + 1; i < json.length; i++) {
    const row = json[i];
    
    // Safety check: Om raden är tom eller verkar vara en summering (innehåller "Summa" eller "Totalt")
    const rowStr = row.join("").toLowerCase();
    if (!rowStr || rowStr.includes("summa") || rowStr.includes("total")) continue;

    // VIKT
    if (idx.weight !== -1) {
      totalWeight += parseSwedishNumber(row[idx.weight]);
    }

    // KOSTNAD
    if (idx.cost !== -1) {
      totalCost += parseSwedishNumber(row[idx.cost]);
    }

    // CO2
    if (idx.co2 !== -1) {
      totalCo2 += parseSwedishNumber(row[idx.co2]);
    }

    // FARLIGT AVFALL
    if (idx.material !== -1) {
      const mat = String(row[idx.material] || "");
      if (mat.match(ALIASES.hazardous)) hazardousCount++;
    }
  }

  return {
    weight: Number(totalWeight.toFixed(2)),
    cost: Number(totalCost.toFixed(2)),
    co2: Number(totalCo2.toFixed(2)),
    hazardousCount
  };
}

function extractJsonFromResponse(text: string) {
  try {
    let clean = text.replace(/```json/g, "").replace(/```/g, "");
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON");
    clean = clean.substring(firstBrace, lastBrace + 1);
    return JSON.parse(clean);
  } catch (e) {
    console.error("JSON Error:", text);
    // Returnera ett korrekt strukturerat fallback-objekt som matchar schemat
    return {
      material: { value: "Kunde inte tolka", confidence: 0 },
      weightKg: { value: 0, confidence: 0 },
      cost: { value: 0, confidence: 0 },
      totalCo2Saved: { value: 0, confidence: 0 },
      date: { value: new Date().toISOString().split("T")[0], confidence: 0 },
      supplier: { value: "", confidence: 0 },
      address: { value: "", confidence: 0 },
      receiver: { value: "", confidence: 0 },
      lineItems: []
    };
  }
}

// --- UPLOAD AND ENQUEUE DOCUMENT WITH BETTER ERROR HANDLING ---
export async function uploadAndEnqueueDocument(formData: FormData) {
    const supabase = createServiceRoleClient();
    const user = { id: "00000000-0000-0000-0000-000000000000" }; 
    const file = formData.get("file") as File;
    
    // Validate file presence
    if (!file) {
      throw new Error("Ingen fil hittades i uppladdningen.");
    }
    
    // Validate file size
    if (file.size === 0) {
      throw new Error("Filen är tom (0 bytes). Kontrollera att filen innehåller data.");
    }
    
    // Validate file size limit (50 MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      throw new Error(`Filen är för stor (${sizeMB} MB). Max storlek är 50 MB.`);
    }
    
    // Validate file extension
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["pdf", "xlsx", "xls", "csv", "png", "jpg", "jpeg"];
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      throw new Error(`Filtypen "${fileExtension || 'okänd'}" stöds inte. Endast PDF, Excel (.xlsx, .xls), CSV och bilder (PNG, JPG) är tillåtna.`);
    }
    
    // Generate storage path
    const storagePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;
    
    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });
    
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      if (uploadError.message?.includes("duplicate")) {
        throw new Error("En fil med samma namn finns redan. Byt namn på filen och försök igen.");
      }
      if (uploadError.message?.includes("size")) {
        throw new Error("Filen är för stor för lagring. Försök med en mindre fil.");
      }
      if (uploadError.message?.includes("quota")) {
        throw new Error("Lagringsutrymmet är fullt. Kontakta support.");
      }
      throw new Error("Kunde inte ladda upp filen till lagring. Försök igen.");
    }
    
    // Save to database
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({ 
        user_id: user.id, 
        filename: file.name, 
        storage_path: storagePath, 
        status: "uploaded" 
      })
      .select()
      .single();
    
    if (documentError) {
      console.error("Database insert error:", documentError);
      // Try to clean up the uploaded file
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {});
      
      if (documentError.message?.includes("duplicate")) {
        throw new Error("Ett dokument med samma namn finns redan i systemet.");
      }
      throw new Error("Kunde inte spara dokumentet i databasen. Försök igen.");
    }
    
    // Process document (don't fail the upload if processing fails)
    try { 
      await processDocument(document.id); 
    } catch (error) { 
      console.error("Process Error (upload succeeded):", error); 
      // Don't throw - the file is uploaded, processing can be retried
    }
    
    revalidatePath("/");
    revalidatePath("/collecct");
    return { message: "Uppladdat!", documentId: document.id };
}


/**
 * AI-PROCESS
 */
async function processDocument(documentId: string) {
  const supabase = createServiceRoleClient();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (!doc) throw new Error("Dokument hittades inte");

  await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("raw_documents")
      .download(doc.storage_path);

    if (downloadError) throw new Error("Kunde inte ladda ner fil");
    const arrayBuffer = await fileData.arrayBuffer();
    
    let claudeContent = [];
    let calculatedTotals = { weight: 0, cost: 0, co2: 0, hazardousCount: 0 };
    let isBigFile = false;

    if (doc.filename.endsWith(".xlsx") || doc.filename.endsWith(".xls") || doc.filename.endsWith(".csv")) {
      // EXCEL/CSV: Use adaptive extraction for ALL rows from ALL sheets
      const workbook = XLSX.read(arrayBuffer);
      
      // ✅ FIX: Process ALL sheets, not just the first one!
      console.log(`📊 Excel has ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`);
      
      let allData: any[][] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        
        if (sheetData.length === 0) continue;
        
        console.log(`   📄 Sheet "${sheetName}": ${sheetData.length} rows`);
        
        if (allData.length === 0) {
          allData = sheetData;
        } else {
          // Skip header row on subsequent sheets if it looks like a header
          const firstRowLooksLikeHeader = sheetData[0]?.some((cell: any) => 
            String(cell).toLowerCase().match(/datum|material|vikt|adress|kvantitet/)
          );
          allData = [...allData, ...(firstRowLooksLikeHeader && sheetData.length > 1 ? sheetData.slice(1) : sheetData)];
        }
      }
      
      const jsonData = allData;
      console.log(`📊 Using adaptive extraction for ${jsonData.length} rows from all sheets...`);
      
      // Get settings (or use defaults)
      const { data: settingsData } = await supabase
        .from("settings")
        .select("*")
        .single();
      const settings = settingsData || {};

      // Use adaptive extraction for ALL rows
      const adaptiveResult = await extractAdaptive(
        jsonData as any[][],
        doc.filename,
        settings
      );

      // Convert to expected format
      const extractedData = {
        ...adaptiveResult,
        totalCostSEK: 0,
        documentType: "waste_report",
        _originalLineItems: adaptiveResult.lineItems,
      };

      // Determine status based on extraction quality
      const qualityScore = (adaptiveResult._validation.completeness + (adaptiveResult.metadata?.confidence || 0) * 100) / 2;
      const status = qualityScore >= 90 ? "approved" : "needs_review";
      
      await supabase.from("documents").update({
        status,
        extracted_data: extractedData,
        updated_at: new Date().toISOString()
      }).eq("id", documentId);

      revalidatePath("/");
      return;

    } else if (doc.filename.endsWith(".png") || doc.filename.endsWith(".jpg") || doc.filename.endsWith(".jpeg")) {
      // IMAGE: Use Gemini Flash Vision for OCR extraction
      const { data: settingsData } = await supabase.from("settings").select("*").single();
      const settings = settingsData || {};

      const imageResult = await extractFromImage(arrayBuffer, doc.filename, settings);

      await supabase.from("documents").update({
        status: "needs_review",
        extracted_data: {
          ...imageResult,
          _originalLineItems: imageResult.lineItems,
        },
        updated_at: new Date().toISOString()
      }).eq("id", documentId);

      revalidatePath("/");
      return;

    } else {
      // PDF: Keep existing Claude Vision processing with logging
      const processingLog: string[] = [];
      const log = (msg: string) => {
        const ts = new Date().toISOString().split('T')[1].split('.')[0];
        processingLog.push(`[${ts}] ${msg}`);
        console.log(msg);
      };
      
      log(`${"=".repeat(60)}`);
      log(`📄 PDF EXTRACTION: ${doc.filename}`);
      log(`${"=".repeat(60)}`);
      
      const base64Pdf = Buffer.from(arrayBuffer).toString("base64");
      log(`✓ PDF converted to base64 (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB)`);
      
      claudeContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
      });

      log(`📤 Calling Claude Sonnet for PDF OCR...`);

      // PDF processing continues here (only reached for non-Excel files)
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              ...claudeContent as any,
              {
                type: "text",
                text: `Analysera PDF-dokumentet.
                
                INSTRUKTIONER:
                1. Hitta Metadata (Leverantör, Datum, Adress).
                2. Extrahera alla rader du kan hitta från dokumentet.
                
                ⚠️ KRITISKT - DATUM/PERIOD-HANTERING:
                Om dokumentet visar en PERIOD (datumintervall), extrahera ALLTID SLUTDATUMET!
                Exempel:
                - "Period 20251201-20251231" → använd "2025-12-31" (slutdatum!)
                - "Period: 2025-12-01 - 2025-12-31" → använd "2025-12-31" (slutdatum!)
                Slutdatumet representerar när arbetet SLUTFÖRDES ("Utförtdatum").
                
                JSON OUTPUT:
                {
                  "date": { "value": "YYYY-MM-DD", "confidence": Number },
                  "supplier": { "value": "String", "confidence": Number },
                  "weightKg": { "value": Number, "confidence": Number },
                  "cost": { "value": Number, "confidence": Number },
                  "totalCo2Saved": { "value": Number, "confidence": Number },
                  "material": { "value": "String (Huvudkategori)", "confidence": Number },
                  "address": { "value": "String", "confidence": Number },
                  "receiver": { "value": "String", "confidence": Number },
                  "lineItems": [
                    {
                      "material": { "value": "String", "confidence": Number },
                      "handling": { "value": "String", "confidence": Number },
                      "weightKg": { "value": Number, "confidence": Number },
                      "co2Saved": { "value": Number, "confidence": Number },
                      "percentage": { "value": "String", "confidence": Number },
                      "isHazardous": { "value": Boolean, "confidence": Number },
                      "address": { "value": "String", "confidence": Number },
                      "receiver": { "value": "String", "confidence": Number }
                    }
                  ]
                }
                Returnera ENDAST ren JSON.`,
              },
            ],
          },
        ],
      });

      log(`✓ Claude response received`);

      const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
      let rawData = extractJsonFromResponse(textContent);
      
      log(`✓ JSON parsed successfully`);

      const validatedData = WasteRecordSchema.parse({
          ...rawData,
          lineItems: rawData.lineItems || [],
          _processingLog: processingLog  // ✅ Include processing log
      });
      
      const lineItemCount = validatedData.lineItems?.length || 0;
      log(`✅ PDF extraction complete: ${lineItemCount} line items extracted`);
      log(`${"=".repeat(60)}`);

      await supabase.from("documents").update({
        status: "needs_review",
        extracted_data: {
          ...validatedData,
          _processingLog: processingLog,
          _originalLineItems: validatedData.lineItems || [],
        }
      }).eq("id", documentId);
      
      revalidatePath("/");
      return;
    }

  } catch (error: any) {
    console.error("❌ Process Fail:", error);
    await supabase.from("documents").update({ status: "error" }).eq("id", documentId);
    throw error;
  }
}

/**
 * RE-VERIFY DOCUMENT (AI Dubbelkoll)
 * Reruns AI extraction on an existing document
 * @param customInstructions - Optional extra instructions from user to guide the AI
 */
export async function reVerifyDocument(documentId: string, customInstructions?: string) {
  const supabase = createServiceRoleClient();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (!doc) throw new Error("Dokument hittades inte");

  await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

  try {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("raw_documents")
      .download(doc.storage_path);

    if (downloadError) throw new Error("Kunde inte ladda ner fil");
    const arrayBuffer = await fileData.arrayBuffer();
    
    let claudeContent = [];
    let calculatedTotals = { weight: 0, cost: 0, co2: 0, hazardousCount: 0 };
    let isBigFile = false;

    if (doc.filename.endsWith(".xlsx") || doc.filename.endsWith(".xls") || doc.filename.endsWith(".csv")) {
      // EXCEL/CSV: Use adaptive extraction for ALL rows from ALL sheets (re-verify)
      const workbook = XLSX.read(arrayBuffer);
      
      // ✅ FIX: Process ALL sheets, not just the first one!
      console.log(`📊 Re-verify: Excel has ${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`);
      
      let allData: any[][] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        
        if (sheetData.length === 0) continue;
        
        console.log(`   📄 Sheet "${sheetName}": ${sheetData.length} rows`);
        
        if (allData.length === 0) {
          allData = sheetData;
        } else {
          const firstRowLooksLikeHeader = sheetData[0]?.some((cell: any) => 
            String(cell).toLowerCase().match(/datum|material|vikt|adress|kvantitet/)
          );
          allData = [...allData, ...(firstRowLooksLikeHeader && sheetData.length > 1 ? sheetData.slice(1) : sheetData)];
        }
      }
      
      const jsonData = allData;
      console.log(`📊 Using adaptive extraction for ${jsonData.length} rows from all sheets (re-verify)...`);
      
      // Get settings (or use defaults)
      const { data: settingsData } = await supabase
        .from("settings")
        .select("*")
        .single();
      
      // Merge custom instructions into settings if provided
      const settings = {
        ...(settingsData || {}),
        custom_instructions: customInstructions || settingsData?.custom_instructions
      };

      // Use adaptive extraction for ALL rows
      const adaptiveResult = await extractAdaptive(
        jsonData as any[][],
        doc.filename,
        settings
      );

      // Merge with current user-edited data
      const currentData = doc.extracted_data || {};
      const currentLineItems = currentData.lineItems || [];
      const originalItems = currentData._originalLineItems;

      let mergedLineItems: any[];
      if (originalItems) {
        mergedLineItems = mergeExtractionResults(currentLineItems, adaptiveResult.lineItems || [], originalItems);
      } else {
        mergedLineItems = appendNewRowsOnly(currentLineItems, adaptiveResult.lineItems || []);
      }

      // Recompute stats from merged line items
      const getVal = (f: any) => (typeof f === 'object' && f?.value !== undefined) ? f.value : f;
      const totalWeightKg = mergedLineItems.reduce((sum: number, item: any) => {
        return sum + (parseFloat(String(getVal(item.weightKg) || 0)) || 0);
      }, 0);
      const uniqueAddresses = new Set(mergedLineItems.map((i: any) => getVal(i.location) || getVal(i.address)).filter(Boolean)).size;
      const uniqueReceivers = new Set(mergedLineItems.map((i: any) => getVal(i.receiver)).filter(Boolean)).size;
      const uniqueMaterials = new Set(mergedLineItems.map((i: any) => getVal(i.material)).filter(Boolean)).size;

      const qualityScore = (adaptiveResult._validation.completeness + (adaptiveResult.metadata?.confidence || 0) * 100) / 2;
      const status = qualityScore >= 90 ? "approved" : "needs_review";
      
      await supabase.from("documents").update({
        status,
        extracted_data: {
          ...adaptiveResult,
          totalCostSEK: 0,
          documentType: "waste_report",
          lineItems: mergedLineItems,
          totalWeightKg,
          uniqueAddresses,
          uniqueReceivers,
          uniqueMaterials,
          _validation: {
            ...(adaptiveResult._validation || {}),
            completeness: adaptiveResult._validation?.completeness ?? (mergedLineItems.length > 0 ? 95 : 0),
            confidence: adaptiveResult._validation?.confidence ?? (adaptiveResult.metadata?.confidence || 90),
          },
          metadata: {
            ...(adaptiveResult.metadata || {}),
            totalRows: mergedLineItems.length,
            extractedRows: mergedLineItems.length,
          },
          _originalLineItems: currentData._originalLineItems || currentLineItems,
          _processingLog: [
            ...((currentData._processingLog as string[]) || []),
            `[${new Date().toISOString().split('T')[1].split('.')[0]}] 🔄 Dubbelkoll genomförd — ${mergedLineItems.length} rader efter merge`,
          ],
        },
        updated_at: new Date().toISOString()
      }).eq("id", documentId);

      revalidatePath(`/review/${documentId}`);
      revalidatePath("/");
      revalidatePath("/collecct");
      return;

    } else if (doc.filename.endsWith(".png") || doc.filename.endsWith(".jpg") || doc.filename.endsWith(".jpeg")) {
      // IMAGE: Use Gemini Flash Vision for OCR re-verification
      const { data: settingsData } = await supabase.from("settings").select("*").single();
      const settings = {
        ...(settingsData || {}),
        custom_instructions: customInstructions || settingsData?.custom_instructions,
      };

      const imageResult = await extractFromImage(arrayBuffer, doc.filename, settings);

      // Merge with current user-edited data
      const currentData = doc.extracted_data || {};
      const currentLineItems = currentData.lineItems || [];
      const originalItems = currentData._originalLineItems;

      let mergedLineItems: any[];
      if (originalItems) {
        mergedLineItems = mergeExtractionResults(currentLineItems, imageResult.lineItems || [], originalItems);
      } else {
        mergedLineItems = appendNewRowsOnly(currentLineItems, imageResult.lineItems || []);
      }

      const getVal = (f: any) => (typeof f === 'object' && f?.value !== undefined) ? f.value : f;
      const totalWeightKg = mergedLineItems.reduce((sum: number, item: any) => {
        return sum + (parseFloat(String(getVal(item.weightKg) || 0)) || 0);
      }, 0);
      const uniqueAddresses = new Set(mergedLineItems.map((i: any) => getVal(i.location) || getVal(i.address)).filter(Boolean)).size;
      const uniqueReceivers = new Set(mergedLineItems.map((i: any) => getVal(i.receiver)).filter(Boolean)).size;
      const uniqueMaterials = new Set(mergedLineItems.map((i: any) => getVal(i.material)).filter(Boolean)).size;

      await supabase.from("documents").update({
        status: "needs_review",
        extracted_data: {
          ...imageResult,
          lineItems: mergedLineItems,
          totalWeightKg,
          uniqueAddresses,
          uniqueReceivers,
          uniqueMaterials,
          _originalLineItems: currentData._originalLineItems || currentLineItems,
          _processingLog: [
            ...((currentData._processingLog as string[]) || []),
            `[${new Date().toISOString().split('T')[1].split('.')[0]}] 🔄 Dubbelkoll genomförd — ${mergedLineItems.length} rader efter merge`,
          ],
        },
        updated_at: new Date().toISOString()
      }).eq("id", documentId);

      revalidatePath(`/review/${documentId}`);
      revalidatePath("/");
      revalidatePath("/collecct");
      return;

    } else {
      // PDF: Keep existing Claude Vision processing with logging
      const processingLog: string[] = [];
      const log = (msg: string) => {
        const ts = new Date().toISOString().split('T')[1].split('.')[0];
        processingLog.push(`[${ts}] ${msg}`);
        console.log(msg);
      };
      
      log(`${"=".repeat(60)}`);
      log(`📄 PDF RE-VERIFICATION: ${doc.filename}`);
      log(`${"=".repeat(60)}`);
      if (customInstructions) {
        log(`📝 Custom instructions provided`);
      }
      
      const base64Pdf = Buffer.from(arrayBuffer).toString("base64");
      log(`✓ PDF converted to base64 (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB)`);
      
      claudeContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
      });

      log(`📤 Calling Claude Sonnet for PDF OCR...`);

      // PDF processing continues here (only reached for non-Excel files)
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              ...claudeContent as any,
              {
                type: "text",
                text: `Du är en expert-AI för avfallsrapporter. Analysera PDF-dokumentet noggrant.

                ANVÄND DESSA SYNONYMER FÖR ATT HITTA RÄTT KOLUMN:
                - Material: "BEAst-artikel", "Fraktion", "Avfallsslag", "Artikel", "Taxekod", "Restprodukt".
                - Adress: "Hämtadress", "Littera", "Arbetsplatsnamn", "Uppdragsställe", "Anläggningsadress".
                - Vikt: "Vikt (kg)", "Mängd", "Kvantitet", "Antal kg", "Vikt körtur".
                - Farligt Avfall: Leta efter texten "Farligt avfall", "FA" eller material som Asbest, Elektronik, Batterier, Kemikalier.
                
                INSTRUKTIONER:
                1. Hitta Metadata (Leverantör, Datum, Adress).
                2. Extrahera alla rader du kan hitta från dokumentet.
                3. Farligt avfall: Sätt "isHazardous": true om det är elektronik, kemikalier, asbest etc.
                4. Adress per rad: Om tabellen har kolumner som "Hämtställe", "Littera" eller "Projekt", extrahera dessa per rad.
                
                ⚠️ KRITISKT - DATUM/PERIOD-HANTERING:
                Om dokumentet visar en PERIOD (datumintervall), extrahera ALLTID SLUTDATUMET!
                Exempel:
                - "Period 20251201-20251231" → använd "2025-12-31" (slutdatum!)
                - "Period: 2025-12-01 - 2025-12-31" → använd "2025-12-31" (slutdatum!)
                Slutdatumet representerar när arbetet SLUTFÖRDES ("Utförtdatum").
${customInstructions ? `
                EXTRA INSTRUKTIONER FRÅN ANVÄNDAREN (HÖGSTA PRIORITET):
                ${customInstructions}
` : ''}
                JSON OUTPUT:
                {
                  "date": { "value": "YYYY-MM-DD", "confidence": Number },
                  "supplier": { "value": "String", "confidence": Number },
                  "weightKg": { "value": Number, "confidence": Number },
                  "cost": { "value": Number, "confidence": Number },
                  "totalCo2Saved": { "value": Number, "confidence": Number },
                  "material": { "value": "String (Huvudkategori)", "confidence": Number },
                  "address": { "value": "String", "confidence": Number },
                  "receiver": { "value": "String", "confidence": Number },
                  "lineItems": [
                    {
                      "material": { "value": "String", "confidence": Number },
                      "handling": { "value": "String", "confidence": Number },
                      "weightKg": { "value": Number, "confidence": Number },
                      "co2Saved": { "value": Number, "confidence": Number },
                      "percentage": { "value": "String", "confidence": Number },
                      "isHazardous": { "value": Boolean, "confidence": Number },
                      "address": { "value": "String", "confidence": Number },
                      "receiver": { "value": "String", "confidence": Number }
                    }
                  ]
                }
                Returnera ENDAST ren JSON.`,
              },
            ],
          },
        ],
      });

      log(`✓ Claude response received`);

      const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
      let rawData = extractJsonFromResponse(textContent);
      
      log(`✓ JSON parsed successfully`);

      const validatedData = WasteRecordSchema.parse({
          ...rawData,
          lineItems: rawData.lineItems || [],
          _processingLog: processingLog  // ✅ Include processing log
      });
      
      const lineItemCount = validatedData.lineItems?.length || 0;
      log(`✅ PDF re-verification complete: ${lineItemCount} line items extracted`);
      log(`${"=".repeat(60)}`);

      // Merge with current user-edited data
      const currentData = doc.extracted_data || {};
      const currentLineItems = currentData.lineItems || [];
      const originalItems = currentData._originalLineItems;

      let mergedLineItems: any[];
      if (originalItems) {
        mergedLineItems = mergeExtractionResults(currentLineItems, validatedData.lineItems || [], originalItems);
      } else {
        mergedLineItems = appendNewRowsOnly(currentLineItems, validatedData.lineItems || []);
      }

      const getVal = (f: any) => (typeof f === 'object' && f?.value !== undefined) ? f.value : f;
      const totalWeightKg = mergedLineItems.reduce((sum: number, item: any) => {
        return sum + (parseFloat(String(getVal(item.weightKg) || 0)) || 0);
      }, 0);
      const uniqueAddresses = new Set(mergedLineItems.map((i: any) => getVal(i.location) || getVal(i.address)).filter(Boolean)).size;
      const uniqueReceivers = new Set(mergedLineItems.map((i: any) => getVal(i.receiver)).filter(Boolean)).size;
      const uniqueMaterials = new Set(mergedLineItems.map((i: any) => getVal(i.material)).filter(Boolean)).size;

      const completeness = mergedLineItems.length > 0 ? 95 : 0;
      const vData = validatedData as any;
      const confidence = vData._validation?.confidence || vData.metadata?.confidence || 90;

      await supabase.from("documents").update({
        status: "needs_review",
        extracted_data: {
          ...validatedData,
          lineItems: mergedLineItems,
          totalWeightKg,
          uniqueAddresses,
          uniqueReceivers,
          uniqueMaterials,
          _validation: {
            ...(vData._validation || {}),
            completeness,
            confidence,
          },
          metadata: {
            ...((validatedData as any).metadata || {}),
            totalRows: mergedLineItems.length,
            extractedRows: mergedLineItems.length,
            confidence,
          },
          _originalLineItems: currentData._originalLineItems || currentLineItems,
          _processingLog: [
            ...((currentData._processingLog as string[]) || []),
            ...processingLog,
            `[${new Date().toISOString().split('T')[1].split('.')[0]}] 🔄 Dubbelkoll genomförd — ${mergedLineItems.length} rader efter merge`,
          ],
        }
      }).eq("id", documentId);
      
      revalidatePath(`/review/${documentId}`);
      revalidatePath("/");
      revalidatePath("/collecct");
      return;
    }

    revalidatePath(`/review/${documentId}`);
    revalidatePath("/");

  } catch (error: any) {
    console.error("❌ Re-Verify Fail:", error);
    await supabase.from("documents").update({ status: "error" }).eq("id", documentId);
    throw error;
  }
}

// ... (Behåll saveDocument, deleteDocument etc) ...
export async function saveDocument(formData: FormData) {
  const supabase = createServiceRoleClient();
  const id = formData.get("id") as string;
  
  // Get existing document to preserve all data
  const { data: existingDoc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();
  
  if (!existingDoc) {
    throw new Error("Document not found");
  }
  
  const existingData = existingDoc.extracted_data || {};
  const existingLineItems = existingData.lineItems || [];
  
  // Get edited document metadata from form
  const editedDate = formData.get("date") as string;
  const editedSupplier = formData.get("supplier") as string;
  const editedAddress = formData.get("address") as string;
  const editedReceiver = formData.get("receiver") as string;
  
  // Get lineItems from form, MERGING with existing data to preserve extra fields
  const lineItems: any[] = [];
  let index = 0;
  while (formData.get(`lineItems[${index}].material`) !== null) {
    const material = formData.get(`lineItems[${index}].material`) as string;
    const weightKg = parseFloat(formData.get(`lineItems[${index}].weightKg`) as string || "0");
    const address = formData.get(`lineItems[${index}].address`) as string;
    const location = formData.get(`lineItems[${index}].location`) as string;
    const receiver = formData.get(`lineItems[${index}].receiver`) as string;
    const handling = formData.get(`lineItems[${index}].handling`) as string;
    const isHazardous = formData.get(`lineItems[${index}].isHazardous`) === "true";
    const co2Saved = parseFloat(formData.get(`lineItems[${index}].co2Saved`) as string || "0");
    // ✅ NEW: Get row-specific date
    const rowDate = formData.get(`lineItems[${index}].date`) as string;
    
    if (material || weightKg > 0) {
      // PRESERVE: Start with original line item data (if exists) to keep extra fields
      // like wasteCode, costSEK, referensnummer, fordon, unit, etc.
      const originalItem = existingLineItems[index] || {};
      
      // Merge: original fields + edited fields (edited fields take priority)
      // For address/receiver: use !== null to distinguish "field sent as empty" from "field not in form"
      // This allows users to clear fields (e.g. remove auto-assigned "Ragn-Sells")
      lineItems.push({
        ...originalItem, // Keep ALL original fields (wasteCode, costSEK, unit, etc.)
        // Override with edited values from form:
        material: { value: material || "", confidence: 1 },
        weightKg: { value: weightKg, confidence: 1 },
        address: address !== null ? { value: address, confidence: 1 } : originalItem.address,
        location: location !== null ? { value: location, confidence: 1 } : originalItem.location,
        receiver: receiver !== null ? { value: receiver, confidence: 1 } : originalItem.receiver,
        handling: handling ? { value: handling, confidence: 1 } : originalItem.handling,
        isHazardous: { value: isHazardous, confidence: 1 },
        co2Saved: co2Saved > 0 ? { value: co2Saved, confidence: 1 } : originalItem.co2Saved,
        // Save row-specific date (critical for export!)
        date: rowDate ? { value: rowDate, confidence: 1 } : originalItem.date,
      });
    }
    index++;
  }
  
  // Get totals
  const totalCo2Saved = parseFloat(formData.get("totalCo2Saved") as string || "0");
  const weightKg = parseFloat(formData.get("weightKg") as string || "0");
  const cost = parseFloat(formData.get("cost") as string || "0");
  
  // Calculate total weight from lineItems if not provided
  const calculatedWeight = lineItems.reduce(
    (sum, item) => sum + (Number(item.weightKg?.value) || 0),
    0
  );
  const finalWeight = weightKg || calculatedWeight;
  
  // Update extracted_data with edited values
  const updatedData = {
    ...existingData,
    lineItems,
    totalWeightKg: finalWeight,
    totalCostSEK: cost,
    totalCo2Saved,
    // Update document-level metadata with edited values
    // Use ?? (nullish coalescing) so empty strings are preserved when user clears a field
    documentMetadata: {
      date: editedDate ?? existingData.documentMetadata?.date ?? "",
      supplier: editedSupplier ?? existingData.documentMetadata?.supplier ?? "",
      address: editedAddress ?? existingData.documentMetadata?.address ?? "",
      receiver: editedReceiver ?? existingData.documentMetadata?.receiver ?? "",
    },
    // Also update top-level fields for backward compatibility
    date: { value: editedDate || "", confidence: 1 },
    supplier: { value: editedSupplier || "", confidence: 1 },
    address: { value: editedAddress || "", confidence: 1 },
    receiver: { value: editedReceiver || "", confidence: 1 },
  };
  
  await supabase
    .from("documents")
    .update({
      extracted_data: updatedData,
      status: "approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  
  revalidatePath("/collecct");
  revalidatePath(`/review/${id}`);
  
  // Return success - let the client handle navigation
  return { success: true, documentId: id };
}
// (Behåll övriga exporterade funktioner)
export async function deleteDocument(formData: FormData) {
    const supabase = createServiceRoleClient();
    const id = formData.get("id") as string;
    const storagePath = formData.get("storagePath") as string;
    if (storagePath) await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    await supabase.from("documents").delete().eq("id", id);
    revalidatePath("/");
    revalidatePath("/archive");
    revalidatePath("/collecct");
  }
export async function toggleArchive(formData: FormData) {
    const supabase = createServiceRoleClient();
    const id = formData.get("id") as string;
    const currentState = formData.get("currentState") === "true"; 
    await supabase.from("documents").update({ archived: !currentState }).eq("id", id);
    revalidatePath("/");
    revalidatePath("/archive");
}
export async function addMaterial(formData: FormData) {
    const supabase = createServiceRoleClient();
    const name = formData.get("name") as string;
    if (!name) return;
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    await supabase.from("materials").insert({ name: formattedName });
    revalidatePath("/settings");
    revalidatePath("/review/[id]", "page"); 
  }
export async function deleteMaterial(formData: FormData) {
    const supabase = createServiceRoleClient();
    const id = formData.get("id") as string;
    await supabase.from("materials").delete().eq("id", id);
    revalidatePath("/settings");
    revalidatePath("/review/[id]", "page");
}

/**
 * RETRY PROCESSING
 * Retries processing a document that failed (status = "error")
 */
export async function retryProcessing(documentId: string) {
  const supabase = createServiceRoleClient();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (!doc) throw new Error("Dokument hittades inte");
  
  // Bara tillåt retry om dokumentet har status "error"
  if (doc.status !== "error") {
    throw new Error("Kan bara försöka igen på dokument med fel-status");
  }

  // Återställ status och kör processDocument igen
  await supabase.from("documents").update({ status: "uploaded" }).eq("id", documentId);
  
  try {
    await processDocument(documentId);
    revalidatePath("/");
    revalidatePath("/archive");
  } catch (error) {
    // Om det fortfarande misslyckas, sätt tillbaka till error
    await supabase.from("documents").update({ status: "error" }).eq("id", documentId);
    throw error;
  }
}

/**
 * ARKIVERA ALLA DOKUMENT
 * Sätter archived = true på alla dokument som inte redan är arkiverade
 */
export async function archiveAllDocuments() {
  const supabase = createServiceRoleClient();
  
  // Archive all non-exported active documents
  const { error } = await supabase
    .from("documents")
    .update({ archived: true })
    .is("exported_at", null); // Only archive active (non-exported) documents

  if (error) {
    console.error("Archive All Error:", error);
    throw new Error("Kunde inte arkivera allt.");
  }

  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/collecct");
}

/**
 * ARKIVERA VALDA DOKUMENT
 * Archives specific documents by ID
 */
export async function archiveSelectedDocuments(documentIds: string[]) {
  if (!documentIds || documentIds.length === 0) {
    throw new Error("Inga dokument valda för arkivering.");
  }
  
  const supabase = createServiceRoleClient();
  
  const { error } = await supabase
    .from("documents")
    .update({ archived: true })
    .in("id", documentIds);

  if (error) {
    console.error("Archive Selected Error:", error);
    throw new Error("Kunde inte arkivera valda dokument.");
  }

  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/collecct");
}

/**
 * GODKÄNN VALDA DOKUMENT
 * Approves specific documents by ID (only needs_review ones)
 */
export async function approveSelectedDocuments(documentIds: string[]) {
  if (!documentIds || documentIds.length === 0) {
    throw new Error("Inga dokument valda för godkännande.");
  }
  
  const supabase = createServiceRoleClient();
  
  const { error } = await supabase
    .from("documents")
    .update({ status: "approved" })
    .in("id", documentIds)
    .eq("status", "needs_review");

  if (error) {
    console.error("Approve Selected Error:", error);
    throw new Error("Kunde inte godkänna valda dokument.");
  }

  revalidatePath("/");
  revalidatePath("/collecct");
}

/**
 * RADERA VALDA DOKUMENT
 * Deletes specific documents by ID
 */
export async function deleteSelectedDocuments(documentIds: string[]) {
  if (!documentIds || documentIds.length === 0) {
    throw new Error("Inga dokument valda för radering.");
  }
  
  const supabase = createServiceRoleClient();
  
  // Get storage paths for cleanup
  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path")
    .in("id", documentIds);
  
  // Delete from storage
  if (docs) {
    const storagePaths = docs
      .map(d => d.storage_path)
      .filter(Boolean);
    if (storagePaths.length > 0) {
      await supabase.storage.from("raw_documents").remove(storagePaths);
    }
  }
  
  // Delete from database
  const { error } = await supabase
    .from("documents")
    .delete()
    .in("id", documentIds);

  if (error) {
    console.error("Delete Selected Error:", error);
    throw new Error("Kunde inte radera valda dokument.");
  }

  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/collecct");
}

/**
 * GODKÄNN ALLA DOKUMENT
 * Sätter status = "approved" på alla dokument som behöver granskas
 */
export async function verifyAllDocuments() {
  const supabase = createServiceRoleClient();
  
  // Uppdatera alla dokument som behöver granskas eller är i processing
  const { error } = await supabase
    .from("documents")
    .update({ status: "approved" })
    .in("status", ["needs_review", "processing", "uploaded", "queued"]);

  if (error) {
    console.error("Verify All Error:", error);
    throw new Error("Kunde inte godkänna allt.");
  }

  revalidatePath("/");
  revalidatePath("/collecct");
  revalidatePath("/review/[id]", "page");
}

/**
 * REJECT DOCUMENT (Collecct workflow)
 * Rejects a document for manual processing
 */
export async function rejectDocument(formData: FormData) {
  const supabase = createServiceRoleClient();
  const id = formData.get("id") as string;
  const reason = formData.get("reason") as string | null;

  // Get current extracted_data
  const { data: currentDoc } = await supabase
    .from("documents")
    .select("extracted_data")
    .eq("id", id)
    .single();

  await supabase
    .from("documents")
    .update({
      status: "rejected",
      extracted_data: {
        ...(currentDoc?.extracted_data || {}),
        rejected: true,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason || "Manual rejection",
      },
    })
    .eq("id", id);

  revalidatePath("/collecct");
  revalidatePath("/");
}