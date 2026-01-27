"use client";

import { Download, FileSpreadsheet, Archive, CheckCircle2, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { archiveAllDocuments, verifyAllDocuments } from "@/app/actions";
import { useState } from "react";

export function ExportActions({ documents }: { documents: any[] }) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const getVal = (field: any) => {
    if (!field) return "";
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
  };

  // ✅ Helper: Check if a value is a placeholder that should be replaced by document-level value
  const isPlaceholder = (val: string): boolean => {
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
  };

  // --- DEN NYA SMARTA DATA-BEREDAREN ---
  const prepareData = () => {
    const rows: any[] = [];

    // DEMO GUID-mappning (I en riktig app hämtas detta från settings-tabellen)
    const DEMO_GUID_MAP: Record<string, string> = {
      "Returab": "550e8400-e29b-41d4-a716-446655440000",
      "Svenska Servicestyrkan": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
      "Sortera": "SORTERA-GUID-123",
      "Akademiska Hus AB": "201758-SYSAV-GUID"
    };

    documents.forEach((doc) => {
      const data = doc.extracted_data || {};
      const lineItems = data.lineItems || [];
      const supplierName = getVal(data.supplier) || "";
      
      // HÄMTA RÄTT GUID (prioritera settings, men ha demo-fallback)
      const customerGuid = DEMO_GUID_MAP[supplierName] || "";

      // ✅ Document-level address: User edit > Extracted > Empty
      const docAddress = getVal(data.documentMetadata?.address) || getVal(data.address);
      const cleanMainAddress = !isPlaceholder(docAddress) ? docAddress.trim() : "";
      
      // ✅ Document-level receiver: User edit > Extracted > Empty
      const docReceiver = getVal(data.documentMetadata?.receiver) || getVal(data.receiver);
      const cleanReceiver = !isPlaceholder(docReceiver) ? docReceiver.trim() : "";

      // ✅ CRITICAL FIX: Document date priority order
      // 1. User-edited date (documentMetadata.date) - HIGHEST PRIORITY
      // 2. Top-level extracted date (data.date)
      // 3. Extract from filename
      // 4. Document creation date (doc.created_at) - LAST RESORT
      let documentDate: string | null = null;
      
      // Priority 1: User-edited date from documentMetadata
      if (data.documentMetadata?.date) {
        documentDate = getVal(data.documentMetadata.date);
      }
      // Priority 2: Top-level extracted date
      if (!documentDate && data.date) {
        documentDate = getVal(data.date);
      }
      // Priority 3: Extract from filename
      if (!documentDate && doc.filename) {
        const cleanFilename = doc.filename.replace(/\s*\(\d+\)/g, '');
        const match = cleanFilename.match(/(\d{4}-\d{2}-\d{2})/);
        if (match) {
          documentDate = match[1];
        }
      }
      // Priority 4: Last resort - creation date (NOT today's date!)
      if (!documentDate) {
        documentDate = doc.created_at?.split("T")[0] || new Date().toISOString().split("T")[0];
      }

      // Gemensam data för hela dokumentet
      const baseData = {
        "Datum": documentDate, // ✅ Now uses proper priority chain
        "KundID-GUID": customerGuid,
        "Adress": cleanMainAddress, // Använd renad adress
        "Mottagare": cleanReceiver, // ✅ Uses document-level receiver (user edit or extracted)
        "Leverantör": supplierName,
        "Filnamn": doc.filename
      };

      // Hjälpfunktion för att formatera vikt: två decimaler, kommatecken, inga tusenavgränsare
      const formatWeight = (weight: number): string => {
        return weight.toFixed(2).replace(".", ",");
      };

      if (lineItems.length > 0) {
        // SCENARIO 1: Vi har detaljerade rader (Line Items)
        lineItems.forEach((item: any) => {
          // ✅ DATUM PER RAD: Use item date if exists, otherwise use document-level date
          const rowDate = getVal(item.date) || documentDate;
          
          // ✅ ADRESS PER RAD: Use row address if NOT placeholder, otherwise document-level
          const itemAddr = getVal(item.address);
          const rowAddr = isPlaceholder(itemAddr) ? cleanMainAddress : itemAddr.trim();

          // ✅ MOTTAGARE PER RAD: Use row receiver if NOT placeholder, otherwise document-level
          const itemReceiver = getVal(item.receiver);
          const rowReceiver = isPlaceholder(itemReceiver) ? cleanReceiver : itemReceiver.trim();

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
        // SCENARIO 2: Inga rader (gammal fil eller enkel faktura)
        // ✅ Use the same documentDate with proper priority chain
        rows.push({
          "Datum": documentDate, // ✅ ÅÅÅÅ-MM-DD format from priority chain
          "Adress": cleanMainAddress || "", // ✅ Hämtställe
          "Material": getVal(data.material) || "Blandat", // ✅ Standardiserad benämning
          "Vikt": formatWeight(Number(getVal(data.weightKg)) || 0), // ✅ Två decimaler, kommatecken
          "Enhet": "Kg", // ✅ Alltid "Kg" (stor K)
          "Mottagare": getVal(data.receiver) || "" // ✅ Mottagare
        });
      }
    });

    return rows;
  };

  // --- EXPORT: EXCEL (.xlsx) ---
  const handleExportExcel = () => {
    if (!documents.length) return alert("Ingen data att exportera!");

    const data = prepareData();
    
    // Skapa worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    
    // SÄTT KOLUMNBREDDER (Så det ser proffsigt ut direkt vid öppning)
    // Ordningen: Datum, Adress, Material, Vikt, Enhet, Mottagare
    ws['!cols'] = [
      { wch: 12 }, // Datum
      { wch: 35 }, // Adress
      { wch: 30 }, // Material
      { wch: 12 }, // Vikt (formaterad som text med kommatecken)
      { wch: 8 },  // Enhet
      { wch: 25 }  // Mottagare
    ];

    // Formatera rubrikraden (fetstil)
    const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E8E8E8" } },
        alignment: { horizontal: "left", vertical: "center" }
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Avfallsdata");
    
    // Filnamn med datum
    const filename = `FROST-Export-${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  // --- EXPORT: CSV (Formatterad enligt krav) ---
  const handleExportCsv = () => {
    if (!documents.length) return alert("Ingen data att exportera!");
    
    const data = prepareData();
    
    // Hjälpfunktion för att rensa och escapea CSV-värden
    const cleanCsvValue = (val: any): string => {
      if (val == null || val === "") return "";
      const str = String(val);
      // Escape citattecken och wrappa i citattecken om det finns kommatecken eller citattecken
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    // ✅ Kolumner enligt kundens specifikation: Datum, Adress, Material, Vikt, Enhet, Mottagare
    const headers = [
      "Datum", 
      "Adress", 
      "Material", 
      "Vikt", 
      "Enhet", 
      "Mottagare"
    ];
    
    const rows = data.map(row => {
        // Vikt är redan formaterad som sträng med kommatecken från prepareData
        const viktStr = typeof row.Vikt === 'string' 
            ? row.Vikt 
            : (typeof row.Vikt === 'number' ? row.Vikt.toFixed(2).replace('.', ',') : "0,00");

        return [
            cleanCsvValue(row.Datum || ""),
            cleanCsvValue(row.Adress || ""), // ✅ Hämtställe
            cleanCsvValue(row.Material || ""), // ✅ Standardiserad benämning
            viktStr, // ✅ Två decimaler, kommatecken, inga tusenavgränsare
            "Kg", // ✅ Alltid "Kg" (stor K)
            cleanCsvValue(row.Mottagare || "") // ✅ Mottagare
        ].join(",");
    });

    // BOM för UTF-8 (så Excel öppnar det korrekt)
    const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `avfallshantering-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- ARKIVERA ALLA DOKUMENT ---
  const handleArchiveAll = async () => {
    if (documents.length === 0) return;
    
    // Säkerhetsfråga så man inte råkar klicka
    if (!confirm(`Är du säker på att du vill arkivera alla ${documents.length} dokument i listan?`)) return;

    setIsArchiving(true);
    try {
      await archiveAllDocuments();
    } catch (e) {
      alert("Något gick fel vid arkivering.");
    } finally {
      setIsArchiving(false);
    }
  };

  // --- GODKÄNN ALLA DOKUMENT ---
  const handleVerifyAll = async () => {
    const needsReview = documents.filter(d => d.status === "needs_review" || d.status === "processing" || d.status === "uploaded" || d.status === "queued");
    if (needsReview.length === 0) {
      alert("Inga dokument behöver godkännas.");
      return;
    }
    
    // Dubbel säkerhetsvarning
    if (!confirm(`Är du säker på att du vill godkänna alla ${needsReview.length} dokument?\n\nDubbelkolla alltid!`)) return;
    
    // Ytterligare bekräftelse
    if (!confirm(`Sista varningen: Du är på väg att godkänna ${needsReview.length} dokument utan granskning. Fortsätt?`)) return;

    setIsVerifying(true);
    try {
      await verifyAllDocuments();
    } catch (e) {
      alert("Något gick fel vid godkännande.");
    } finally {
      setIsVerifying(false);
    }
  };

  const needsReviewCount = documents.filter(d => 
    d.status === "needs_review" || 
    d.status === "processing" || 
    d.status === "uploaded" || 
    d.status === "queued"
  ).length;

  return (
    <div className="flex gap-2 items-center">
      {/* EXPORT KNAPPAR */}
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
      
      {/* AVSKILJARE */}
      <div className="w-px h-6 bg-slate-300 mx-1"></div>

      {/* GODKÄNN ALLA KNAPP */}
      <button 
        onClick={handleVerifyAll}
        disabled={isVerifying || needsReviewCount === 0}
        className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm font-medium hover:bg-blue-100 hover:border-blue-300 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title={`Godkänn alla ${needsReviewCount} dokument som väntar på granskning`}
      >
        {isVerifying ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        Godkänn alla
        {needsReviewCount > 0 && (
          <span className="px-1.5 py-0.5 bg-blue-200 rounded text-xs font-bold">
            {needsReviewCount}
          </span>
        )}
      </button>

      {/* ARKIVERA ALLT KNAPP */}
      <button 
        onClick={handleArchiveAll}
        disabled={isArchiving || documents.length === 0}
        className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title="Flytta alla dokument i listan till arkivet"
      >
        {isArchiving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Archive className="w-4 h-4" />
        )}
        Arkivera allt
      </button>
    </div>
  );
}