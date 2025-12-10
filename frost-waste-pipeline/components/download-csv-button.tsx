"use client";

import { Download } from "lucide-react";

export function DownloadCsvButton({ documents }: { documents: any[] }) {
  const handleDownload = () => {
    if (!documents || documents.length === 0) {
      alert("Inga dokument att exportera!");
      return;
    }

    // Rubriker enligt kravspecifikationen
    const headers = ["Datum", "Adress", "Material", "Vikt", "Enhet", "Mottagare", "Filnamn"];
    
    const rows = documents.map((doc) => {
      const data = doc.extracted_data || {};
      
      // Hjälpfunktion för att tvätta textsträngar för CSV
      const clean = (val: any) => `"${String(val || "").replace(/"/g, '""')}"`;

      // FORMATTERING AV VIKT ENLIGT KRAV:
      // "Vikt anges med två decimaler, kommatecken som decimalavgränsare och utan tusenavgränsare."
      let formattedWeight = "";
      if (typeof data.weightKg?.value === "number") {
        formattedWeight = data.weightKg.value.toFixed(2).replace(".", ",");
      } else if (typeof data.weightKg === "number") { // Fallback för gammal data
        formattedWeight = data.weightKg.toFixed(2).replace(".", ",");
      } else {
        formattedWeight = "0,00";
      }

      // Hantera datum (om AI:n missade formatet, men prompten bör fixa det)
      const dateVal = data.date?.value || data.date || doc.created_at.split("T")[0];

      return [
        clean(dateVal),                     // Datum (ÅÅÅÅ-MM-DD)
        clean(data.address?.value || ""),   // Adress (Hämtställe)
        clean(data.material?.value || ""),  // Material (Standardiserat)
        `"${formattedWeight}"`,             // Vikt (1234,56) - Citattecken viktigt för Excel
        '"kg"',                             // Enhet (Alltid kg)
        clean(data.receiver?.value || ""),  // Mottagare
        clean(doc.filename)                 // Extra info
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `avfallsrapport-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button 
      onClick={handleDownload}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
    >
      <Download className="w-4 h-4" />
      Exportera (Excel)
    </button>
  );
}