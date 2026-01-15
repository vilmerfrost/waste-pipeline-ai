"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteDocument } from "@/app/actions";
import { useConfirmDialog } from "./confirm-dialog";

interface DeleteDocumentButtonProps {
  documentId: string;
  storagePath: string;
  filename: string;
  redirectAfter?: string;
  variant?: "icon" | "button";
}

export function DeleteDocumentButton({
  documentId,
  storagePath,
  filename,
  redirectAfter,
  variant = "icon",
}: DeleteDocumentButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Radera dokument",
      message: `Är du säker på att du vill radera "${filename}"? Detta kan inte ångras.`,
      confirmText: "Radera",
      cancelText: "Avbryt",
      variant: "danger",
    });

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("id", documentId);
      formData.append("storagePath", storagePath);

      await deleteDocument(formData);

      // Redirect if specified
      if (redirectAfter) {
        router.push(redirectAfter);
      } else {
        router.refresh();
      }
    } catch (error: any) {
      console.error("Delete failed:", error);
      alert(`Kunde inte radera dokument: ${error.message || "Okänt fel"}`);
      setIsDeleting(false);
    }
  };

  if (variant === "button") {
    return (
      <>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-red-300 text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Raderar...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Radera
            </>
          )}
        </button>
        <ConfirmDialog />
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        title="Radera dokument"
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDeleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
      <ConfirmDialog />
    </>
  );
}
