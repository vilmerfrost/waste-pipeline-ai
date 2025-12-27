"use client";

import { useState } from "react";

interface GranskaButtonProps {
  documentId: string;
  onSuccess?: () => void;
}

export function GranskaButton({ documentId, onSuccess }: GranskaButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const handleGranska = async () => {
    setIsProcessing(true);
    
    try {
      const response = await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Processing failed");
      }
      
      console.log(`✓ Processing started for document ${documentId}`);
      
      // Success - reload after a short delay
      setTimeout(() => {
        if (onSuccess) onSuccess();
        window.location.reload();
      }, 1500);
      
    } catch (error) {
      console.error("Granska error:", error);
      alert("Kunde inte starta granskning. Försök igen.");
      setIsProcessing(false);
    }
  };
  
  return (
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
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Behandlar...
        </span>
      ) : (
        "Granska"
      )}
    </button>
  );
}

