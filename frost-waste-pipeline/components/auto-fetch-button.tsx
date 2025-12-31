"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function AutoFetchButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setIsLoading(true);
    setMessage(null);
    
    try {
      const response = await fetch("/api/auto-fetch/manual", {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        setMessage(`✅ Synkade ${result.filesProcessed} filer från Azure!`);
        // Reload after 2 seconds
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setMessage(`❌ Fel vid synkning: ${result.error}`);
      }
    } catch (error) {
      setMessage("❌ Kunde inte synka från Azure");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all text-sm font-medium shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        <span>{isLoading ? 'Synkar...' : 'Synka från Azure'}</span>
      </button>
      
      {/* Toast Message */}
      {message && (
        <div className="absolute top-full mt-2 right-0 min-w-[250px] bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm z-50">
          {message}
        </div>
      )}
    </div>
  );
}
