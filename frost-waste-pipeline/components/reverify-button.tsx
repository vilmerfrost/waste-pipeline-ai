"use client";

import { useState } from "react";
import { reVerifyDocument } from "@/app/actions";
import { Sparkles, Loader2 } from "lucide-react";

export function ReverifyButton({ docId }: { docId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleReverify = async () => {
    setIsLoading(true);
    try {
      await reVerifyDocument(docId);
      // Sidan laddas om automatiskt av server action, men vi kan stoppa laddsnurran
    } catch (error) {
      alert("Kunde inte dubbelkolla. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleReverify}
      disabled={isLoading}
      className="w-full mb-8 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 group"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Dubbelkollar med AI...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 text-indigo-500 group-hover:text-indigo-700" />
          Osäker? Gör en AI-dubbelkoll
        </>
      )}
    </button>
  );
}

