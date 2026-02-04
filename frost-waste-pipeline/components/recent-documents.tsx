"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, FileSpreadsheet, AlertCircle, RefreshCw, Filter } from "lucide-react";
import { GranskaButton } from "@/components/granska-button";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { UndoExportButton } from "@/components/undo-export-button";
import { AutoFetchButton } from "@/components/auto-fetch-button";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/time-utils";
import { truncateFilename } from "@/lib/filename-utils";
import { RelativeTime } from "@/components/relative-time";

interface RecentDocumentsProps {
  documents: any[];
  total: number;
  activeTab: string;
}

export function RecentDocuments({ documents, total, activeTab }: RecentDocumentsProps) {
  const [filterType, setFilterType] = useState<"all" | "pdf" | "excel">("all");

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      if (filterType === "all") return true;
      if (filterType === "pdf") return doc.filename.toLowerCase().endsWith(".pdf");
      if (filterType === "excel") {
        return doc.filename.toLowerCase().endsWith(".xlsx") || doc.filename.toLowerCase().endsWith(".xls");
      }
      return true;
    });
  }, [documents, filterType]);

  const displayCount = filteredDocs.length;

  return (
    <div className="mb-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Senaste dokument
          </h2>
          <p className="text-sm text-gray-500">
            Visar {displayCount} {filterType !== "all" ? `(${filterType})` : ""} av {total} dokument
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filterType === "all"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            Alla
          </button>
          <button
            onClick={() => setFilterType("pdf")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              filterType === "pdf"
                ? "bg-red-50 text-red-700 ring-1 ring-red-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <FileText className="w-3 h-3" />
            PDF
          </button>
          <button
            onClick={() => setFilterType("excel")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              filterType === "excel"
                ? "bg-green-50 text-green-700 ring-1 ring-green-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <FileSpreadsheet className="w-3 h-3" />
            Excel
          </button>
        </div>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-50 rounded-full mb-4 text-gray-400">
            <Filter className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Inga dokument matchar filtret
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Det finns inga dokument av typen "{filterType}" i den aktuella listan. Prova att ändra filter eller ladda upp nya dokument.
          </p>
          {activeTab === "active" && filterType === "all" && documents.length === 0 && <AutoFetchButton />}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => {
            const validation = doc.extracted_data?._validation;
            const completeness = validation?.completeness ?? null;
            const isProcessed = doc.status !== "uploaded";
            const materialCount =
              doc.extracted_data?.lineItems?.length || doc.extracted_data?.rows?.length || 0;
            
            // Helper to extract numeric value from {value, confidence} or plain number
            const getNumericValue = (val: any): number => {
              if (typeof val === 'object' && val?.value !== undefined) return Number(val.value) || 0;
              return Number(val) || 0;
            };

            const totalWeight =
              getNumericValue(doc.extracted_data?.totalWeightKg) ||
              (doc.extracted_data?.lineItems?.reduce(
                (sum: number, item: any) => sum + getNumericValue(item.weightKg),
                0
              ) || 0);
            
            const isPdf = doc.filename.toLowerCase().endsWith(".pdf");

            return (
              <div
                key={doc.id}
                className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col h-full"
              >
                {/* Card Header */}
                <div className="p-5 border-b border-gray-50 bg-gradient-to-br from-gray-50/50 to-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border ${
                        isPdf 
                          ? "bg-red-50 border-red-100 text-red-600" 
                          : "bg-green-50 border-green-100 text-green-600"
                      }`}>
                        {isPdf ? <FileText className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <h3
                          className="font-medium text-gray-900 text-sm truncate mb-1 group-hover:text-blue-600 transition-colors"
                          title={doc.filename}
                        >
                          {truncateFilename(doc.filename, 35)}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span title={formatDate(doc.updated_at)}>
                            <RelativeTime date={doc.updated_at} />
                          </span>
                          <span>•</span>
                          <span>{doc.size ? `${(doc.size / 1024).toFixed(0)} KB` : '-'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Status Badge - Compact */}
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      doc.status === 'uploaded' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                      doc.status === 'processing' ? 'bg-blue-50 text-blue-700 border border-blue-100 animate-pulse' :
                      doc.status === 'needs_review' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                      doc.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-100' :
                      doc.status === 'exported' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                      doc.status === 'error' ? 'bg-red-50 text-red-700 border border-red-100' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {doc.status === 'uploaded' && 'Ny'}
                      {doc.status === 'processing' && 'Bearbetar'}
                      {doc.status === 'needs_review' && 'Granska'}
                      {doc.status === 'approved' && 'Godkänd'}
                      {doc.status === 'exported' && 'Klar'}
                      {doc.status === 'error' && 'Fel'}
                    </div>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 flex-1 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 mb-1">Rader</div>
                      <div className="font-semibold text-gray-900">
                        {isProcessed ? materialCount : '-'}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 mb-1">Vikt</div>
                      <div className="font-semibold text-gray-900">
                        {isProcessed
                          ? totalWeight > 0
                            ? `${(totalWeight / 1000).toFixed(1)} ton`
                            : "0 kg"
                          : "-"}
                      </div>
                    </div>
                  </div>

                  {/* Completeness Bar - only if processed and has completeness data */}
                  {isProcessed && completeness !== null && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-gray-500 font-medium">Datakvalitet</span>
                        <span
                          className={`font-bold ${
                            completeness >= 95
                              ? "text-green-600"
                              : completeness >= 80
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {completeness.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ease-out rounded-full ${
                            completeness >= 95
                              ? "bg-green-500"
                              : completeness >= 80
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${completeness}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {validation?.issues?.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-100">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="truncate">
                        {validation.issues.length} {validation.issues.length === 1 ? 'varning' : 'varningar'} att kontrollera
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
                  <div className="flex-1">
                    {doc.status === "uploaded" && (
                      <GranskaButton documentId={doc.id} filename={doc.filename} />
                    )}
                    {doc.status === "processing" && (
                      <button disabled className="w-full py-2 px-3 bg-white border border-gray-200 text-gray-400 text-sm font-medium rounded-lg flex items-center justify-center gap-2 cursor-not-allowed">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Vänta...
                      </button>
                    )}
                    {doc.status === "needs_review" && (
                      <Link
                        href={`/review/${doc.id}`}
                        className="block w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors text-center shadow-sm hover:shadow"
                      >
                        Granska nu
                      </Link>
                    )}
                    {doc.status === "approved" && (
                      <Link
                        href={`/review/${doc.id}`}
                        className="block w-full py-2 px-3 bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-700 text-sm font-medium rounded-lg transition-all text-center"
                      >
                        Öppna
                      </Link>
                    )}
                    {doc.status === "exported" && (
                      <div className="flex gap-2">
                        {doc.extracted_data?.azure_export_url ? (
                          <a
                            href={doc.extracted_data.azure_export_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 text-sm font-medium rounded-lg transition-colors text-center"
                          >
                            Azure
                          </a>
                        ) : (
                          <span className="flex-1 py-2 text-xs text-center text-gray-400">Klar</span>
                        )}
                        <UndoExportButton
                          documentId={doc.id}
                          filename={doc.filename}
                          variant="icon"
                        />
                      </div>
                    )}
                    {doc.status === "error" && (
                      <Link
                        href={`/review/${doc.id}`}
                        className="block w-full py-2 px-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-medium rounded-lg transition-colors text-center"
                      >
                        Visa fel
                      </Link>
                    )}
                  </div>

                  {/* Delete Button (if not exported) */}
                  {doc.status !== "exported" && (
                    <DeleteDocumentButton
                      documentId={doc.id}
                      storagePath={doc.storage_path}
                      filename={doc.filename}
                      variant="icon"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
