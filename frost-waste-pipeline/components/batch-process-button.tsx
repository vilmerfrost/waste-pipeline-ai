"use client";

import { useState, useMemo } from "react";
import { Loader2, FileText, FileSpreadsheet, Filter } from "lucide-react";
import { BatchResultModal } from "./batch-result-modal";
import { formatRelativeTime } from "@/lib/time-utils";

interface BatchProcessButtonProps {
  uploadedDocs: any[];
  onSuccess?: () => void;
}

export function BatchProcessButton({ uploadedDocs, onSuccess }: BatchProcessButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [showResultModal, setShowResultModal] = useState(false);
  const [batchResults, setBatchResults] = useState<any>(null);
  const [filterType, setFilterType] = useState<"all" | "pdf" | "excel">("all");
  
  // Filter docs
  const filteredDocs = useMemo(() => {
    return uploadedDocs.filter(doc => {
      if (filterType === "all") return true;
      if (filterType === "pdf") return doc.filename.toLowerCase().endsWith(".pdf");
      if (filterType === "excel") {
        return doc.filename.toLowerCase().endsWith(".xlsx") || doc.filename.toLowerCase().endsWith(".xls");
      }
      return true;
    });
  }, [uploadedDocs, filterType]);

  const toggleDoc = (docId: string) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };
  
  const selectAll = () => {
    // Only select visible filtered docs
    setSelectedDocs(new Set(filteredDocs.map(d => d.id)));
  };
  
  const deselectAll = () => {
    setSelectedDocs(new Set());
  };
  
  // Poll for document status until processing is complete
  const pollDocumentStatus = async (docId: string, maxAttempts = 60): Promise<any> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls
      
      try {
        const response = await fetch(`/api/document-status?id=${docId}`);
        if (!response.ok) continue;
        
        const data = await response.json();
        const doc = data.document;
        
        // If no longer processing, return the result
        if (doc.status !== "processing") {
          return doc;
        }
      } catch (error) {
        console.error("Poll error:", error);
      }
    }
    
    // Timeout - return error status
    return { id: docId, status: "error", error: "Processing timeout" };
  };
  
  const processBatch = async () => {
    if (selectedDocs.size === 0) {
      alert("Välj minst ett dokument att granska");
      return;
    }
    
    setIsProcessing(true);
    const documentIds = Array.from(selectedDocs);
    
    try {
      // Start batch processing
      const response = await fetch("/api/process-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Batch processing failed");
      }
      
      // Poll all documents for completion
      const results: any[] = [];
      for (const docId of documentIds) {
        const doc = await pollDocumentStatus(docId);
        results.push(doc);
      }
      
      // Process results
      const documents = results.map(doc => {
        const extractedData = doc.extracted_data || {};
        const validation = extractedData._validation || {};
        
        return {
          documentId: doc.id,
          filename: doc.filename || "Okänt dokument",
          status: doc.status,
          confidence: validation.confidence || extractedData.metadata?.confidence,
          qualityScore: validation.qualityScore || validation.completeness,
          error: doc.status === "error" ? (doc.error || "Bearbetning misslyckades") : undefined
        };
      });
      
      const approved = documents.filter(d => d.status === "approved").length;
      const needsReview = documents.filter(d => d.status === "needs_review").length;
      const failed = documents.filter(d => d.status === "error").length;
      
      setBatchResults({
        total: documents.length,
        approved,
        needsReview,
        failed,
        documents
      });
      
      setShowResultModal(true);
      setIsProcessing(false);
      
    } catch (error: any) {
      console.error("Batch process error:", error);
      alert("Kunde inte starta batch-granskning. Försök igen.");
      setIsProcessing(false);
    }
  };
  
  if (uploadedDocs.length === 0) return null;
  
  return (
    <>
      {/* Loading Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-8 shadow-2xl max-w-md mx-4 animate-in fade-in zoom-in-95">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Processar dokument</h3>
                <p className="text-gray-500">
                  Behandlar {selectedDocs.size} dokument med AI...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
        {/* Header Section */}
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Batch-granskning
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  Nyhet
                </span>
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Välj dokument att analysera med AI
              </p>
            </div>
            
            <div className="flex items-center gap-3 bg-gray-100/50 p-1 rounded-lg">
              <button
                onClick={() => setFilterType("all")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  filterType === "all" 
                    ? "bg-white text-gray-900 shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Alla ({uploadedDocs.length})
              </button>
              <button
                onClick={() => setFilterType("pdf")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  filterType === "pdf" 
                    ? "bg-white text-red-700 shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FileText className="w-3 h-3" />
                PDF
              </button>
              <button
                onClick={() => setFilterType("excel")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  filterType === "excel" 
                    ? "bg-white text-green-700 shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FileSpreadsheet className="w-3 h-3" />
                Excel
              </button>
            </div>
          </div>
        </div>
        
        {/* Selection Stats Bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-700">
            Valda: <span className="text-blue-600">{selectedDocs.size}</span> av {filteredDocs.length}
          </span>
          <div className="flex gap-3">
            <button
              onClick={selectAll}
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
            >
              Välj alla
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={deselectAll}
              className="text-gray-500 hover:text-gray-700 font-medium hover:underline"
            >
              Rensa val
            </button>
          </div>
        </div>
        
        {/* Document List */}
        <div className="max-h-[320px] overflow-y-auto">
          {filteredDocs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Inga dokument matchar filtret.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDocs.map(doc => {
                const isPdf = doc.filename.toLowerCase().endsWith(".pdf");
                const isSelected = selectedDocs.has(doc.id);
                
                return (
                  <label 
                    key={doc.id}
                    className={`flex items-center gap-4 p-4 cursor-pointer transition-colors group ${
                      isSelected ? "bg-blue-50/50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDoc(doc.id)}
                      className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 transition-all"
                    />
                    
                    <div className={`p-2 rounded-lg ${
                      isPdf ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                    }`}>
                      {isPdf ? (
                        <FileText className="w-5 h-5" />
                      ) : (
                        <FileSpreadsheet className="w-5 h-5" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium truncate ${
                          isSelected ? "text-blue-900" : "text-gray-900"
                        }`}>
                          {doc.filename}
                        </span>
                        <span className="text-xs text-gray-400 group-hover:text-gray-500 whitespace-nowrap ml-4">
                          {formatRelativeTime(doc.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {(doc.size / 1024).toFixed(0)} KB
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer Action */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={processBatch}
            disabled={isProcessing || selectedDocs.size === 0}
            className={`w-full py-3 rounded-lg font-medium transition-all shadow-sm flex items-center justify-center gap-2 ${
              isProcessing || selectedDocs.size === 0
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md active:scale-[0.99]"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Bearbetar...
              </>
            ) : (
              <>
                <Filter className="w-4 h-4" />
                Starta analys för {selectedDocs.size > 0 ? selectedDocs.size : 0} dokument
              </>
            )}
          </button>
        </div>
      </div>
      
      <BatchResultModal
        isOpen={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          if (onSuccess) onSuccess();
        }}
        results={batchResults}
      />
    </>
  );
}

