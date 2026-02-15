"use client";

import { useState, useEffect, useRef } from "react";
import { reVerifyDocument } from "@/app/actions";
import { Sparkles, Loader2, Send, X } from "lucide-react";

export function ReverifyButton({ docId }: { docId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen && !isLoading) {
        setIsModalOpen(false);
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isModalOpen, isLoading]);

  const handleReverify = async () => {
    setIsLoading(true);
    try {
      await reVerifyDocument(docId, customInstructions.trim() || undefined);
    } catch (error) {
      alert("Kunde inte dubbelkolla. Försök igen.");
    } finally {
      setIsLoading(false);
      setIsModalOpen(false);
    }
  };

  const exampleInstructions = [
    "Räkna om liter till kg (multiplicera med 1,5)",
    "Använd datumet i kolumn 3 per rad",
    "Ignorera första raden (rubrikrad)",
    "Kolumnen 'Projekt' = adress",
  ];

  return (
    <>
      {/* Compact header button */}
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg transition-colors font-medium disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Dubbelkollar...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>AI-dubbelkoll</span>
          </>
        )}
      </button>

      {/* Modal overlay */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLoading) {
              setIsModalOpen(false);
            }
          }}
        >
          <div
            ref={modalRef}
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-semibold text-gray-900">
                  AI-dubbelkoll
                </h3>
              </div>
              <button
                onClick={() => !isLoading && setIsModalOpen(false)}
                disabled={isLoading}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">
                Kör en ny AI-analys av originaldokumentet. Du kan ge extra instruktioner nedan.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Extra instruktioner (valfritt)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="T.ex. 'Räkna om liter till kg' eller 'Använd datumet i kolumn 3'"
                  className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none bg-white placeholder:text-gray-400"
                  disabled={isLoading}
                />
              </div>

              {/* Quick-select chips */}
              <div className="flex flex-wrap gap-1.5">
                {exampleInstructions.map((instruction, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      setCustomInstructions((prev) =>
                        prev ? `${prev}\n${instruction}` : instruction
                      )
                    }
                    disabled={isLoading}
                    className="px-2.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded-full text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors disabled:opacity-50"
                  >
                    + {instruction}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => {
                  setCustomInstructions("");
                  setIsModalOpen(false);
                }}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={handleReverify}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyserar...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Kör dubbelkoll
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
