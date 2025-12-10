import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { WasteRecordSchema } from "@/lib/schemas";

// Initiera Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function GET() {
  const supabase = createServiceRoleClient();

  // 1. Hämta nästa jobb från kön (SKIP LOCKED gör att vi inte krockar om vi har flera workers)
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .select("*, documents(*)") // Hämta dokumentinfon också
    .eq("status", "queued")
    .limit(1)
    .maybeSingle();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ message: "Inga jobb i kön just nu." });

  // 2. Lås jobbet
  await supabase.from("processing_jobs").update({ status: "processing" }).eq("id", job.id);

  try {
    const doc = job.documents;
    console.log(`🚀 Startar analys av: ${doc.filename}`);

    // 3. Ladda ner PDF från Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("raw_documents")
      .download(doc.storage_path);

    if (downloadError) throw new Error("Kunde inte ladda ner filen från Storage");

    // Konvertera till Base64 för Claude
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Pdf = Buffer.from(arrayBuffer).toString("base64");

    // 4. SKICKA TILL CLAUDE 3.5 SONNET
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: `Du är en data-extractor för avfallsbranschen. Din uppgift är att konvertera detta dokument till JSON.
              
              Dokumentet kan vara en Vågssedel eller en Faktura.
              Du MÅSTE returnera data i exakt denna platta JSON-struktur (inga nästlade objekt):

              {
                "date": "YYYY-MM-DD", (Försök hitta leveransdatum eller fakturadatum)
                "material": "String", (T.ex. 'Gips', 'Trä', 'Blandat'. Om det är 'Arbete', skriv 'Arbete')
                "weightKg": Number, (Omvandla ALLT till kg. 1.5 ton = 1500. Om ingen vikt finns, sätt 0)
                "address": "String", (Hämtadress eller projektadress)
                "receiver": "String" (Vem tog emot avfallet? Eller kundens namn)
              }

              Om ett fält saknas i dokumentet, lämna det tomt ("") eller 0.
              Returnera ENDAST ren JSON.`,
            },
          ],
        },
      ],
    });

    // 5. Hantera svaret
    // Claude returnerar textblock, vi måste hitta JSON-delen
    const textContent = message.content[0].type === 'text' ? message.content[0].text : "";
    
    // Städa svaret (ibland lägger Claude till ```json ... ```)
    const jsonString = textContent.replace(/```json/g, "").replace(/```/g, "").trim();
    const rawData = JSON.parse(jsonString);

    // NY RAD: Logga vad AI faktiskt såg, så vi kan se det i terminalen
    console.log("🔍 RÅDATA FRÅN AI:", JSON.stringify(rawData, null, 2)); 

    // 6. VALIDERA
    const validatedData = WasteRecordSchema.parse(rawData);
    console.log("✅ AI Lyckades:", validatedData);

    // 7. Spara resultatet & uppdatera status
    await supabase.from("documents").update({
      status: "needs_review", // Nu ska människan titta på det
      extracted_data: validatedData // Spara AI:ns tolkning
    }).eq("id", doc.id);

    await supabase.from("processing_jobs").update({ status: "succeeded" }).eq("id", job.id);

    return NextResponse.json({ 
      success: true, 
      file: doc.filename, 
      data: validatedData 
    });

  } catch (error: any) {
    console.error("❌ AI Error:", error);
    
    // Logga felet i databasen
    await supabase.from("processing_jobs").update({ 
      status: "failed", 
      last_error: error.message 
    }).eq("id", job.id);
    
    await supabase.from("documents").update({ status: "error" }).eq("id", job.documents.id);

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}