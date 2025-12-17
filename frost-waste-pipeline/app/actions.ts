"use server";

import { createServiceRoleClient } from "../lib/supabase";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { WasteRecordSchema } from "@/lib/schemas";
import * as XLSX from "xlsx";
import { parseAnyDateToISO } from "@/lib/extraction/date";
import { assertRowLevelDates } from "@/lib/extraction/dateGuards"; 

const STORAGE_BUCKET = "raw_documents";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- 1. SMARTARE SÖKORD (Inkluderar Ragn-Sells & Sysav termer) ---
const ALIASES = {
  date: /datum|date|transaktionsdatum|faktureringsdatum/i,
  weight: /vikt|mängd|kvantitet|antal|netto|amount|weight/i,
  cost: /belopp|pris|cost|summa|totalt|sek|kr|à-pris/i,
  co2: /co2|klimat|utsläpp|besparing|emission/i,
  hazardous: /farligt|fa\b|asbest|lys|batteri|elavfall|elektronik/i,
  material: /material|fraktion|benämning|artikel|avfallsslag/i,
  address: /arbetsplats|hämtställe|ursprung|littera|projekt|adress|uppdragsställe/i, // "Uppdragsställe" är Ragn-Sells
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

// Hjälpfunktion för att mappa månadsnamn till index (Jan=0, Feb=1...)
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11
};

