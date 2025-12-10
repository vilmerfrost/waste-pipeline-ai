"use server";

import { createServiceRoleClient } from "../lib/supabase";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { WasteRecordSchema } from "@/lib/schemas";

const STORAGE_BUCKET = "raw_documents";

// Initiera Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * LADDAR UPP OCH KÖR AI DIREKT
 */
export async function uploadAndEnqueueDocument(formData: FormData) {
  const supabase = createServiceRoleClient();
  const user = { id: "00000000-0000-0000-0000-000000000000" }; 

  const file = formData.get("file") as File;

  if (!file || file.size === 0) throw new Error("Ingen fil uppladdad.");

  // 1. Ladda upp
  const fileExtension = file.name.split(".").pop();
  const storagePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (uploadError) throw new Error("Kunde inte ladda upp filen.");
  
  // 2. Spara i DB
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      status: "uploaded",
    })
    .select()
    .single();

  if (documentError) throw new Error("Kunde inte spara i databasen.");

  // 3. AUTOMATION
  try {
    await processDocument(document.id);
  } catch (error) {
    console.error("Auto-Process Error:", error);
  }

  revalidatePath("/");
  return { message: "Uppladdat!", documentId: document.id };
}

/**
 * DEN NYA SMARTA AI-FUNKTIONEN
 */
async function processDocument(documentId: string) {
  const supabase = createServiceRoleClient();
  console.log(`🚀 Auto-startar AI för dokument: ${documentId}`);

  // Hämta info
  const { data: doc } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (!doc) throw new Error("Dokument hittades inte");

  await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);

  try {
    // Ladda ner fil
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("raw_documents")
      .download(doc.storage_path);

    if (downloadError) throw new Error("Kunde inte ladda ner fil");

    const arrayBuffer = await fileData.arrayBuffer();
    const base64Pdf = Buffer.from(arrayBuffer).toString("base64");

    // --- HÄR ÄR MAGIN: DEN NYA PROMPTEN ---
    const message = await anthropic.messages.create({
      // Vi använder den stabila 3.5 Sonnet (den är bäst på att följa instruktioner just nu)
      model: "claude-sonnet-4-5-20250929", 
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
            },
            {
              type: "text",
              text: `Du är en expert-AI för dokumentanalys (Fakturor & Vågsedlar).
              
              Din uppgift är att extrahera data med HÖGSTA MÖJLIGA PRECISION.
              
              STEG 1: ANALYSERA DOKUMENTTYP
              - Är det en FAKTURA? (Innehåller belopp, moms, "Att betala").
              - Är det en VÅGSEDEL? (Innehåller vikt, material, "Ton", "Kg").

              STEG 2: EXTRAHERA DATA (Regler för Confidence)
              - Om du ser texten klart och tydligt i dokumentet -> Sätt confidence: 1.0
              - Om du räknar ut det själv eller gissar -> Sätt confidence: 0.5
              - Om det saknas -> Sätt confidence: 0

              FÄLT ATT HITTA:
              1. **date**: Leta efter "Fakturadatum", "Datum", "Leveransdatum". (Format YYYY-MM-DD).
              2. **supplier**: Vem skickade fakturan? (Högst upp, stor text logotyp).
              3. **cost**: TOTALBELOPP att betala (inkl moms). Leta efter "Att betala", "Summa", "Totalt".
              4. **weightKg**: Endast relevant för avfall. Om det är en tjänstefaktura (elektriker, snickare), sätt 0.
              5. **material**: 
                 - För vågsedlar: "Gips", "Trä". 
                 - För tjänstefakturor: Beskriv jobbet kort, t.ex. "Elinstallation" eller "Arbetskostnad".

              Exempel på Confidence:
              - Dokumentet säger "Datum: 2025-02-03". -> Confidence: 1.0 (För det står exakt så).
              - Dokumentet säger "Att betala: 14 195 kr". -> Confidence: 1.0.

              JSON OUTPUT (Exakt denna struktur):
              {
                "date": { "value": "YYYY-MM-DD", "confidence": Number },
                "supplier": { "value": "String", "confidence": Number },
                "material": { "value": "String", "confidence": Number },
                "weightKg": { "value": Number, "confidence": Number },
                "cost": { "value": Number, "confidence": Number },
                "address": { "value": "String", "confidence": Number },
                "receiver": { "value": "String", "confidence": Number }
              }

              Returnera ENDAST ren JSON.`,
            },
          ],
        },
      ],
    });

    const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
    const jsonString = textContent.replace(/```json/g, "").replace(/```/g, "").trim();
    
    console.log("🔍 AI Svar:", jsonString); // Debugga vad den ser

    const rawData = JSON.parse(jsonString);
    const validatedData = WasteRecordSchema.parse(rawData);

    await supabase.from("documents").update({
      status: "needs_review",
      extracted_data: validatedData
    }).eq("id", documentId);

  } catch (error: any) {
    console.error("❌ AI Fail:", error);
    await supabase.from("documents").update({ status: "error" }).eq("id", documentId);
    throw error;
  }
}

/**
 * SPARA GRANSKNING
 */
export async function saveDocument(formData: FormData) {
  const supabase = createServiceRoleClient();
  const id = formData.get("id") as string;
  
  // Helper för att spara verifierat data (Confidence = 1.0)
  const verified = (val: FormDataEntryValue | null) => ({
    value: val ? String(val) : null,
    confidence: 1.0 
  });

  // Vikt & Kostnad måste vara nummer
  const numVerified = (val: FormDataEntryValue | null) => ({
    value: val ? Number(val) : 0,
    confidence: 1.0
  });

  await supabase
    .from("documents")
    .update({
      status: "verified",
      extracted_data: { 
        date: verified(formData.get("date")),
        supplier: verified(formData.get("supplier")), // <-- NYTT
        material: verified(formData.get("material")),
        weightKg: numVerified(formData.get("weightKg")),
        cost: numVerified(formData.get("cost")),      // <-- NYTT
        address: verified(formData.get("address")),
        receiver: verified(formData.get("receiver")),
      }
    })
    .eq("id", id);

  revalidatePath("/");
  redirect("/");
}

// ... (Behåll deleteDocument, toggleArchive, addMaterial, deleteMaterial som de var)
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