"use server";

import { createServiceRoleClient } from "../lib/supabase";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { WasteRecordSchema } from "@/lib/schemas";
import * as XLSX from "xlsx"; 

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

// ... uploadAndEnqueueDocument ÄR SAMMA SOM FÖRUT ...
export async function uploadAndEnqueueDocument(formData: FormData) {
    const supabase = createServiceRoleClient();
    const user = { id: "00000000-0000-0000-0000-000000000000" }; 
    const file = formData.get("file") as File;
    if (!file || file.size === 0) throw new Error("Ingen fil uppladdad.");
    const fileExtension = file.name.split(".").pop();
    const storagePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { cacheControl: "3600", upsert: false });
    if (uploadError) throw new Error("Kunde inte ladda upp filen.");
    const { data: document, error: documentError } = await supabase.from("documents").insert({ user_id: user.id, filename: file.name, storage_path: storagePath, status: "uploaded" }).select().single();
    if (documentError) throw new Error("Kunde inte spara i databasen.");
    try { await processDocument(document.id); } catch (error) { console.error("Process Error:", error); }
    revalidatePath("/");
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

    if (doc.filename.endsWith(".xlsx")) {
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      console.log("🧮 Räknar totaler via kod...");
      calculatedTotals = calculateBigDataTotals(sheet);
      console.log("✅ Kod-Totaler:", calculatedTotals);

      // SÄKERHET: Ta bara de första 25 raderna för AI-analys.
      // Detta garanterar att vi inte slår i taket för Tokens.
      const jsonPreview = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 25);
      const csvPreview = jsonPreview.map(row => (row as any[]).join(",")).join("\n");
      
      isBigFile = true;

      claudeContent.push({ 
        type: "text", 
        text: `Här är ett SMAKPROV (första 20 raderna) av en stor Excel-fil:\n${csvPreview}\n\n` + 
              `MATEMATISKA TOTALER (Redan uträknat): ` + 
              `Vikt=${calculatedTotals.weight}, Kostnad=${calculatedTotals.cost}.`
      });

    } else {
      const base64Pdf = Buffer.from(arrayBuffer).toString("base64");
      claudeContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
      });
  }

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
              text: `Analysera datan.
              
              INSTRUKTIONER:
              1. Hitta Metadata (Leverantör, Datum, Adress).
              2. Extrahera rader från SMAKPROVET. Returnera MAX 15 RADER i JSON. Försök inte returnera hela filen.
              
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

    const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
    let rawData = extractJsonFromResponse(textContent);

    // MERGE: Använd de säkra totalerna från koden som FALLBACK
    // OBS: Vi använder bara beräknade totaler när AI-extraction saknas eller är 0/null
    // Vi jämför INTE magnitud - AI-extracted värden ska alltid prioriteras
    if (isBigFile) {
        // Vikt: Använd beräknad total endast om AI:n inte hittade något eller returnerade 0
        if (!rawData.weightKg?.value || rawData.weightKg.value === 0) {
            rawData.weightKg = { value: calculatedTotals.weight, confidence: 1.0 };
        }
        // Kostnad: Använd beräknad total endast om AI:n inte hittade något eller returnerade 0
        if (!rawData.cost?.value || rawData.cost.value === 0) {
            rawData.cost = { value: calculatedTotals.cost, confidence: 1.0 };
        }
        // CO2: Använd beräknad total endast om AI:n inte hittade något
        if (!rawData.totalCo2Saved?.value && calculatedTotals.co2 > 0) {
            rawData.totalCo2Saved = { value: calculatedTotals.co2, confidence: 1.0 };
        }
    }

    const validatedData = WasteRecordSchema.parse({
        ...rawData,
        lineItems: rawData.lineItems || []
    });

    await supabase.from("documents").update({
      status: "needs_review",
      extracted_data: validatedData
    }).eq("id", documentId);

  } catch (error: any) {
    console.error("❌ Process Fail:", error);
    await supabase.from("documents").update({ status: "error" }).eq("id", documentId);
    throw error;
  }
}

/**
 * RE-VERIFY DOCUMENT (AI Dubbelkoll)
 * Reruns AI extraction on an existing document
 */
export async function reVerifyDocument(documentId: string) {
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

    if (doc.filename.endsWith(".xlsx")) {
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      console.log("🧮 Räknar totaler via kod (re-verify)...");
      calculatedTotals = calculateBigDataTotals(sheet);
      console.log("✅ Kod-Totaler:", calculatedTotals);

      const jsonPreview = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(0, 25);
      const csvPreview = jsonPreview.map(row => (row as any[]).join(",")).join("\n");
      
      isBigFile = true;

      claudeContent.push({ 
        type: "text", 
        text: `Här är ett SMAKPROV (första 20 raderna) av en stor Excel-fil:\n${csvPreview}\n\n` + 
              `MATEMATISKA TOTALER (Redan uträknat): ` + 
              `Vikt=${calculatedTotals.weight}, Kostnad=${calculatedTotals.cost}.`
      });

    } else {
      const base64Pdf = Buffer.from(arrayBuffer).toString("base64");
      claudeContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
      });
    }

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
              text: `Du är en expert-AI för avfallsrapporter. Analysera dokumentet noggrant.

              ANVÄND DESSA SYNONYMER FÖR ATT HITTA RÄTT KOLUMN:
              - Material: "BEAst-artikel", "Fraktion", "Avfallsslag", "Artikel", "Taxekod", "Restprodukt".
              - Adress: "Hämtadress", "Littera", "Arbetsplatsnamn", "Uppdragsställe", "Anläggningsadress".
              - Vikt: "Vikt (kg)", "Mängd", "Kvantitet", "Antal kg", "Vikt körtur".
              - Farligt Avfall: Leta efter texten "Farligt avfall", "FA" eller material som Asbest, Elektronik, Batterier, Kemikalier.
              
              INSTRUKTIONER:
              1. Hitta Metadata (Leverantör, Datum, Adress).
              2. Extrahera rader från SMAKPROVET. Returnera MAX 15 RADER i JSON. Försök inte returnera hela filen.
              3. Farligt avfall: Sätt "isHazardous": true om det är elektronik, kemikalier, asbest etc.
              4. Adress per rad: Om tabellen har kolumner som "Hämtställe", "Littera" eller "Projekt", extrahera dessa per rad.

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

    const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
    let rawData = extractJsonFromResponse(textContent);

    // MERGE: Använd de säkra totalerna från koden som FALLBACK
    if (isBigFile) {
        if (!rawData.weightKg?.value || rawData.weightKg.value === 0) {
            rawData.weightKg = { value: calculatedTotals.weight, confidence: 1.0 };
        }
        if (!rawData.cost?.value || rawData.cost.value === 0) {
            rawData.cost = { value: calculatedTotals.cost, confidence: 1.0 };
        }
        if (!rawData.totalCo2Saved?.value && calculatedTotals.co2 > 0) {
            rawData.totalCo2Saved = { value: calculatedTotals.co2, confidence: 1.0 };
        }
    }

    const validatedData = WasteRecordSchema.parse({
        ...rawData,
        lineItems: rawData.lineItems || []
    });

    await supabase.from("documents").update({
      status: "needs_review",
      extracted_data: validatedData
    }).eq("id", documentId);

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
  
  // Get edited document metadata from form
  const editedDate = formData.get("date") as string;
  const editedSupplier = formData.get("supplier") as string;
  const editedAddress = formData.get("address") as string;
  const editedReceiver = formData.get("receiver") as string;
  
  // Get lineItems from form
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
    
    if (material || weightKg > 0) {
      lineItems.push({
        material: { value: material || "", confidence: 1 },
        weightKg: { value: weightKg, confidence: 1 },
        address: address ? { value: address, confidence: 1 } : undefined,
        location: location ? { value: location, confidence: 1 } : undefined,
        receiver: receiver ? { value: receiver, confidence: 1 } : undefined,
        handling: handling ? { value: handling, confidence: 1 } : undefined,
        isHazardous: { value: isHazardous, confidence: 1 },
        co2Saved: co2Saved > 0 ? { value: co2Saved, confidence: 1 } : undefined,
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
    documentMetadata: {
      date: editedDate || existingData.documentMetadata?.date || "",
      supplier: editedSupplier || existingData.documentMetadata?.supplier || "",
      address: editedAddress || existingData.documentMetadata?.address || "",
      receiver: editedReceiver || existingData.documentMetadata?.receiver || "",
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
  
  // HITTA NÄSTA DOKUMENT ATT GRANSKA (Spara & Nästa) ⏭️
  const { data: nextDoc } = await supabase
    .from("documents")
    .select("id")
    .eq("status", "needs_review")
    .neq("id", id) // Inte det vi just sparade
    .limit(1)
    .single();

  if (nextDoc) {
    redirect(`/review/${nextDoc.id}`);
  } else {
    redirect("/collecct");
  }
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
  
  // Uppdatera alla dokument som INTE är arkiverade
  const { error } = await supabase
    .from("documents")
    .update({ archived: true })
    .eq("archived", false); // Påverkar bara den aktiva listan

  if (error) {
    console.error("Archive All Error:", error);
    throw new Error("Kunde inte arkivera allt.");
  }

  revalidatePath("/");
  revalidatePath("/archive");
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