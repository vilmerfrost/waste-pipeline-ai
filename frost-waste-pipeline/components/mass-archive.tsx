"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Archive, Loader2, CheckSquare, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface MassArchiveProps {
  documents: Array<{ id: string; filename: string; status: string }>;
  onArchiveComplete?: () => void;
}

export function MassArchive({ documents, onArchiveComplete }: MassArchiveProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isArchiving, setIsArchiving] = useState(false);
  const router = useRouter();

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(documents.map((d) => d.id)));
    }
  };

  const archiveSelected = async () => {
    if (selectedIds.size === 0) return;

    setIsArchiving(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("documents")
        .update({ archived: true, updated_at: new Date().toISOString() })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      setSelectedIds(new Set());
      router.refresh();
      onArchiveComplete?.();
    } catch (error) {
      console.error("Failed to archive documents:", error);
      alert("Kunde inte arkivera dokument. Försök igen.");
    } finally {
      setIsArchiving(false);
    }
  };

  const allSelected = selectedIds.size === documents.length && documents.length > 0;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAll}
            className="flex items-center gap-2"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {allSelected ? "Avmarkera alla" : "Välj alla"}
          </Button>

          {someSelected && (
            <span className="text-sm text-gray-600">
              {selectedIds.size} av {documents.length} valda
            </span>
          )}
        </div>

        <Button
          onClick={archiveSelected}
          disabled={!someSelected || isArchiving}
          variant="destructive"
          size="sm"
        >
          {isArchiving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Arkiverar...
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 mr-2" />
              Arkivera valda ({selectedIds.size})
            </>
          )}
        </Button>
      </div>

      {/* Document list with checkboxes */}
      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-colors",
              selectedIds.has(doc.id)
                ? "bg-blue-50 border-blue-200"
                : "bg-white border-gray-200 hover:bg-gray-50"
            )}
          >
            <Checkbox
              checked={selectedIds.has(doc.id)}
              onCheckedChange={() => toggleSelect(doc.id)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.filename}</p>
              <p className="text-xs text-gray-500">
                Status: {doc.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
