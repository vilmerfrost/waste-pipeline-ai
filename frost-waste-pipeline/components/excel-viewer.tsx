"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Loader2, FileSpreadsheet, AlertCircle, Layers } from "lucide-react";

interface SheetData {
  name: string;
  data: any[][];
}

export function ExcelViewer({ url }: { url: string }) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadExcel() {
      try {
        setLoading(true);
        // 1. Hämta filen från Supabase-URL:en
        const response = await fetch(url);
        if (!response.ok) throw new Error("Kunde inte hämta filen");
        
        const arrayBuffer = await response.arrayBuffer();

        // 2. Tolka med SheetJS
        const workbook = XLSX.read(arrayBuffer);
        
        // 3. ✅ FIX: Load ALL sheets, not just the first one!
        const allSheets: SheetData[] = [];
        
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          
          // Only include non-empty sheets
          if (jsonData.length > 0) {
            allSheets.push({
              name: sheetName,
              data: jsonData
            });
          }
        }

        setSheets(allSheets);
        setActiveSheet(0);
      } catch (err) {
        console.error(err);
        setError("Kunde inte läsa Excel-filen.");
      } finally {
        setLoading(false);
      }
    }

    if (url) loadExcel();
  }, [url]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-500" />
        <p className="text-sm">Laddar kalkylblad...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400 bg-red-50/50">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <FileSpreadsheet className="w-10 h-10 mb-2 opacity-50" />
        <p>Tom fil</p>
      </div>
    );
  }

  const currentSheet = sheets[activeSheet];
  const data = currentSheet?.data || [];

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Sheet tabs - only show if multiple sheets */}
      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 border-b border-slate-200 overflow-x-auto">
          <Layers className="w-4 h-4 text-slate-400 mr-1 flex-shrink-0" />
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(index)}
              className={`
                px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap
                ${activeSheet === index 
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200' 
                  : 'text-slate-600 hover:bg-slate-200/50'}
              `}
              title={`${sheet.name} (${sheet.data.length} rader)`}
            >
              {sheet.name}
              <span className="ml-1 text-[10px] text-slate-400">
                ({sheet.data.length})
              </span>
            </button>
          ))}
        </div>
      )}
      
      {/* Table content */}
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-slate-200 border-collapse">
            <tbody className="divide-y divide-slate-100">
              {data.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-50 sticky top-0 z-10 shadow-sm" : "hover:bg-slate-50/50"}>
                  {/* Radnummer (Excel style) */}
                  <td className="px-2 py-1 text-[10px] text-slate-400 bg-slate-50 border-r border-slate-200 text-center select-none w-8 font-mono">
                    {rowIndex + 1}
                  </td>
                  
                  {/* Cellerna */}
                  {row.map((cell: any, cellIndex: number) => (
                    <td 
                      key={cellIndex} 
                      className={`
                        px-3 py-1.5 text-xs text-slate-700 border-r border-slate-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]
                        ${rowIndex === 0 ? "font-bold text-slate-900 bg-slate-100/50" : ""}
                      `}
                      title={String(cell)} // Tooltip för lång text
                    >
                      {cell !== null && cell !== undefined ? String(cell) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Sheet info footer */}
      {sheets.length > 1 && (
        <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
          Blad {activeSheet + 1} av {sheets.length} • {data.length} rader
        </div>
      )}
    </div>
  );
}
