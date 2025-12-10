"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { uploadAndEnqueueDocument } from "../app/actions";
import { UploadCloud, Loader2, FileUp } from "lucide-react"; // <-- Bytte ikon till FileUp

export function UploadZone() {
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      try {
        await uploadAndEnqueueDocument(formData);
      } catch (error) {
        setUploadError("Något gick fel vid uppladdningen.");
      }
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: isPending,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          relative group cursor-pointer 
          flex flex-col items-center justify-center 
          py-16 px-4 rounded-3xl transition-all duration-300
          border border-dashed
          ${isDragActive ? "border-blue-400 bg-blue-50/50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"}
          ${isPending ? "opacity-50 pointer-events-none" : ""}
          bg-white
        `}
      >
        <input {...getInputProps()} />
        
        <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 group-hover:scale-110 transition-transform duration-300">
           {isPending ? (
             <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
           ) : (
             <FileUp className="w-6 h-6 text-slate-600" />
           )}
        </div>

        <div className="text-center space-y-1">
          <p className="text-lg font-medium text-slate-900">
            {isDragActive ? "Släpp filen här..." : "Dra och släpp PDF-filer"}
          </p>
          <p className="text-sm text-slate-400 font-light">
             eller klicka för att bläddra
          </p>
        </div>
      </div>
      
      {uploadError && (
        <p className="mt-3 text-center text-sm text-red-500 bg-red-50 py-1 px-3 rounded-full inline-block mx-auto">
          {uploadError}
        </p>
      )}
    </div>
  );
}