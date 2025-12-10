"use client";

import { Trash2, Archive, Download, RefreshCcw } from "lucide-react";
import { deleteDocument, toggleArchive } from "@/app/actions";

// En liten hjälpfunktion för att ladda ner EN fil som CSV
function downloadSingleCsv(doc: any) {
  const data = doc.extracted_data || {};
  
  // Tvätta data
  const clean = (val: any) => `"${String(val || "").replace(/"/g, '""')}"`;
  
  const headers = ["Datum", "Filnamn", "Material", "Vikt (kg)", "Adress", "Mottagare", "Status"];
  const row = [
    clean(data.date || doc.created_at.split("T")[0]),
    clean(doc.filename),
    clean(data.material || "Okänt"),
    clean(data.weightKg || 0),
    clean(data.address || ""),
    clean(data.receiver || ""),
    clean(doc.status)
  ].join(",");

  const csvContent = "\uFEFF" + headers.join(",") + "\n" + row;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${doc.filename.replace(".pdf", "")}_export.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function FileActions({ doc, isArchivedPage = false }: { doc: any, isArchivedPage?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2">
      
      {/* 1. INDIVIDUELL EXPORT (Endast om status är godkänd eller needs_review) */}
      <button
        onClick={() => downloadSingleCsv(doc)}
        title="Ladda ner CSV"
        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
      >
        <Download className="w-4 h-4" />
      </button>

      {/* 2. ARKIVERA / ÅTERSTÄLL */}
      <form action={toggleArchive}>
        <input type="hidden" name="id" value={doc.id} />
        <input type="hidden" name="currentState" value={String(doc.archived)} />
        <button 
          type="submit"
          title={isArchivedPage ? "Återställ till Dashboard" : "Arkivera"}
          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
        >
          {isArchivedPage ? <RefreshCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
        </button>
      </form>

      {/* 3. RADERA */}
      <form action={deleteDocument} onSubmit={(e) => {
        if (!confirm("Är du säker på att du vill radera denna fil permanent?")) {
          e.preventDefault();
        }
      }}>
        <input type="hidden" name="id" value={doc.id} />
        <input type="hidden" name="storagePath" value={doc.storage_path} />
        <button 
          type="submit" 
          title="Radera permanent"
          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}