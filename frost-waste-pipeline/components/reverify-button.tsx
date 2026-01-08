"use client";

import { useState } from "react";
import { reVerifyDocument } from "@/app/actions";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Send } from "lucide-react";

export function ReverifyButton({ docId }: { docId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");

  const handleReverify = async () => {
    setIsLoading(true);
    try {
      await reVerifyDocument(docId, customInstructions.trim() || undefined);
      // Sidan laddas om automatiskt av server action, men vi kan stoppa laddsnurran
    } catch (error) {
      alert("Kunde inte dubbelkolla. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isLoading) {
      setIsExpanded(!isExpanded);
    }
  };

  const exampleInstructions = [
    "Räkna om liter till kg genom att multiplicera med 1,5",
    "Använd alltid datumet i kolumn 3 som datum per rad",
    "Ignorera första raden, det är en rubrikrad",
    "Kolumnen 'Projekt' ska användas som adress",
  ];

  return (
    <div className="w-full mb-8">
      {/* Main button - now toggles expansion */}
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium text-sm transition-all flex items-center justify-center gap-2 group ${
          isExpanded ? 'rounded-t-xl border-b-0' : 'rounded-xl'
        }`}
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
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 ml-1" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1" />
            )}
          </>
        )}
      </button>

      {/* Expanded panel with textarea */}
      {isExpanded && !isLoading && (
        <div className="bg-indigo-50 border border-indigo-200 border-t-0 rounded-b-xl p-4 animate-in slide-in-from-top-2 duration-200">
          <label className="block text-sm font-medium text-indigo-800 mb-2">
            Extra instruktioner till AI:n (valfritt)
          </label>
          <textarea
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="T.ex. 'Räkna om liter till kg genom att multiplicera med 1,5' eller 'Använd alltid datumet i kolumn 3'"
            className="w-full h-24 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none bg-white placeholder:text-gray-400"
          />
          
          {/* Quick example chips */}
          <div className="mt-3 mb-4">
            <span className="text-xs text-indigo-600 font-medium">Snabbval:</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {exampleInstructions.map((instruction, idx) => (
                <button
                  key={idx}
                  onClick={() => setCustomInstructions(prev => 
                    prev ? `${prev}\n${instruction}` : instruction
                  )}
                  className="px-2 py-1 text-xs bg-white border border-indigo-200 rounded-full text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  + {instruction.length > 35 ? instruction.substring(0, 35) + '...' : instruction}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleReverify}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Kör AI-dubbelkoll
            </button>
            <button
              onClick={() => {
                setCustomInstructions("");
                setIsExpanded(false);
              }}
              className="px-4 py-2.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50 transition-colors"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

