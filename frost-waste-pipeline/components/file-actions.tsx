"use client";

import { useState, useEffect } from "react";
import { Trash2, Archive, Download, RefreshCcw, FileJson, Code, X, Copy, Check, RotateCcw, Loader2, FileSpreadsheet } from "lucide-react";
import { deleteDocument, toggleArchive, retryProcessing } from "@/app/actions";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

// ✅ Helper: Check if a value is a placeholder that should be replaced
function isPlaceholderValue(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed === '' ||
    trimmed === 'okänd mottagare' ||
    trimmed === 'okänd adress' ||
    trimmed === 'okänt material' ||
    trimmed === 'saknas' ||
    trimmed === 'unknown'
  );
}

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

  // ✅ Kolumner enligt kundens specifikation: Datum, Adress, Material, Vikt, Enhet, Mottagare
  const headers = [
    "Datum", 
    "Adress", 
    "Material", 
    "Vikt", 
    "Enhet", 
    "Mottagare"
  ];
  
  let rows: string[] = [];

  // ✅ Document-level values: User edit > Extracted > Empty
  const docAddress = getVal(data.documentMetadata?.address) || getVal(data.address);
  const cleanMainAddress = !isPlaceholderValue(docAddress) ? docAddress.trim() : "";
  
  const docReceiver = getVal(data.documentMetadata?.receiver) || getVal(data.receiver);
  const cleanReceiver = !isPlaceholderValue(docReceiver) ? docReceiver.trim() : "";

  // Hjälpfunktion för att formatera vikt: två decimaler, kommatecken, inga tusenavgränsare
  const formatWeight = (weight: number): string => {
    return weight.toFixed(2).replace(".", ",");
  };

  if (lineItems.length > 0) {
    // SCENARIO 1: Detaljerade rader
    lineItems.forEach((item: any) => {
        // ✅ DATUM PER RAD: Använd datum från lineItem om det finns, annars dokumentets datum
        const rowDate = getVal(item.date) || getVal(data.date) || doc.created_at.split("T")[0];
        
        // Tvinga formatet: "1234,56" för vikt (Svensk standard)
        const weightVal = Number(getVal(item.weightKg)) || 0;
        const weightStr = formatWeight(weightVal);

        // ✅ ADRESS PER RAD: Use row if NOT placeholder, else document-level
        const itemAddr = getVal(item.address);
        const rowAddr = isPlaceholderValue(itemAddr) ? cleanMainAddress : itemAddr.trim();

        // ✅ MOTTAGARE PER RAD: Use row if NOT placeholder, else document-level
        const itemReceiver = getVal(item.receiver);
        const rowReceiver = isPlaceholderValue(itemReceiver) ? cleanReceiver : itemReceiver.trim();

        const row = [
            rowDate, // ✅ ÅÅÅÅ-MM-DD format
            rowAddr || "", // ✅ Hämtställe
            getVal(item.material) || "Okänt", // ✅ Standardiserad benämning
            weightStr, // ✅ Två decimaler, kommatecken
            "Kg", // ✅ Alltid "Kg" (stor K)
            rowReceiver || "" // ✅ Mottagare
        ];
        rows.push(row.map(clean).join(","));
    });
  } else {
    // SCENARIO 2: Enkel faktura (inga rader)
    const docDate = getVal(data.date) || doc.created_at.split("T")[0];
    const weightVal = Number(getVal(data.weightKg)) || 0;
    const weightStr = formatWeight(weightVal);

    const row = [
        docDate, // ✅ ÅÅÅÅ-MM-DD format
        cleanMainAddress || "", // ✅ Hämtställe
        getVal(data.material) || "Blandat", // ✅ Standardiserad benämning
        weightStr, // ✅ Två decimaler, kommatecken
        "Kg", // ✅ Alltid "Kg" (stor K)
        getVal(data.receiver) || "" // ✅ Mottagare
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
  URL.revokeObjectURL(url);
}

// --- EXCEL-GENERATOR FÖR INDIVIDUELL FIL ---
function downloadSingleExcel(doc: any) {
  const data = doc.extracted_data || {};
  const lineItems = data.lineItems || [];
  
  const getVal = (field: any) => {
    if (!field) return "";
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
  };

  // ✅ Document-level values: User edit > Extracted > Empty
  const docAddress = getVal(data.documentMetadata?.address) || getVal(data.address);
  const cleanMainAddress = !isPlaceholderValue(docAddress) ? docAddress.trim() : "";
  
  const docReceiver = getVal(data.documentMetadata?.receiver) || getVal(data.receiver);
  const cleanReceiver = !isPlaceholderValue(docReceiver) ? docReceiver.trim() : "";

  let rows: any[] = [];

  // Hjälpfunktion för att formatera vikt: två decimaler, kommatecken, inga tusenavgränsare
  const formatWeight = (weight: number): string => {
    return weight.toFixed(2).replace(".", ",");
  };

  if (lineItems.length > 0) {
    // SCENARIO 1: Detaljerade rader
    lineItems.forEach((item: any) => {
      // ✅ DATUM PER RAD: Använd datum från lineItem om det finns, annars dokumentets datum
      const rowDate = getVal(item.date) || getVal(data.date) || doc.created_at.split("T")[0];
      
      // ✅ ADRESS PER RAD: Use row if NOT placeholder, else document-level
      const itemAddr = getVal(item.address);
      const rowAddr = isPlaceholderValue(itemAddr) ? cleanMainAddress : itemAddr.trim();

      // ✅ MOTTAGARE PER RAD: Use row if NOT placeholder, else document-level
      const itemReceiver = getVal(item.receiver);
      const rowReceiver = isPlaceholderValue(itemReceiver) ? cleanReceiver : itemReceiver.trim();

      rows.push({
        "Datum": rowDate, // ✅ ÅÅÅÅ-MM-DD format
        "Adress": rowAddr || "", // ✅ Hämtställe
        "Material": getVal(item.material) || "Okänt", // ✅ Standardiserad benämning
        "Vikt": formatWeight(Number(getVal(item.weightKg)) || 0), // ✅ Två decimaler, kommatecken
        "Enhet": "Kg", // ✅ Alltid "Kg" (stor K)
        "Mottagare": rowReceiver || "" // ✅ Mottagare per rad
      });
    });
  } else {
    // SCENARIO 2: Enkel faktura (inga rader)
    const docDate = getVal(data.date) || doc.created_at.split("T")[0];
    rows.push({
      "Datum": docDate, // ✅ ÅÅÅÅ-MM-DD format
      "Adress": cleanMainAddress || "", // ✅ Hämtställe
      "Material": getVal(data.material) || "Blandat", // ✅ Standardiserad benämning
      "Vikt": formatWeight(Number(getVal(data.weightKg)) || 0), // ✅ Två decimaler, kommatecken
      "Enhet": "Kg", // ✅ Alltid "Kg" (stor K)
      "Mottagare": getVal(data.receiver) || "" // ✅ Mottagare
    });
  }

  // Skapa Excel-fil
  const ws = XLSX.utils.json_to_sheet(rows);
  
  // ✅ Sätt kolumnbredder: Datum, Adress, Material, Vikt, Enhet, Mottagare
  ws['!cols'] = [
    { wch: 12 }, // Datum
    { wch: 35 }, // Adress
    { wch: 30 }, // Material
    { wch: 12 }, // Vikt (formaterad som text med kommatecken)
    { wch: 8 },  // Enhet
    { wch: 25 }  // Mottagare
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Avfallsdata");
  
  const filename = `${doc.filename.replace(/\.[^/.]+$/, "")}_export.xlsx`;
  XLSX.writeFile(wb, filename);
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
  const [isRetrying, setIsRetrying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const cleanDoc = getCleanJson(doc);

  // Fix hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(cleanDoc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryProcessing(doc.id);
      router.refresh(); // Uppdatera sidan för att visa ny status
    } catch (error: any) {
      alert(`Kunde inte försöka igen: ${error.message || "Okänt fel"}`);
    } finally {
      setIsRetrying(false);
    }
  };

  // Prevent hydration mismatch by ensuring consistent initial render
  if (!mounted) {
    return (
      <div className="flex items-center justify-end gap-1">
        {doc.status === "error" && <div className="w-6 h-6" />}
        <div className="w-6 h-6" />
        <div className="w-6 h-6" />
        <div className="w-6 h-6" />
        <div className="w-6 h-6" />
        <div className="w-6 h-6" />
        <div className="w-6 h-6" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {/* RETRY KNAPP - Visas bara för filer med error-status */}
        {doc.status === "error" && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            title="Försök bearbeta filen igen"
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRetrying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
          </button>
        )}

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
          onClick={() => downloadSingleExcel(doc)}
          title="Ladda ner Excel"
          className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
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