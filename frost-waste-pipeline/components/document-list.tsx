"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MassArchive } from "@/components/mass-archive";
import { ModelBadge } from "@/components/ui/model-badge";
import { FileActions } from "@/components/file-actions";
import { SearchBar } from "@/components/search-bar";

// Helper components and functions from page.tsx
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

const getValue = (field: any) => {
  if (!field) return null;
  if (typeof field === "object" && "value" in field) return field.value;
  return field;
};

interface DocumentListProps {
  documents: any[];
}

export function DocumentList({ documents }: DocumentListProps) {
  const [archiveMode, setArchiveMode] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-end border-b border-slate-100 pb-4">
         <h2 className="font-serif text-2xl text-slate-800">Senaste filer</h2>
         <div className="flex items-center gap-3">
             <div className="w-64">
               <SearchBar />
             </div>
             <Button
                variant="outline"
                size="sm"
                onClick={() => setArchiveMode(!archiveMode)}
              >
                {archiveMode ? "Avsluta" : "Arkivera"}
              </Button>
         </div>
      </div>

      {archiveMode ? (
        <MassArchive 
          documents={documents.map(d => ({
            id: d.id,
            filename: d.filename,
            status: d.status
          }))}
          onArchiveComplete={() => setArchiveMode(false)}
        />
      ) : (
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
                          {doc.extracted_data?.metadata?.model && (
                            <div className="mt-1">
                              <ModelBadge modelPath={doc.extracted_data.metadata.model} />
                            </div>
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
      )}
    </div>
  );
}
