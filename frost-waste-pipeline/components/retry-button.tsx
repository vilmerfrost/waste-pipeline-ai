"use client";

import { useState } from "react";
import { retryProcessing } from "@/app/actions";
import { RotateCcw, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function RetryButton({ docId }: { docId: string }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const router = useRouter();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryProcessing(docId);
      router.refresh(); // Uppdatera sidan för att visa ny status
    } catch (error: any) {
      alert(`Kunde inte försöka igen: ${error.message || "Okänt fel"}`);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <button
      onClick={handleRetry}
      disabled={isRetrying}
      className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:underline px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Försök bearbeta filen igen"
    >
      {isRetrying ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Försöker...
        </>
      ) : (
        <>
          <RotateCcw className="w-3 h-3" />
          Försök igen
        </>
      )}
    </button>
  );
}

