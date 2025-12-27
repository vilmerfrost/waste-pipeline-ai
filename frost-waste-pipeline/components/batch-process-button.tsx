"use client";

import { useState } from "react";

interface BatchProcessButtonProps {
  uploadedDocs: any[];
  onSuccess?: () => void;
}

export function BatchProcessButton({ uploadedDocs, onSuccess }: BatchProcessButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  
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
  
  const processBatch = async () => {
    if (selectedDocs.size === 0) {
      alert("Välj minst ett dokument att granska");
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const response = await fetch("/api/process-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          documentIds: Array.from(selectedDocs) 
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Batch processing failed");
      }
      
      const data = await response.json();
      console.log(`✓ Batch processing started for ${data.count} documents`);
      
      // Reload page after a delay
      setTimeout(() => {
        if (onSuccess) onSuccess();
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error("Batch process error:", error);
      alert("Kunde inte starta batch-granskning. Försök igen.");
      setIsProcessing(false);
    }
  };
  
  if (uploadedDocs.length === 0) return null;
  
  return (
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
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Behandlar {selectedDocs.size} dokument...
          </span>
        ) : (
          `Granska ${selectedDocs.size > 0 ? selectedDocs.size : 'valda'} dokument`
        )}
      </button>
    </div>
  );
}

