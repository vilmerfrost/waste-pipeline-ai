"use client";

import { useState } from "react";
import { ProcessingResultModal } from "./processing-result-modal";
import { Loader2 } from "lucide-react";

interface GranskaButtonProps {
  documentId: string;
  filename?: string;
  onSuccess?: () => void;
}

export function GranskaButton({ documentId, filename, onSuccess }: GranskaButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [result, setResult] = useState<any>(null);
  
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
    
    // Timeout - return error
    throw new Error("Processing timeout");
  };
  
  const handleGranska = async () => {
    setIsProcessing(true);
    
    try {
      // Start processing
      const response = await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Processing failed");
      }
      
      // Poll for results
      const doc = await pollDocumentStatus(documentId);
      
      // Extract result data
      const extractedData = doc.extracted_data || {};
      const validation = extractedData._validation || {};
      
      const resultData = {
        documentId: doc.id,
        filename: doc.filename || filename || "Okänt dokument",
        status: doc.status,
        confidence: validation.confidence || extractedData.metadata?.confidence,
        qualityScore: validation.qualityScore || validation.completeness,
        extractedRows: extractedData.metadata?.processedRows || extractedData.metadata?.aggregatedRows || extractedData.lineItems?.length || 0,
        totalWeight: extractedData.totalWeightKg || 0,
        error: doc.status === "error" ? "Bearbetning misslyckades" : undefined
      };
      
      setResult(resultData);
      setShowResultModal(true);
      setIsProcessing(false);
      
    } catch (error: any) {
      console.error("Granska error:", error);
      
      // Show error result
      setResult({
        documentId,
        filename: filename || "Okänt dokument",
        status: "error",
        error: error.message || "Kunde inte starta granskning. Försök igen."
      });
      setShowResultModal(true);
      setIsProcessing(false);
    }
  };
  
  return (
    <>
      <button
        onClick={handleGranska}
        disabled={isProcessing}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          isProcessing
            ? "bg-gray-400 text-gray-200 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
      >
        {isProcessing ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Behandlar...
          </span>
        ) : (
          "Granska"
        )}
      </button>
      
      <ProcessingResultModal
        isOpen={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          if (onSuccess) onSuccess();
        }}
        result={result}
      />
    </>
  );
}

