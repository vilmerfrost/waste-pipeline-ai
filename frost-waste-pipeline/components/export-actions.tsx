"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

export function ExportActions({ documents }: { documents: any[] }) {
  
  const getVal = (field: any) => {
    if (!field) return "";
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
  };

  // --- DEN NYA SMARTA DATA-BEREDAREN ---
  const prepareData = () => {
    let rows: any[] = [];

    documents.forEach((doc) => {
      const data = doc.extracted_data || {};
      const lineItems = data.lineItems || [];

      // Gemensam data för hela dokumentet
      const baseData = {
        "Datum": getVal(data.date) || doc.created_at.split("T")[0],
        "Adress": getVal(data.address) || "Okänd adress",
        "Mottagare": getVal(data.receiver) || "",
        "Leverantör": getVal(data.supplier) || "",
        "Filnamn": doc.filename
      };

      if (lineItems.length > 0) {
        // SCENARIO 1: Vi har detaljerade rader (Line Items)
        // Skapa en rad i Excel för VARJE rad i dokumentet
        lineItems.forEach((item: any) => {
          rows.push({
            ...baseData, // Kopiera datum, adress etc.
            "Material": getVal(item.material) || "Okänt",
            "Vikt": getVal(item.weightKg) || 0, // Nummer för Excel
            "Enhet": "kg",
            "Kostnad": 0, // Ofta saknas kostnad på radnivå, men kan läggas till
            "Farligt Avfall": getVal(item.isHazardous) ? "Ja" : "Nej",
            "Hantering": getVal(item.handling) || ""
          });
        });
      } else {
        // SCENARIO 2: Inga rader (gammal fil eller enkel faktura)
        // Använd totalerna
        rows.push({
          ...baseData,
          "Material": getVal(data.material) || "Blandat",
          "Vikt": getVal(data.weightKg) || 0,
          "Enhet": "kg",
          "Kostnad": getVal(data.cost) || 0,
          "Farligt Avfall": "Nej",
          "Hantering": ""
        });
      }
    });

    return rows;
  };

  // --- EXPORT: EXCEL (.xlsx) ---
  const handleExportExcel = () => {
    if (!documents.length) return alert("Ingen data att exportera!");

    const data = prepareData();
    
    // Formatera kolumnbredd för snygghet
    const wscols = [
      { wch: 12 }, // Datum
      { wch: 30 }, // Adress
      { wch: 25 }, // Mottagare
      { wch: 20 }, // Leverantör
      { wch: 20 }, // Filnamn
      { wch: 30 }, // Material
      { wch: 10 }, // Vikt
      { wch: 5 },  // Enhet
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Avfallsdata");
    XLSX.writeFile(wb, `FROST-Export-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // --- EXPORT: CSV (Formatterad enligt krav) ---
  const handleExportCsv = () => {
    if (!documents.length) return alert("Ingen data att exportera!");
    
    const data = prepareData();
    
    // Anpassa för svensk CSV (semikolon eller komma, decimal-komma)
    const headers = ["Datum", "Adress", "Material", "Vikt", "Enhet", "Mottagare"];
    
    const rows = data.map(row => {
        // Tvinga formatet: "1234,56" för vikt
        const viktStr = typeof row.Vikt === 'number' 
            ? row.Vikt.toFixed(2).replace('.', ',') 
            : "0,00";

        return [
            `"${row.Datum}"`,
            `"${row.Adress}"`,
            `"${row.Material}"`,
            `"${viktStr}"`, // Svenskt decimal-komma
            `"kg"`,
            `"${row.Mottagare}"`
        ].join(",");
    });

    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `avfallshantering.csv`); // Samma namn som exemplet
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex gap-2">
      <button 
        onClick={handleExportExcel}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white border border-green-700 rounded-lg text-sm font-bold hover:bg-green-500 transition-colors shadow-sm active:scale-95"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Excel
      </button>

      <button 
        onClick={handleExportCsv}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
      >
        <Download className="w-4 h-4" />
        CSV
      </button>
    </div>
  );
}