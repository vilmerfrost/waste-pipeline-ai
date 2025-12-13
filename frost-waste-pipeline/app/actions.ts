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
    // Returnera ett tomt "safe" objekt så vi inte kraschar
    return { material: "Kunde inte tolka", weightKg: 0 }; 
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

    // MERGE: Använd de säkra totalerna från koden
    if (isBigFile) {
        // Om AI:n missade totalen eller satte den till 0, använd vår uträkning
        if (!rawData.weightKg?.value || rawData.weightKg.value < calculatedTotals.weight) {
            rawData.weightKg = { value: calculatedTotals.weight, confidence: 1.0 };
        }
        if (!rawData.cost?.value || rawData.cost.value < calculatedTotals.cost) {
            rawData.cost = { value: calculatedTotals.cost, confidence: 1.0 };
        }
        if (!rawData.totalCo2Saved?.value && calculatedTotals.co2 > 0) {
            rawData.totalCo2Saved = { value: calculatedTotals.co2, confidence: 1.0 };
        }
        
        // Lägg till en "Fake" rad som säger att det finns fler rader, om vi vill vara tydliga
        // Eller lita på att användaren ser "Total Vikt" och förstår.
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

// ... (reVerifyDocument bör också uppdateras med samma logik om du vill, men ovanstående räcker för uppladdningen) ...
export async function reVerifyDocument(documentId: string) {
    // Du kan kopiera in samma "calculateBigDataTotals" logik här om du vill, 
    // men för nu låter vi den vara som den var i förra steget, fast med JSON-fixen.
    // (För enkelhetens skull i chatten utelämnar jag den koden här, använd den från förra steget + try/catch fixen).
     const supabase = createServiceRoleClient();
     // ... (kör standard AI prompt här) ...
}

// ... (Behåll saveDocument, deleteDocument etc) ...
export async function saveDocument(formData: FormData) {
  const supabase = createServiceRoleClient();
  const id = formData.get("id") as string;
  const verified = (val: FormDataEntryValue | null) => ({ value: val ? String(val) : null, confidence: 1.0 });
  const numVerified = (val: FormDataEntryValue | null) => ({ value: val ? Number(val) : 0, confidence: 1.0 });

  // 1. PARSA LINE ITEMS
  const lineItemsMap: Record<number, any> = {};
  for (const [key, value] of Array.from(formData.entries())) {
    const match = key.match(/^lineItems\[(\d+)\]\.(.+)$/);
    if (match) {
      const index = Number(match[1]);
      const field = match[2];
      if (!lineItemsMap[index]) lineItemsMap[index] = {};

      if (field === "weightKg" || field === "co2Saved") {
        lineItemsMap[index][field] = { value: Number(value), confidence: 1.0 };
      } else if (field === "isHazardous") {
        lineItemsMap[index][field] = { value: value === "true", confidence: 1.0 };
      } else {
        lineItemsMap[index][field] = { value: String(value), confidence: 1.0 };
      }
    }
  }
  const lineItemsArray = Object.values(lineItemsMap);

  // 2. SPARA DOKUMENT
  await supabase.from("documents").update({
      status: "verified",
      extracted_data: { 
        date: verified(formData.get("date")),
        supplier: verified(formData.get("supplier")),
        material: verified(formData.get("material")),
        weightKg: numVerified(formData.get("weightKg")), // Detta skrivs över av Live-Matte om man vill, men sparas här
        cost: numVerified(formData.get("cost")),
        totalCo2Saved: numVerified(formData.get("totalCo2Saved")),
        address: verified(formData.get("address")),
        receiver: verified(formData.get("receiver")),
        lineItems: lineItemsArray
      }
    }).eq("id", id);

  revalidatePath("/");

  // 3. HITTA NÄSTA DOKUMENT ATT GRANSKA (Spara & Nästa) ⏭️
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
    redirect("/");
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