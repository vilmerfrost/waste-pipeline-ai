"use client";

import { useState } from "react";
import { Upload, Loader2, CheckCircle, ExternalLink } from "lucide-react";

interface ExportToAzureButtonProps {
  selectedDocuments?: string[]; // Optional: specific document IDs to export
  onSuccess?: () => void;
}

export function ExportToAzureButton({ 
  selectedDocuments, 
  onSuccess 
}: ExportToAzureButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const response = await fetch("/api/export-to-azure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: selectedDocuments || [] // Empty array = export all approved
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Export failed");
      }

      const data = await response.json();
      setExportResult(data);
      setShowSuccessModal(true);
      
      if (onSuccess) {
        onSuccess();
      }

    } catch (error: any) {
      console.error("Export error:", error);
      alert(`Export misslyckades: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    // Reload page to show updated status (documents moved to archive)
    window.location.reload();
  };

  // Helper to get the display filename
  const getDisplayFilename = () => {
    if (!exportResult) return "N/A";
    
    // Check for displayFilename from stats
    if (exportResult.stats?.displayFilename) {
      return exportResult.stats.displayFilename;
    }
    
    // Fallback: check files array
    if (exportResult.files && exportResult.files.length > 0) {
      if (exportResult.files.length === 1) {
        return exportResult.files[0].filename;
      }
      return `${exportResult.files.length} filer`;
    }
    
    return "N/A";
  };

  // Helper to get the first Azure URL
  const getAzureUrl = () => {
    if (!exportResult) return null;
    
    // Check direct azureUrl
    if (exportResult.azureUrl) return exportResult.azureUrl;
    
    // Check files array
    if (exportResult.files && exportResult.files.length > 0) {
      const firstSuccess = exportResult.files.find((f: any) => f.success && f.url);
      return firstSuccess?.url || null;
    }
    
    return null;
  };

  return (
    <>
      <button
        onClick={handleExport}
        disabled={isExporting}
        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
          isExporting
            ? "bg-gray-400 text-gray-200 cursor-not-allowed"
            : "bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl"
        }`}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Exporterar...</span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5" />
            <span>
              {selectedDocuments && selectedDocuments.length > 0
                ? `Exportera ${selectedDocuments.length} dokument`
                : "Exportera till Azure"}
            </span>
          </>
        )}
      </button>

      {/* Success Modal */}
      {showSuccessModal && exportResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleCloseModal}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b bg-green-50 border-green-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <h2 className="text-xl font-bold text-green-900">
                      ✅ Export klar!
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Filen har laddats upp till Azure
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                    Dokument
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {exportResult.stats?.success || exportResult.stats?.total || 0}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                    Rader
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {exportResult.stats?.rows || 0}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                    Total vikt
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {exportResult.stats?.totalWeightTon?.toFixed(2) || "0"} ton
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                    Filnamn
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate" title={getDisplayFilename()}>
                    {getDisplayFilename()}
                  </p>
                </div>
              </div>

              {/* Azure Link */}
              {getAzureUrl() && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        Filen finns i Azure
                      </p>
                      <p className="text-xs text-blue-700 truncate">
                        {getAzureUrl()}
                      </p>
                    </div>
                    <a
                      href={getAzureUrl()!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-4 flex-shrink-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      title="Öppna i Azure"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              {/* Show exported files list if multiple */}
              {exportResult.files && exportResult.files.length > 1 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-gray-600 uppercase mb-2">
                    Exporterade filer
                  </p>
                  <ul className="space-y-1">
                    {exportResult.files.map((file: any, idx: number) => (
                      <li key={idx} className="flex items-center justify-between text-sm">
                        <span className={`truncate ${file.success ? 'text-gray-900' : 'text-red-600'}`}>
                          {file.success ? '✓' : '✗'} {file.filename}
                        </span>
                        {file.success && file.rows && (
                          <span className="text-gray-500 ml-2 flex-shrink-0">
                            {file.rows} rader
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  💡 Filen är nu tillgänglig i Azure "completed" container och kan importeras till Power BI.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
