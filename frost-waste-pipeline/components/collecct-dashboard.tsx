"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, FileText, AlertCircle, Eye, Download } from "lucide-react";
import { approveDocument, rejectDocument } from "@/app/actions";

interface Document {
  id: string;
  filename: string;
  status: string;
  created_at: string;
  extracted_data?: any;
}

interface CollecctDashboardProps {
  initialDocuments: Document[];
}

export function CollecctDashboard({ initialDocuments }: CollecctDashboardProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const getConfidence = (doc: Document): number => {
    const data = doc.extracted_data || {};
    const fields = ["material", "weightKg", "address", "date"];
    let totalConfidence = 0;
    let count = 0;

    fields.forEach((field) => {
      const fieldData = data[field];
      if (fieldData?.confidence !== undefined) {
        totalConfidence += fieldData.confidence;
        count++;
      }
    });

    return count > 0 ? totalConfidence / count : 0;
  };

  const getVal = (field: any) => {
    if (!field) return "";
    if (typeof field === "object" && "value" in field) return field.value;
    return field;
  };

  const handleApprove = async (docId: string) => {
    setLoading({ ...loading, [docId]: true });
    try {
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;

      // Get approved data from extracted_data
      const approvedData = doc.extracted_data || {};

      // Call approve API
      const response = await fetch("/api/azure/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: docId,
          approvedData: approvedData,
        }),
      });

      if (response.ok) {
        // Remove from list
        setDocuments(documents.filter((d) => d.id !== docId));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(docId);
          return next;
        });
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || "Failed to approve"}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading({ ...loading, [docId]: false });
    }
  };

  const handleReject = async (docId: string, reason?: string) => {
    setLoading({ ...loading, [docId]: true });
    try {
      const formData = new FormData();
      formData.append("id", docId);
      if (reason) formData.append("reason", reason);

      await rejectDocument(formData);

      // Remove from list
      setDocuments(documents.filter((d) => d.id !== docId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading({ ...loading, [docId]: false });
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await handleApprove(id);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter documents by status
  const filteredDocuments = documents.filter((doc) => {
    if (statusFilter === "all") return true;
    return doc.status === statusFilter;
  });

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      uploaded: "Uppladdad",
      queued: "I kö",
      processing: "Bearbetar",
      needs_review: "Behöver granskas",
      approved: "Godkänd",
      verified: "Verifierad",
      rejected: "Avvisad",
      error: "Fel",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      uploaded: "bg-blue-50 text-blue-700 border-blue-200",
      queued: "bg-purple-50 text-purple-700 border-purple-200",
      processing: "bg-yellow-50 text-yellow-700 border-yellow-200",
      needs_review: "bg-amber-50 text-amber-700 border-amber-200",
      approved: "bg-green-50 text-green-700 border-green-200",
      verified: "bg-green-50 text-green-700 border-green-200",
      rejected: "bg-red-50 text-red-700 border-red-200",
      error: "bg-red-50 text-red-700 border-red-200",
    };
    return colors[status] || "bg-slate-50 text-slate-700 border-slate-200";
  };

  if (filteredDocuments.length === 0 && documents.length > 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Inga dokument med vald status</h3>
        <p className="text-slate-500">Ändra filter för att se fler dokument.</p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Inga dokument att granska</h3>
        <p className="text-slate-500">Alla dokument har granskats!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* STATUS FILTER */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Filtrera på status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="all">Alla</option>
            <option value="uploaded">Uppladdad</option>
            <option value="queued">I kö</option>
            <option value="processing">Bearbetar</option>
            <option value="needs_review">Behöver granskas</option>
            <option value="approved">Godkänd</option>
            <option value="verified">Verifierad</option>
            <option value="rejected">Avvisad</option>
            <option value="error">Fel</option>
          </select>
          <span className="text-xs text-slate-500">
            Visar {filteredDocuments.length} av {documents.length} dokument
          </span>
        </div>
      </div>

      {/* BULK ACTIONS */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900">
            {selectedIds.size} dokument valda
          </span>
          <button
            onClick={handleBulkApprove}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Godkänn alla valda
          </button>
        </div>
      )}

      {/* DOCUMENTS LIST */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {filteredDocuments.map((doc) => {
            const confidence = getConfidence(doc);
            const data = doc.extracted_data || {};
            const isSelected = selectedIds.has(doc.id);
            const isLoading = loading[doc.id];

            return (
              <div
                key={doc.id}
                className={`p-6 hover:bg-slate-50 transition-colors ${
                  isSelected ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* CHECKBOX */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(doc.id)}
                    className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />

                  {/* FILE INFO */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="w-5 h-5 text-slate-400" />
                      <Link
                        href={`/review/${doc.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                      >
                        {doc.filename}
                      </Link>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(doc.status)}`}>
                        {getStatusLabel(doc.status)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(doc.created_at).toLocaleDateString("sv-SE")}
                      </span>
                    </div>

                    {/* EXTRACTED DATA PREVIEW */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-slate-500">Material:</span>{" "}
                        <span className="font-medium">{getVal(data.material) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Vikt:</span>{" "}
                        <span className="font-medium">
                          {getVal(data.weightKg) || 0} kg
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Adress:</span>{" "}
                        <span className="font-medium">{getVal(data.address) || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Datum:</span>{" "}
                        <span className="font-medium">{getVal(data.date) || "—"}</span>
                      </div>
                    </div>

                    {/* CONFIDENCE BADGE */}
                    <div className="flex items-center gap-2">
                      {confidence >= 0.9 ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                          <CheckCircle className="w-3 h-3 inline mr-1" />
                          Hög säkerhet ({Math.round(confidence * 100)}%)
                        </span>
                      ) : confidence >= 0.7 ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          Osäker ({Math.round(confidence * 100)}%)
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          Låg säkerhet ({Math.round(confidence * 100)}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/review/${doc.id}`}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Visa detaljer"
                    >
                      <Eye className="w-5 h-5" />
                    </Link>
                    <button
                      onClick={() => handleApprove(doc.id)}
                      disabled={isLoading}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Godkänn"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleReject(doc.id)}
                      disabled={isLoading}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Avvisa"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

