"use client";

import { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { uploadAndEnqueueDocument } from "../app/actions";
import { Loader2, FileUp, CheckCircle2, XCircle, FileText, FileSpreadsheet, AlertTriangle } from "lucide-react";

// Typ för uppladdningsstatus
type UploadStatus = "idle" | "uploading" | "success" | "error";

interface FileUpload {
  id: string;
  file: File;
  status: UploadStatus;
  errorMessage?: string;
}

// File size limit: 50 MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types with Swedish error messages
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (.xlsx)",
  "application/vnd.ms-excel": "Excel (.xls)",
};

/**
 * Validate file before upload
 * Returns error message or null if valid
 */
function validateFile(file: File): string | null {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `Filen är för stor (${sizeMB} MB). Max storlek är 50 MB.`;
  }
  
  // Check MIME type
  if (!Object.keys(ALLOWED_TYPES).includes(file.type)) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    // Also check by extension as a fallback (some systems report wrong MIME)
    if (ext === 'pdf' || ext === 'xlsx' || ext === 'xls') {
      return null; // Allow by extension
    }
    return `Filtypen "${file.type || ext || 'okänd'}" stöds inte. Endast PDF och Excel (.xlsx) är tillåtna.`;
  }
  
  // Check filename for problematic characters
  const problematicChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (problematicChars.test(file.name)) {
    return `Filnamnet innehåller ogiltiga tecken. Ta bort specialtecken och försök igen.`;
  }
  
  // Check if file is empty
  if (file.size === 0) {
    return `Filen är tom (0 bytes).`;
  }
  
  return null;
}

/**
 * Extract user-friendly error message from various error types
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    // Network errors
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Nätverksfel - kontrollera din internetanslutning.';
    }
    
    // Timeout
    if (msg.includes('timeout')) {
      return 'Uppladdningen tog för lång tid. Försök igen.';
    }
    
    // Storage errors
    if (msg.includes('storage') || msg.includes('bucket')) {
      return 'Lagringsfel - kontakta support.';
    }
    
    // Auth errors
    if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('401')) {
      return 'Autentiseringsfel - logga in igen.';
    }
    
    // Database errors
    if (msg.includes('database') || msg.includes('db')) {
      return 'Databasfel - försök igen senare.';
    }
    
    // Return original message if it's already user-friendly
    if (error.message.length < 100 && !msg.includes('error')) {
      return error.message;
    }
    
    return 'Ett oväntat fel uppstod. Försök igen.';
  }
  
  return 'Ett oväntat fel uppstod. Försök igen.';
}

export function UploadZone() {
  const [uploads, setUploads] = useState<FileUpload[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    // Handle rejected files (from dropzone validation)
    const rejectedUploads = rejectedFiles.map((rejection) => {
      let errorMsg = "Filen avvisades";
      if (rejection.errors.length > 0) {
        const err = rejection.errors[0];
        if (err.code === 'file-too-large') {
          errorMsg = `Filen är för stor. Max storlek är 50 MB.`;
        } else if (err.code === 'file-invalid-type') {
          errorMsg = `Filtypen stöds inte. Endast PDF och Excel (.xlsx) är tillåtna.`;
        } else {
          errorMsg = err.message || "Filen avvisades";
        }
      }
      return {
        id: crypto.randomUUID(),
        file: rejection.file,
        status: "error" as UploadStatus,
        errorMessage: errorMsg,
      };
    });
    
    // Add rejected files to list immediately
    if (rejectedUploads.length > 0) {
      setUploads((prev) => [...rejectedUploads, ...prev]);
    }

    // Validate accepted files before upload
    const validatedFiles: { upload: FileUpload; isValid: boolean }[] = acceptedFiles.map((file) => {
      const validationError = validateFile(file);
      return {
        upload: {
          id: crypto.randomUUID(),
          file,
          status: validationError ? "error" as UploadStatus : "uploading" as UploadStatus,
          errorMessage: validationError || undefined,
        },
        isValid: !validationError,
      };
    });
    
    // Add all files to list (some may already be marked as error)
    const newUploads = validatedFiles.map(v => v.upload);
    setUploads((prev) => [...newUploads, ...prev]);

    // Only upload valid files
    const validUploads = validatedFiles.filter(v => v.isValid).map(v => v.upload);
    
    // Process uploads in parallel
    await Promise.allSettled(
      validUploads.map(async (uploadItem) => {
        try {
          const formData = new FormData();
          formData.append("file", uploadItem.file);

          await uploadAndEnqueueDocument(formData);

          // Update status to success
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadItem.id ? { ...u, status: "success", errorMessage: undefined } : u
            )
          );
        } catch (error) {
          console.error("Upload failed:", uploadItem.file.name, error);
          const errorMessage = getErrorMessage(error);
          
          // Update status to error with specific message
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadItem.id ? { ...u, status: "error", errorMessage } : u
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 0, // 0 betyder obegränsat antal filer!
    maxSize: MAX_FILE_SIZE, // 50 MB max
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
              <div key={item.id} className={`px-4 py-3 flex items-center justify-between group ${
                item.status === 'error' ? 'bg-red-50' : ''
              }`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {getIcon(item.status, item.file.name)}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className={`text-sm font-medium truncate ${
                      item.status === 'success' ? 'text-slate-700' : 
                      item.status === 'error' ? 'text-red-700' : 'text-slate-900'
                    }`}>
                        {item.file.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                        {(item.file.size / 1024).toFixed(0)} KB
                        {item.status === 'error' && (
                          <span className="text-red-500 ml-2">
                            • {item.errorMessage || 'Misslyckades'}
                          </span>
                        )}
                    </span>
                    {/* Show detailed error message on separate line if long */}
                    {item.status === 'error' && item.errorMessage && item.errorMessage.length > 30 && (
                      <span className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{item.errorMessage}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 ml-2">
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