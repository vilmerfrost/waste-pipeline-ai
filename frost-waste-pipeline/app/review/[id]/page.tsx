import { createServiceRoleClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { saveDocument } from "@/app/actions";
import { WasteRecord, WasteRecordSchema } from "@/lib/schemas";
import { SmartInput } from "@/components/smart-input"; // <-- Vår nya komponent

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = createServiceRoleClient();
  const { id } = await params;

  const { data: doc } = await supabase.from("documents").select("*").eq("id", id).single();
  if (!doc) notFound();

  // Hämta material för dropdown (om du vill använda den i framtiden)
  const { data: materials } = await supabase.from("materials").select("name").order("name");

  const { data } = await supabase.storage.from("raw_documents").createSignedUrl(doc.storage_path, 3600);
  const signedUrl = data?.signedUrl;
  
  // Tolka datan med vårt nya smarta schema för att få fram confidence-värden
  let extracted: WasteRecord;
  try {
    extracted = WasteRecordSchema.parse(doc.extracted_data || {});
  } catch (e) {
    // Fallback om datan är helt korrupt
    console.error("Schema parse error (using fallback):", e);
    extracted = WasteRecordSchema.parse({});
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* --- HEADER (Minimalistisk) --- */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <h1 className="font-medium text-slate-700 text-sm">{doc.filename}</h1>
          </div>
        </div>
        <div>
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider
            ${doc.status === 'needs_review' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-100'}`}>
            {doc.status === 'needs_review' ? 'Kräver granskning' : doc.status}
          </span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-57px)]">
        
        {/* --- VÄNSTER: PDF VIEWER (Sticky) --- */}
        <div className="lg:w-[50%] xl:w-[55%] bg-slate-100 border-r border-slate-200 lg:sticky lg:top-[57px] h-[50vh] lg:h-full">
          {signedUrl ? (
            <iframe src={signedUrl} className="w-full h-full" title="PDF Viewer" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 font-light">Kunde inte ladda PDF</div>
          )}
        </div>

        {/* --- HÖGER: SMART FORMULÄR (Centrerat, Luftigt) --- */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-2xl mx-auto px-8 py-12">
            
            <div className="mb-10 text-center">
              <h2 className="font-serif text-3xl text-slate-900 mb-2">Granska & Godkänn</h2>
              <p className="text-slate-500 font-light">
                AI:n har analyserat dokumentet. Kontrollera fälten med låg säkerhet extra noga.
              </p>
            </div>

            <form action={saveDocument} className="space-y-8">
              <input type="hidden" name="id" value={doc.id} />

              {/* SEKTION 1: GRUNDDATA */}
              <section className="space-y-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-50 pb-2">
                  Grundläggande Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <SmartInput label="Datum" name="date" type="date" fieldData={extracted.date} />
                   {/* NYTT FÄLT */}
                   <SmartInput label="Leverantör" name="supplier" type="text" fieldData={extracted.supplier} placeholder="T.ex. ElTeknik" />
                </div>
              </section>

               {/* SEKTION 2: MÄNGD & KOSTNAD */}
               <section className="space-y-6 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-50 pb-2">
                  Mängd & Ekonomi
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* MATERIAL */}
                   <div>
                    <SmartInput 
                        label="Material"
                        name="material"
                        type="text"
                        list="material-options"
                        fieldData={extracted.material}
                      />
                      <datalist id="material-options">
                        {materials?.map((m) => <option key={m.name} value={m.name} />)}
                      </datalist>
                   </div>

                   {/* NYTT FÄLT: KOSTNAD */}
                   <div className="relative">
                     <SmartInput 
                        label="Kostnad (SEK)" 
                        name="cost" 
                        type="number" 
                        fieldData={extracted.cost} 
                        className="font-mono"
                     />
                     <span className="absolute right-4 top-[38px] text-slate-400 text-sm">kr</span>
                   </div>

                   {/* VIKT */}
                   <div className="md:col-span-2">
                      <SmartInput 
                        label="Total Vikt (kg)"
                        name="weightKg"
                        type="number"
                        fieldData={extracted.weightKg}
                        description="Lämna som 0 om detta är en ren tjänstefaktura."
                       />
                   </div>
                </div>
              </section>

              {/* SEKTION 3: PLATS */}
              <section className="space-y-6 pt-4">
                 <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-50 pb-2">
                  Plats & Mottagare
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <SmartInput label="Hämtadress / Projekt" name="address" type="text" fieldData={extracted.address} />
                   <SmartInput label="Mottagande anläggning" name="receiver" type="text" fieldData={extracted.receiver} />
                </div>
              </section>

              {/* FOOTER / KNAPP */}
              <div className="pt-8 mt-8 border-t border-slate-100 sticky bottom-0 bg-white/95 backdrop-blur-sm pb-6 z-10">
                <div className="flex items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <p className="font-medium text-slate-900">Är all data korrekt?</p>
                    <p className="text-sm text-slate-500 font-light">Detta låser dokumentet för statistik.</p>
                  </div>
                  <button 
                    type="submit"
                    className="px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 shadow-sm flex items-center gap-2 transition-transform active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    Godkänn & Spara
                  </button>
                </div>
              </div>

            </form>
            
            {/* DEBUG - Bra att ha under utveckling */}
             <details className="mt-12 text-xs text-slate-300">
                <summary className="cursor-pointer hover:text-slate-500 transition">Visa rådata (Debug)</summary>
                <pre className="mt-4 p-4 bg-slate-50 rounded-lg overflow-x-auto">
                  {JSON.stringify(extracted, null, 2)}
                </pre>
             </details>

          </div>
        </div>
      </div>
    </div>
  );
}
