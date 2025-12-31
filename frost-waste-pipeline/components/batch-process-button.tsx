"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { BatchResultModal } from "./batch-result-modal";

interface BatchProcessButtonProps {
  uploadedDocs: any[];
  onSuccess?: () => void;
}

export function BatchProcessButton({ uploadedDocs, onSuccess }: BatchProcessButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [showResultModal, setShowResultModal] = useState(false);
  const [batchResults, setBatchResults] = useState<any>(null);
  
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
    setSelectedDocs(new Set(uploadedDocs.map(d => d.id)));
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-md mx-4">
            <div className="flex items-center gap-4">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Processar dokument</h3>
                <p className="text-sm text-gray-600">
                  Behandlar {selectedDocs.size} dokument...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-blue-900">
            Batch-granskning
          </h3>
          <p className="text-sm text-blue-700">
            {uploadedDocs.length} uppladdade dokument väntar på granskning
          </p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Välj alla
          </button>
          <span className="text-gray-400">|</span>
          <button
            onClick={deselectAll}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Avmarkera alla
          </button>
        </div>
      </div>
      
      {/* Document checkboxes */}
      <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
        {uploadedDocs.map(doc => (
          <label 
            key={doc.id}
            className="flex items-center gap-3 p-2 hover:bg-blue-100 rounded cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedDocs.has(doc.id)}
              onChange={() => toggleDoc(doc.id)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {doc.filename}
              </div>
              <div className="text-xs text-gray-600">
                {new Date(doc.created_at).toLocaleString('sv-SE')}
              </div>
            </div>
          </label>
        ))}
      </div>
      
      {/* Process button */}
      <button
        onClick={processBatch}
        disabled={isProcessing || selectedDocs.size === 0}
        className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
          isProcessing || selectedDocs.size === 0
            ? "bg-gray-400 text-gray-200 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Behandlar {selectedDocs.size} dokument...
          </span>
        ) : (
          `Granska ${selectedDocs.size > 0 ? selectedDocs.size : 'valda'} dokument`
        )}
      </button>
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

