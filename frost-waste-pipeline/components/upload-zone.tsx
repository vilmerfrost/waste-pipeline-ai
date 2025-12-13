"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { uploadAndEnqueueDocument } from "../app/actions";
import { UploadCloud, Loader2, FileUp, CheckCircle2, XCircle, FileText, FileSpreadsheet } from "lucide-react";

// Typ för uppladdningsstatus
type UploadStatus = "idle" | "uploading" | "success" | "error";

interface FileUpload {
  id: string;
  file: File;
  status: UploadStatus;
  errorMessage?: string;
}

export function UploadZone() {
  const [uploads, setUploads] = useState<FileUpload[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // 1. Skapa nya objekt för kön
    const newUploads = acceptedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "uploading" as UploadStatus,
    }));

    // Lägg till i listan (högst upp)
    setUploads((prev) => [...newUploads, ...prev]);

    // 2. Beta av kön parallellt
    // Vi använder Promise.allSettled för att en fil inte ska krascha alla andra
    await Promise.allSettled(
      newUploads.map(async (uploadItem) => {
        try {
          const formData = new FormData();
          formData.append("file", uploadItem.file);

          await uploadAndEnqueueDocument(formData);

          // Uppdatera status till success
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadItem.id ? { ...u, status: "success" } : u
            )
          );
        } catch (error) {
          console.error("Upload failed", error);
          // Uppdatera status till error
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadItem.id ? { ...u, status: "error" } : u
            )
          );
        }
      })
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
    },
    maxFiles: 0, // 0 betyder obegränsat antal filer!
  });

  // Ikon-helper
  const getIcon = (status: UploadStatus, fileName: string) => {
    if (status === "uploading") return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    if (status === "success") return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (status === "error") return <XCircle className="w-5 h-5 text-red-500" />;
    
    // Default fil-ikon baserat på typ
    if (fileName.endsWith(".xlsx")) return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    return <FileText className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      {/* --- DROP ZONE --- */}
      <div
        {...getRootProps()}
        className={`
          relative group cursor-pointer 
          flex flex-col items-center justify-center 
          py-12 px-4 rounded-3xl transition-all duration-300
          border border-dashed
          ${isDragActive ? "border-blue-400 bg-blue-50/50 scale-[1.02]" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"}
          bg-white
        `}
      >
        <input {...getInputProps()} />
        
        <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 group-hover:scale-110 transition-transform duration-300">
             <FileUp className="w-6 h-6 text-slate-600" />
        </div>

        <div className="text-center space-y-1">
          <p className="text-lg font-medium text-slate-900">
            {isDragActive ? "Släpp filerna här..." : "Dra och släpp filer"}
          </p>
          <p className="text-sm text-slate-400 font-light">
             PDF eller Excel • Obegränsat antal
          </p>
        </div>
      </div>

      {/* --- UPLOAD QUEUE / STATUS LIST --- */}
      {uploads.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
            <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Uppladdningskö</span>
            <button 
                onClick={() => setUploads([])} 
                className="text-[10px] text-slate-400 hover:text-slate-600"
            >
                Rensa lista
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
            {uploads.map((item) => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  {getIcon(item.status, item.file.name)}
                  <div className="flex flex-col">
                    <span className={`text-sm font-medium ${item.status === 'success' ? 'text-slate-700' : 'text-slate-900'}`}>
                        {item.file.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                        {(item.file.size / 1024).toFixed(0)} KB
                        {item.status === 'error' && <span className="text-red-500 ml-2">• Misslyckades</span>}
                    </span>
                  </div>
                </div>
                <div>
                    {item.status === 'uploading' && (
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 animate-pulse w-2/3 rounded-full"></div>
                        </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}