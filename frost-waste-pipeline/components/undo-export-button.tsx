"use client";

import { useState } from "react";
import { Undo2, Loader2 } from "lucide-react";
import { useConfirmDialog } from "./confirm-dialog";

interface UndoExportButtonProps {
  documentId: string;
  filename: string;
  onSuccess?: () => void;
  variant?: "icon" | "button";
}

export function UndoExportButton({ 
  documentId, 
  filename,
  onSuccess,
  variant = "button"
}: UndoExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const handleUndo = async () => {
    const confirmed = await confirm({
      title: "Ångra export?",
      message: `Detta återställer "${filename}" till godkänd status så att den kan granskas och exporteras igen. Filen i Azure "completed" container påverkas inte.`,
      confirmText: "Ångra export",
      cancelText: "Avbryt",
      variant: "warning",
    });

    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/documents/undo-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to undo export");
      }

      onSuccess?.();
      
      // Reload to show updated status
      window.location.reload();
      
    } catch (error: any) {
      console.error("Undo export error:", error);
      alert(`Kunde inte ångra export: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (variant === "icon") {
    return (
      <>
        <ConfirmDialog />
        <button
          onClick={handleUndo}
          disabled={isLoading}
          className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
          title="Ångra export"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Undo2 className="w-4 h-4" />
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <ConfirmDialog />
      <button
        onClick={handleUndo}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-50 border border-orange-200 rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Undo2 className="w-4 h-4" />
        )}
        <span>Ångra export</span>
      </button>
    </>
  );
}