// --- 3. DEN NYA PARSERN FÖR KORS-TABELLER (PreZero) ---
function parseCrossTabExcel(sheet: XLSX.WorkSheet, year: number = 2024) {
  try {
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (json.length < 5) return null;

    // 1. HITTA RUBRIKRADEN (Letar efter "Jan", "Feb" etc)
    let headerRowIndex = -1;
    for (let i = 0; i < 20; i++) {
      if (!Array.isArray(json[i])) continue;
      const rowStr = json[i].map(c => String(c || "").toLowerCase()).join(" ");
      if (rowStr.includes("jan") && rowStr.includes("dec")) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) return null; // Inte en kors-tabell

    console.log(`📅 Hittade Kors-tabell (Månader) på rad: ${headerRowIndex + 1}`);
    
    const headers = json[headerRowIndex].map(h => String(h || "").toLowerCase().trim());
    
    // Hitta index för Adress, Avfall och Månader
    const idx = {
      address: headers.findIndex(h => h.includes("adress") || h.includes("hämtställe") || h.includes("uppdragsställe")),
      material: headers.findIndex(h => h.includes("avfall") || h.includes("fraktion") || h.includes("material")),
      months: [] as { idx: number, month: number }[]
    };

    // Mappa månadskolumner
    headers.forEach((h, i) => {
      const monthKey = h.substring(0, 3); // "jan", "feb"
      if (MONTH_MAP[monthKey] !== undefined) {
        idx.months.push({ idx: i, month: MONTH_MAP[monthKey] });
      }
    });

    if (idx.months.length === 0) return null;

    const lineItems: any[] = [];
    let currentAddress = "";
    let totalWeight = 0;

    // 2. LOOPA RADERNA
    for (let i = headerRowIndex + 1; i < json.length; i++) {
      if (!Array.isArray(json[i])) continue;
      const row = json[i];
      const rowStr = row.map(c => String(c || "")).join("").toLowerCase();

      // Skippa summeringsrader ("Total hämtadress...")
      if (rowStr.includes("total") || rowStr.includes("summa")) continue;

      // HÄMTA ADRESS (Stateful logic: Kom ihåg senaste adressen)
      const rawAddress = idx.address !== -1 && idx.address < row.length ? String(row[idx.address] || "").trim() : "";
      if (rawAddress && rawAddress.length > 3) {
        currentAddress = rawAddress;
        // Ofta står adressen på en egen rad, eller på samma rad som första materialet.
        // Om material-kolumnen är tom på denna rad, fortsätt till nästa.
        if (idx.material === -1 || idx.material >= row.length || !row[idx.material]) continue; 
      }

      // HÄMTA MATERIAL
      const material = idx.material !== -1 && idx.material < row.length ? String(row[idx.material] || "").trim() : "";
      if (!material || material.length < 2) continue; // Inget material = inget avfall

      // 3. SKAPA RADER FÖR VARJE MÅNAD SOM HAR VIKT
      idx.months.forEach(m => {
        if (m.idx >= row.length) return;
        const val = row[m.idx];
        const weight = parseSwedishNumber(val);

        if (weight > 0) {
          // Skapa datum: ÅÅÅÅ-MM-DD (Sista dagen i månaden)
          const lastDayOfMonth = new Date(year, m.month + 1, 0).getDate();
          const dateStr = `${year}-${String(m.month + 1).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
          
          totalWeight += weight;

          lineItems.push({
            date: { value: dateStr, confidence: 0.99 }, // Unikt datum per rad!
            material: { value: material, confidence: 0.99 },
            weightKg: { value: weight, confidence: 0.99 },
            address: { value: currentAddress, confidence: 0.99 }, // Använd minnes-adressen
            co2Saved: { value: 0, confidence: 0 },
            handling: { value: "", confidence: 0 },
            receiver: { value: "", confidence: 0 },
            isHazardous: { value: false, confidence: 0 }
          });
        }
      });
    }

    if (lineItems.length === 0) return null;

    return {
      weight: Number(totalWeight.toFixed(2)),
      cost: 0,
      co2: 0,
      lineItems
    };
  } catch (error) {
    console.error("❌ Error in parseCrossTabExcel:", error);
    return null;
  }
}

// --- 4. DEN NYA SUPER-MOTORN (Vanlig parser) ---
// Nu extraherar denna funktion även RADERNA, inte bara totalen.
function parseExcelData(sheet: XLSX.WorkSheet) {
  try {
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    if (!json || json.length < 2) return null;

    // 1. HITTA RUBRIKRADEN (Scanna 0-30 rader, aggressivare)
    let headerRowIndex = -1;
    let maxMatches = 0;

    for (let i = 0; i < Math.min(json.length, 30); i++) {
      if (!Array.isArray(json[i])) continue;
      const rowStr = json[i].map(c => String(c || "").toLowerCase()).join(" ");
      let matches = 0;
      if (ALIASES.weight.test(rowStr)) matches++;
      if (ALIASES.material.test(rowStr)) matches++;
      if (ALIASES.address.test(rowStr)) matches++;
      
      // Minst 2 träffar för att vara säker (för att undvika "Rapportinformation"-rader)
      if (matches > maxMatches && matches >= 2) {
        maxMatches = matches;
        headerRowIndex = i;
      }
    }

    if (headerRowIndex === -1) return null; // Hittade ingen tabell

    console.log(`📊 Hittade Excel-tabell på rad: ${headerRowIndex + 1}`);

    const headers = json[headerRowIndex].map(h => String(h || "").toLowerCase());

    // 2. MAPPA KOLUMNER (inkluderar Datum!)
    const idx = {
      date: headers.findIndex(h => h.match(ALIASES.date)),
      weight: headers.findIndex(h => h.match(ALIASES.weight)),
      cost: headers.findIndex(h => h.match(ALIASES.cost)),
      co2: headers.findIndex(h => h.match(ALIASES.co2)),
      material: headers.findIndex(h => h.match(ALIASES.material)),
      address: headers.findIndex(h => h.match(ALIASES.address)),
      receiver: headers.findIndex(h => h.match(ALIASES.receiver)),
      hazardous: headers.findIndex(h => h.match(/farligt/i)) // Specifik kolumn för farligt?
    };

    let totalWeight = 0;
    let totalCost = 0;
    let totalCo2 = 0;
    const lineItems: any[] = [];
    const rowDates: string[] = []; // För datum-validering

    // 3. LOOPA RADER
    for (let i = headerRowIndex + 1; i < json.length; i++) {
      const row = json[i];
      if (!Array.isArray(row)) continue;
      
      const rowStr = row.map(c => String(c || "")).join("").toLowerCase();
      // Skippa summeringsrader
      if (!rowStr || rowStr.includes("summa") || rowStr.includes("total")) continue;

      // Hämta värden
      const weight = idx.weight !== -1 && idx.weight < row.length ? parseSwedishNumber(row[idx.weight]) : 0;
      const cost = idx.cost !== -1 && idx.cost < row.length ? parseSwedishNumber(row[idx.cost]) : 0;
      const co2 = idx.co2 !== -1 && idx.co2 < row.length ? parseSwedishNumber(row[idx.co2]) : 0;
      
      const material = idx.material !== -1 && idx.material < row.length ? String(row[idx.material] || "").trim() : "Okänt";
      const address = idx.address !== -1 && idx.address < row.length ? String(row[idx.address] || "").trim() : "";
      const receiver = idx.receiver !== -1 && idx.receiver < row.length ? String(row[idx.receiver] || "").trim() : "";
      
      // ✅ LÄS DATUM PER RAD (från Datum-kolumnen, INTE från metadata)
      let rowDate: string | null = null;
      if (idx.date !== -1 && idx.date < row.length) {
        const dateValue = row[idx.date];
        if (dateValue != null) {
          rowDate = parseAnyDateToISO(dateValue);
          if (rowDate) {
            rowDates.push(rowDate);
          }
        }
      }
      
      // Checka farligt avfall
      let isHaz = false;
      if (idx.hazardous !== -1 && idx.hazardous < row.length) {
        const val = String(row[idx.hazardous] || "").toLowerCase();
        if (val === "ja" || val === "yes" || val === "true" || val === "1") isHaz = true;
      }
      // Fallback: Kolla materialnamnet
      if (!isHaz && material.match(ALIASES.hazardous)) isHaz = true;

      if (weight > 0 || cost > 0 || material !== "Okänt") { // Spara bara relevanta rader
        totalWeight += weight;
        totalCost += cost;
        totalCo2 += co2;

        lineItems.push({
          material: { value: material, confidence: 0.99 },
          weightKg: { value: weight, confidence: 0.99 },
          co2Saved: { value: co2, confidence: 0.99 },
          address: { value: address, confidence: 0.99 },
          receiver: { value: receiver, confidence: 0.99 },
          isHazardous: { value: isHaz, confidence: 0.99 },
          handling: { value: "", confidence: 0 },
          percentage: { value: "", confidence: 0 },
          date: rowDate ? { value: rowDate, confidence: 0.99 } : undefined // ✅ Datum per rad
        });
      }
    }

    // ✅ HARD GUARD: Validera att datum inte är konstanta eller samma som extracted_at
    if (rowDates.length > 0) {
      try {
        const extractedAtISO = new Date().toISOString();
        assertRowLevelDates(rowDates, {
          filename: undefined, // Vi har inte filnamnet här direkt, men det är okej
          extractedAtISO,
          totalRows: lineItems.length
        });
        console.log(`✅ Datum-validering OK: ${new Set(rowDates).size} unika datum av ${rowDates.length} rader`);
      } catch (guardError: any) {
        console.error("❌ Date guard failed:", guardError.message);
        // Vi failar här för att säkerställa att datum är korrekta
        throw new Error(`Datum-validering misslyckades: ${guardError.message}`);
      }
    }

    return {
      weight: Number(totalWeight.toFixed(2)),
      cost: Number(totalCost.toFixed(2)),
      co2: Number(totalCo2.toFixed(2)),
      lineItems
    };
  } catch (error) {
    console.error("❌ Error in parseExcelData:", error);
    return null;
  }
}

// BEHÅLL för bakåtkompatibilitet (används i reVerifyDocument)
function calculateBigDataTotals(sheet: XLSX.WorkSheet) {
  const parsed = parseExcelData(sheet);
  if (!parsed) return { weight: 0, cost: 0, co2: 0, hazardousCount: 0 };
  return {
    weight: parsed.weight,
    cost: parsed.cost,
    co2: parsed.co2,
    hazardousCount: parsed.lineItems.filter((item: any) => item.isHazardous?.value).length
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
    // Returnera tomt objekt för metadata-requests, annars fallback
    return {};
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
 * NY PROCESS-LOGIK: KOD FÖRST, AI SEN (Med komplett prompt för både Metadata & Rader)
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
    let codeData: any = null;

    // --- 1. KÖR KOD-EXTRAKTION (Excel) ---
    if (doc.filename.endsWith(".xlsx")) {
      try {
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, cellNF: false, cellText: false });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error("Excel-filen har inga ark");
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          throw new Error(`Kunde inte läsa ark: ${sheetName}`);
        }

        // Försök 1: Prezero (Kors-tabell)
        const yearMatch = doc.filename.match(/(20\d{2})/);
        const year = yearMatch ? Number(yearMatch[1]) : 2024;
        codeData = parseCrossTabExcel(sheet, year);
        
        // Försök 2: Standard (Sysav/Ragn-Sells)
        if (!codeData || codeData.lineItems.length === 0) {
          codeData = parseExcelData(sheet);
        }

        // Skapa preview för AI
        const jsonPreview = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        const csvPreview = jsonPreview.slice(0, 20).map(row => {
          if (!Array.isArray(row)) return "";
          return row.map(cell => {
            const val = cell == null ? "" : String(cell);
            if (val.includes(",") || val.includes('"') || val.includes("\n")) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(",");
        }).join("\n");
        
        claudeContent.push({ 
          type: "text", 
          text: `Excel-preview (för metadata):\n${csvPreview}`
        });
      } catch (excelError: any) {
        console.error("❌ Excel-läsningsfel:", excelError);
        throw new Error(`Kunde inte läsa Excel-filen: ${excelError.message || "Okänt fel"}`);
      }
    } else {
      // PDF-HANTERING
      const base64Pdf = Buffer.from(arrayBuffer).toString("base64");
      claudeContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
      });
    }

    // --- 2. KÖR AI (Med KORREKT Prompt för både Metadata & Rader) ---
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096, // Ökat för att få plats med långa tabeller
      messages: [
        {
          role: "user",
          content: [
            ...claudeContent as any,
            {
              type: "text",
              text: `Du är en expert på avfallsdata (BEAst standard). Analysera dokumentet.
              Filnamn: "${doc.filename}"
              
              UPPGIFT 1: METADATA
              - Datum: Hitta fakturadatum eller periodens slutdatum.
              - Leverantör: Leta i logotyp/text. OM det inte framgår tydligt, använd filnamnet "${doc.filename}" (rensa bort datum/.pdf).
              - Adress: Hitta projektadressen/hämtstället.
              
              UPPGIFT 2: RADER (Line Items)
              - Extrahera tabellen med avfallsfraktioner.
              - Material: T.ex. "Trä", "Blandat", "Gips".
              - Vikt: Måste vara i KG. Om ton, multiplicera med 1000.
              - CO2: Leta efter "Besparing", "Utsläpp", "Klimatnytta". (Viktigt för Returab-rapporter).
              - Farligt Avfall: Markera 'true' om det är elavfall, kemikalier, asbest etc.
              
              JSON OUTPUT (Exakt format):
              {
                "date": { "value": "YYYY-MM-DD", "confidence": Number },
                "supplier": { "value": "String", "confidence": Number },
                "address": { "value": "String", "confidence": Number },
                "receiver": { "value": "String", "confidence": Number },
                "lineItems": [
                  {
                    "material": { "value": "String", "confidence": Number },
                    "weightKg": { "value": Number, "confidence": Number },
                    "cost": { "value": Number, "confidence": Number },
                    "co2Saved": { "value": Number, "confidence": Number },
                    "isHazardous": { "value": Boolean, "confidence": Number }
                  }
                ]
              }
              Returnera ENDAST JSON.`,
            },
          ],
        },
      ],
    });

    const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
    const aiData = extractJsonFromResponse(textContent);

    // --- 3. MERGE (KOD VINNER ÖVER AI FÖR EXCEL) ---
    let finalData: any = {
        ...aiData,
        lineItems: aiData.lineItems || []
    };

    // Om Code Engine hittade rader (bara Excel), använd dem istället för AI:ns gissningar
    if (codeData && codeData.lineItems.length > 0) {
        finalData.lineItems = codeData.lineItems;
        finalData.weightKg = { value: codeData.weight, confidence: 1.0 };
        finalData.cost = { value: codeData.cost, confidence: 1.0 };
        finalData.totalCo2Saved = { value: codeData.co2, confidence: 1.0 };
        
        // ✅ ANVÄND DATUM FRÅN FÖRSTA RADEN (om det finns), INTE från metadata
        const firstRowWithDate = codeData.lineItems.find((item: any) => item.date?.value);
        if (firstRowWithDate?.date?.value) {
          finalData.date = firstRowWithDate.date;
        }
        
        // Sätt huvudmaterial från första raden om det saknas
        if (!finalData.material?.value && codeData.lineItems.length > 0) {
          const firstMaterial = codeData.lineItems[0].material?.value || "Blandat";
          finalData.material = { value: firstMaterial, confidence: 0.8 };
        }
        // Behåll AI:ns metadata (Supplier/Date) om koden inte hittade bättre
    }

    // --- 4. FALLBACK FÖR LEVERANTÖR ---
    if (!finalData.supplier?.value || finalData.supplier.value.toLowerCase().includes("okänd")) {
        let rawName = doc.filename.replace(/\.[^/.]+$/, ""); 
        rawName = rawName.replace(/_/g, " ").replace(/-/g, " ");
        rawName = rawName.replace(/rapport|statistik|avfall|2024|2025/gi, "").trim();
        if (rawName.length > 0) {
          finalData.supplier = { value: rawName, confidence: 0.6 };
        }
    }

    // Säkerställ att alla obligatoriska fält finns
    if (!finalData.date?.value) {
      finalData.date = { value: doc.created_at.split("T")[0], confidence: 0 };
    }
    if (!finalData.material?.value) {
      finalData.material = { value: "Blandat", confidence: 0 };
    }
    if (!finalData.supplier?.value) {
      finalData.supplier = { value: "Okänd leverantör", confidence: 0 };
    }

    const validatedData = WasteRecordSchema.parse(finalData);

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
      let csvPreview = ""; // Deklarera utanför try-blocket
      try {
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, cellNF: false, cellText: false });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error("Excel-filen har inga ark");
        }
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          throw new Error(`Kunde inte läsa ark: ${sheetName}`);
        }

        console.log("🧮 Räknar totaler via kod (re-verify)...");
        calculatedTotals = calculateBigDataTotals(sheet);
        console.log("✅ Kod-Totaler:", calculatedTotals);

        const jsonPreview = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        // Säker CSV-generering: hantera null/undefined och kommatecken i data
        csvPreview = jsonPreview.slice(0, 25).map(row => {
          if (!Array.isArray(row)) return "";
          return row.map(cell => {
            const val = cell == null ? "" : String(cell);
            // Om värdet innehåller kommatecken eller citattecken, lägg citattecken runt
            if (val.includes(",") || val.includes('"') || val.includes("\n")) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(",");
        }).join("\n");
        
        isBigFile = true;
      } catch (excelError: any) {
        console.error("❌ Excel-läsningsfel:", excelError);
        throw new Error(`Kunde inte läsa Excel-filen: ${excelError.message || "Okänt fel"}`);
      }

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

  // 3. HITTA NÄSTA DOKUMENT ATT GRANSKA (Spara & Nästa) ⏭️
  // Kör query parallellt med revalidation för snabbare svar
  const [, nextDocsResult] = await Promise.all([
    Promise.all([
      revalidatePath("/"),
      revalidatePath(`/review/${id}`)
    ]),
    supabase
      .from("documents")
      .select("id")
      .eq("status", "needs_review")
      .eq("archived", false)
      .neq("id", id)
      .order("created_at", { ascending: true })
      .limit(1)
  ]);

  const { data: nextDocs } = nextDocsResult;

  if (nextDocs && nextDocs.length > 0) {
    redirect(`/review/${nextDocs[0].id}`);
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
 * Sätter status = "verified" på alla dokument som behöver granskas
 */
export async function verifyAllDocuments() {
  const supabase = createServiceRoleClient();
  
  // Uppdatera alla dokument som behöver granskas eller är i processing
  const { error } = await supabase
    .from("documents")
    .update({ status: "verified" })
    .in("status", ["needs_review", "processing", "uploaded", "queued"]);

  if (error) {
    console.error("Verify All Error:", error);
    throw new Error("Kunde inte godkänna allt.");
  }

  revalidatePath("/");
  revalidatePath("/review/[id]", "page");
}