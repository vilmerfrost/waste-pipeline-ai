"use client";

import { useState } from "react";
import { Trash2, Archive, Download, RefreshCcw, FileJson, Code, X, Copy, Check } from "lucide-react";
import { deleteDocument, toggleArchive } from "@/app/actions";

// --- NY SMART CSV-GENERATOR (Samma logik som ExportActions) ---
function downloadSingleCsv(doc: any) {
  const data = doc.extracted_data || {};
  const lineItems = data.lineItems || [];
  
  const getVal = (field: any) => {
    if (!field) return "";
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
  };

  const clean = (val: any) => `"${String(val || "").replace(/"/g, '""')}"`;

  // Utökade rubriker för att matcha detaljnivån
  const headers = [
    "Datum", 
    "Filnamn", 
    "Leverantör", 
    "Material", 
    "Vikt (kg)", 
    "Enhet",
    "Kostnad (kr)", 
    "Adress", 
    "Mottagare", 
    "Hantering",
    "Farligt Avfall",
    "CO2 Besparing",
    "Status"
  ];
  
  let rows: string[] = [];

  // Gemensam data
  const baseData = [
    getVal(data.date) || doc.created_at.split("T")[0],
    doc.filename,
    getVal(data.supplier) || ""
  ];

  if (lineItems.length > 0) {
    // SCENARIO 1: Detaljerade rader
    lineItems.forEach((item: any) => {
        // Tvinga formatet: "1234,56" för vikt (Svensk standard)
        const weightVal = getVal(item.weightKg);
        const weightStr = typeof weightVal === 'number' ? weightVal.toFixed(2).replace('.', ',') : "0,00";
        
        const costVal = getVal(data.cost); // Kostnad ligger oftast på totalen, inte raden
        const costStr = typeof costVal === 'number' ? costVal.toFixed(2).replace('.', ',') : "0,00";

        const row = [
            ...baseData,
            getVal(item.material) || "Okänt",
            weightStr,
            "kg",
            costStr, // Vi upprepar totalkostnaden eller sätter 0 om vi vill vara strikta
            getVal(item.address) || getVal(data.address) || "", // Rad-adress eller Huvudadress
            getVal(item.receiver) || getVal(data.receiver) || "",
            getVal(item.handling) || "",
            getVal(item.isHazardous) ? "Ja" : "Nej",
            getVal(item.co2Saved) || 0,
            doc.status
        ];
        rows.push(row.map(clean).join(","));
    });
  } else {
    // SCENARIO 2: Enkel faktura (inga rader)
    const weightVal = getVal(data.weightKg);
    const weightStr = typeof weightVal === 'number' ? weightVal.toFixed(2).replace('.', ',') : "0,00";
    
    const costVal = getVal(data.cost);
    const costStr = typeof costVal === 'number' ? costVal.toFixed(2).replace('.', ',') : "0,00";

    const row = [
        ...baseData,
        getVal(data.material) || "Blandat",
        weightStr,
        "kg",
        costStr,
        getVal(data.address) || "",
        getVal(data.receiver) || "",
        "", // Hantering
        "Nej", // Farligt
        getVal(data.totalCo2Saved) || 0,
        doc.status
    ];
    rows.push(row.map(clean).join(","));
  }

  const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${doc.filename.replace(/\.[^/.]+$/, "")}_export.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ... (Resten av filen är samma som förut: getCleanJson, downloadSingleJson, FileActions komponent) ...

function getCleanJson(doc: any) {
  return {
    filename: doc.filename,
    status: doc.status,
    analyzed_at: doc.created_at,
    data: doc.extracted_data || {} 
  };
}

function downloadSingleJson(doc: any) {
  const cleanData = getCleanJson(doc);
  const jsonContent = JSON.stringify(cleanData, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${doc.filename.replace(/\.[^/.]+$/, "")}_data.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function FileActions({ doc, isArchivedPage = false }: { doc: any, isArchivedPage?: boolean }) {
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);
  const cleanDoc = getCleanJson(doc);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(cleanDoc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setShowJson(true)}
          title="Visa API Response"
          className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"
        >
          <Code className="w-4 h-4" />
        </button>

        <button
          onClick={() => downloadSingleJson(doc)}
          title="Ladda ner JSON"
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
        >
          <FileJson className="w-4 h-4" />
        </button>

        <button
          onClick={() => downloadSingleCsv(doc)}
          title="Ladda ner CSV"
          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          <Download className="w-4 h-4" />
        </button>

        <form action={toggleArchive}>
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="currentState" value={String(doc.archived)} />
          <button 
            type="submit"
            title={isArchivedPage ? "Återställ" : "Arkivera"}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
          >
            {isArchivedPage ? <RefreshCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>
        </form>

        <form action={deleteDocument} onSubmit={(e) => {
          if (!confirm("Radera permanent?")) e.preventDefault();
        }}>
          <input type="hidden" name="id" value={doc.id} />
          <input type="hidden" name="storagePath" value={doc.storage_path} />
          <button 
            type="submit" 
            title="Radera"
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </form>
      </div>

      {showJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                  <Code className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg text-slate-900">API Response</h3>
                  <p className="text-xs text-slate-500 font-mono">Ren JSON-struktur</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleCopy}
                  className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Kopierad" : "Kopiera"}
                </button>
                <button 
                  onClick={() => setShowJson(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-900">
              <pre className="text-xs font-mono text-green-400 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(cleanDoc, null, 2)}
              </pre>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-right">
                <button onClick={() => setShowJson(false)} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50">Stäng</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}