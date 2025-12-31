"use client";

import { useEffect } from "react";
import { CheckCircle, AlertTriangle, X, FileText, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface DocumentResult {
  documentId: string;
  filename: string;
  status: "approved" | "needs_review" | "error";
  confidence?: number;
  qualityScore?: number;
  error?: string;
}

interface BatchResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: {
    total: number;
    approved: number;
    needsReview: number;
    failed: number;
    documents: DocumentResult[];
  } | null;
}

export function BatchResultModal({ isOpen, onClose, results }: BatchResultModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen || !results) return null;

  const handleReviewFirst = () => {
    const firstNeedsReview = results.documents.find(d => d.status === "needs_review");
    if (firstNeedsReview) {
      onClose();
      router.push(`/review/${firstNeedsReview.documentId}`);
    }
  };

  const handleReviewDocument = (documentId: string) => {
    onClose();
    router.push(`/review/${documentId}`);
  };

  const handleClose = () => {
    onClose();
    window.location.reload();
  };

  const needsReviewDocs = results.documents.filter(d => d.status === "needs_review");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b bg-blue-50 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                Batchbearbetning klar! 🎉
              </h2>
              <p className="text-sm text-gray-600">
                {results.total} dokument processade
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-xs font-medium text-green-700 uppercase">Godkända</span>
              </div>
              <p className="text-3xl font-bold text-green-900">
                {results.approved}
              </p>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span className="text-xs font-medium text-yellow-700 uppercase">Granskning</span>
              </div>
              <p className="text-3xl font-bold text-yellow-900">
                {results.needsReview}
              </p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span className="text-xs font-medium text-red-700 uppercase">Fel</span>
              </div>
              <p className="text-3xl font-bold text-red-900">
                {results.failed}
              </p>
            </div>
          </div>

          {/* Documents List */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Dokumentdetaljer:
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
              {results.documents.map((doc, index) => (
                <div
                  key={doc.documentId}
                  className={`p-4 border-b last:border-b-0 flex items-center justify-between ${
                    doc.status === "approved" ? "bg-green-50/50" :
                    doc.status === "needs_review" ? "bg-yellow-50/50" :
                    "bg-red-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {doc.status === "approved" && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
                    {doc.status === "needs_review" && <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />}
                    {doc.status === "error" && <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {doc.filename}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          doc.status === "approved" ? "bg-green-100 text-green-700" :
                          doc.status === "needs_review" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {doc.status === "approved" && `Godkänd${doc.qualityScore ? ` (${doc.qualityScore.toFixed(0)}%)` : ""}`}
                          {doc.status === "needs_review" && "Behöver granskning"}
                          {doc.status === "error" && "Fel"}
                        </span>
                        {doc.confidence && (
                          <span className="text-xs text-gray-500">
                            Tillförlitlighet: {Math.round(doc.confidence)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {doc.status === "needs_review" && (
                    <button
                      onClick={() => handleReviewDocument(doc.documentId)}
                      className="ml-4 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1 flex-shrink-0"
                    >
                      Granska
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Info Message */}
          {needsReviewDocs.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                💡 Granska de {needsReviewDocs.length} dokument som behöver verifiering
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t bg-gray-50 flex gap-3">
          {needsReviewDocs.length > 0 && (
            <button
              onClick={handleReviewFirst}
              className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              Granska första
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className={`px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors ${
              needsReviewDocs.length > 0 ? "" : "flex-1"
            }`}
          >
            Klar
          </button>
        </div>
      </div>
    </div>
  );
}
