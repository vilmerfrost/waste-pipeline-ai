// VIKTIGT: Tvinga sidan att alltid hämta färsk data
export const dynamic = "force-dynamic";

import { StatsCards } from "@/components/stats-cards";
import { DashboardCharts } from "@/components/dashboard-charts";
import { ExportActions } from "@/components/export-actions";
import { SearchBar } from "@/components/search-bar";
import { createServiceRoleClient } from "@/lib/supabase"; 
import { UploadZone } from "@/components/upload-zone";
import { FileText, ArrowRight, Archive as ArchiveIcon } from "lucide-react";
import { revalidatePath } from "next/cache";
import Link from "next/link"; 
import { FileActions } from "@/components/file-actions";

const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "dev@bypass.se"
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    uploaded: "bg-slate-50 text-slate-500 border border-slate-200",
    queued: "bg-blue-50 text-blue-600 border border-blue-100",
    processing: "bg-purple-50 text-purple-600 border border-purple-100 animate-pulse",
    needs_review: "bg-amber-50 text-amber-700 border border-amber-100", 
    verified: "bg-green-50 text-green-700 border border-green-100",
    approved: "bg-green-50 text-green-700 border border-green-100",
    error: "bg-red-50 text-red-600 border border-red-100",
  };
  const labels: Record<string, string> = {
    uploaded: "Uppladdad",
    queued: "I kö",
    processing: "Analyserar...",
    needs_review: "Granska",
    verified: "Klar",
    approved: "Godkänd",
    error: "Fel",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide ${styles[status] || styles.uploaded}`}>
      {labels[status] || status}
    </span>
  );
}

// HJÄLPFUNKTION: Hanterar både gamla (strängar) och nya (objekt) format
const getValue = (field: any) => {
  if (!field) return null;
  if (typeof field === "object" && "value" in field) return field.value;
  return field;
};

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const supabase = createServiceRoleClient();
  const { q } = await searchParams;

  let query = supabase
    .from("documents")
    .select("*")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (q) {
    // Vi söker på .value i JSON-strukturen nu
    query = query.or(`filename.ilike.%${q}%,extracted_data->material->>value.ilike.%${q}%`);
  }

  const { data: documents } = await query;

  return (
    <main className="min-h-screen bg-white text-slate-900 selection:bg-slate-100">
      <div className="max-w-4xl mx-auto pt-20 pb-12 px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 text-[11px] font-medium text-slate-500 mb-6 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          System Online
        </div>
        
        <h1 className="font-serif text-5xl md:text-6xl text-slate-900 mb-6 tracking-tight leading-[1.1]">
          Analysera fakturor <br />
          <span className="italic text-slate-400">med AI</span>
        </h1>
        
        <p className="text-slate-500 text-lg mb-8 max-w-lg mx-auto font-light">
          Ladda upp dina vågsedlar och fakturor. Vi extraherar material, vikt och kostnad automatiskt.
        </p>

        <div className="flex justify-center items-center gap-3 mb-12">
           <Link href="/settings" className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
             Inställningar
           </Link>
           <span className="text-slate-300">|</span> 
           <Link href="/archive" className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
             Arkiv
           </Link>
           <span className="text-slate-300">|</span>
           <Link href="/collecct" className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
             Collecct Review
           </Link>
           
           {/* HÄR ÄR DEN NYA EXPORT-KOMPONENTEN */}
           <ExportActions documents={documents || []} />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pb-20">
        
        {/* STATS CARDS */}
        <div className="mb-12">
            <StatsCards documents={documents || []} />
        </div>

        {/* NYA GRAFERNA */}
        <DashboardCharts documents={documents || []} />

        <div className="mb-16">
          <UploadZone />
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-end border-b border-slate-100 pb-4">
             <h2 className="font-serif text-2xl text-slate-800">Senaste filer</h2>
             <div className="w-64">
               <SearchBar />
             </div>
          </div>

          <div className="overflow-hidden bg-white">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="text-slate-400 font-medium text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-4 pr-4 font-normal">Dokument</th>
                  <th className="py-4 px-4 font-normal">Datum</th>
                  <th className="py-4 px-4 font-normal">Status</th>
                  <th className="py-4 pl-4 text-right font-normal">Hantera</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {documents?.map((doc) => {
                  // Hämta värden säkert med nya formatet
                  const material = getValue(doc.extracted_data?.material);
                  const date = getValue(doc.extracted_data?.date);
                  
                  return (
                    <tr key={doc.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 transition-colors">
                              <FileText className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{doc.filename}</p>
                            {material && (
                              <p className="text-xs text-slate-400 mt-0.5">{material}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-slate-500">
                        {date || new Date(doc.created_at).toLocaleDateString("sv-SE")}
                      </td>
                      <td className="py-4 px-4"><StatusBadge status={doc.status} /></td>
                      
                      <td className="py-4 pl-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {doc.status === "needs_review" && (
                              <Link 
                              href={`/review/${doc.id}`}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline px-2 py-1"
                              >
                              Granska
                              </Link>
                          )}
                          <FileActions doc={doc} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!documents || documents.length === 0) && (
                   <tr>
                     <td colSpan={4} className="py-12 text-center text-slate-400 font-light italic">
                        Inga dokument hittades. Ladda upp en fil för att starta.
                     </td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
