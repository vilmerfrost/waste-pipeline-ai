"use client";

import { useState } from "react";

interface PaginatedTableProps {
  lineItems: any[];
  columns: string[];
}

export function PaginatedTable({ lineItems, columns }: PaginatedTableProps) {
  const [displayCount, setDisplayCount] = useState(50);
  const ROWS_PER_PAGE = 50;
  
  const visibleRows = lineItems.slice(0, displayCount);
  const hasMore = displayCount < lineItems.length;
  const remainingRows = lineItems.length - displayCount;
  
  // Helper to get value from nested structure
  const getValue = (item: any, col: string) => {
    const field = item[col];
    if (field && typeof field === 'object' && 'value' in field) {
      return field.value;
    }
    return field;
  };
  
  // Helper to translate column names
  const translateColumn = (col: string): string => {
    const translations: Record<string, string> = {
      "date": "Datum",
      "address": "Adress",
      "location": "Adress",
      "material": "Material",
      "weightKg": "Vikt (kg)",
      "unit": "Enhet",
      "receiver": "Mottagare",
      "wasteCode": "Avfallskod",
      "costSEK": "Kostnad (kr)",
      "co2Saved": "CO2 Besparing",
      "co2": "CO2 Besparing",
      "notes": "Anteckningar",
      "quantity": "Antal",
      "container": "Behållare",
      "handling": "Hantering",
      "isHazardous": "Farligt Avfall",
      "percentage": "Procent"
    };
    return translations[col] || col;
  };
  
  return (
    <div>
      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">#</th>
                {columns.map(col => (
                  <th 
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase"
                  >
                    {translateColumn(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {visibleRows.map((row, idx) => {
                const value = getValue(row, columns[0]); // Check first column for structure
                const isWrapped = value && typeof value === 'object' && 'value' in value;
                
                return (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{idx + 1}</td>
                    {columns.map(col => {
                      const field = row[col];
                      let displayValue: any;
                      let isMissing = false;
                      
                      if (field && typeof field === 'object' && 'value' in field) {
                        displayValue = field.value;
                        isMissing = displayValue === undefined || displayValue === null || displayValue === "" || displayValue === 0;
                      } else {
                        displayValue = field;
                        isMissing = displayValue === undefined || displayValue === null || displayValue === "" || displayValue === 0;
                      }
                      
                      return (
                        <td key={col} className="px-4 py-3 text-sm">
                          {isMissing ? (
                            <span className="text-red-500 font-semibold">SAKNAS</span>
                          ) : (
                            <span>
                              {typeof displayValue === 'number' 
                                ? displayValue.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : String(displayValue)
                              }
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Show More Button */}
      {hasMore && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="text-sm text-gray-600">
            Visar {displayCount} av {lineItems.length} rader
            {remainingRows > 0 && ` (${remainingRows} rader kvar)`}
          </div>
          
          <button
            onClick={() => setDisplayCount(prev => Math.min(prev + ROWS_PER_PAGE, lineItems.length))}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Visa {Math.min(ROWS_PER_PAGE, remainingRows)} rader till
          </button>
          
          {remainingRows > ROWS_PER_PAGE && (
            <button
              onClick={() => setDisplayCount(lineItems.length)}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Visa alla ({lineItems.length} rader)
            </button>
          )}
        </div>
      )}
      
      {!hasMore && lineItems.length > ROWS_PER_PAGE && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="text-sm text-green-600 font-medium">
            ✓ Visar alla {lineItems.length} rader
          </div>
          
          <button
            onClick={() => setDisplayCount(ROWS_PER_PAGE)}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Visa mindre (först {ROWS_PER_PAGE} rader)
          </button>
        </div>
      )}
    </div>
  );
}

