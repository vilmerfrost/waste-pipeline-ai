import { createServiceRoleClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { ReverifyButton } from "@/components/reverify-button";
import { ExcelViewer } from "@/components/excel-viewer";
import { ReviewForm } from "@/components/review-form";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = createServiceRoleClient();
  const { id } = await params;

  const { data: doc } = await supabase.from("documents").select("*").eq("id", id).single();
  if (!doc) notFound();

  const { data } = await supabase.storage.from("raw_documents").createSignedUrl(doc.storage_path, 3600);
  const signedUrl = data?.signedUrl;

  // Kolla om filen är Excel
  const isExcel = doc.filename.toLowerCase().endsWith(".xlsx");

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
        
        {/* --- VÄNSTER: DOKUMENT VISARE --- */}
        <div className="lg:w-[50%] xl:w-[55%] bg-slate-100 border-r border-slate-200 lg:sticky lg:top-[57px] h-[50vh] lg:h-full overflow-hidden">
          {signedUrl ? (
            isExcel ? (
              // --- VISA EXCEL ---
              <ExcelViewer url={signedUrl} />
            ) : (
              // --- VISA PDF (Som förut) ---
              <iframe src={signedUrl} className="w-full h-full" title="PDF Viewer" />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 font-light">Kunde inte ladda fil</div>
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

            <ReverifyButton docId={doc.id} />

            {/* HÄR ÄR DEN NYA SUPER-KOMPONENTEN */}
            <ReviewForm doc={doc} />

          </div>
        </div>
      </div>
    </div>
  );
}
