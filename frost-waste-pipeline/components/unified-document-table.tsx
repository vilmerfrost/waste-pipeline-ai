"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  FileSpreadsheet,
  Archive,
  CheckCircle2,
  Trash2,
  Loader2,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { truncateFilename } from "@/lib/filename-utils";
import { formatDate } from "@/lib/time-utils";
import { RelativeTime } from "@/components/relative-time";
import {
  archiveAllDocuments,
  archiveSelectedDocuments,
  approveSelectedDocuments,
  deleteSelectedDocuments,
} from "@/app/actions";
import { ExportActions } from "@/components/export-actions";

interface UnifiedDocumentTableProps {
  documents: any[];
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
}

// Status display config
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  uploaded: { label: "Uppladdad", color: "text-gray-700", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
  processing: { label: "Bearbetar...", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  needs_review: { label: "Granska", color: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" },
  approved: { label: "Godkänd", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200" },
  error: { label: "Fel", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" },
  exported: { label: "Exporterad", color: "text-purple-700", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
};

type StatusFilter = "all" | "needs_review" | "approved" | "error" | "processing" | "uploaded";

export function UnifiedDocumentTable({
  documents,
  currentPage,
  totalItems,
  itemsPerPage,
}: UnifiedDocumentTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isArchiving, setIsArchiving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchivingAll, setIsArchivingAll] = useState(false);

  // Filter documents by status
  const filteredDocs = useMemo(() => {
    if (statusFilter === "all") return documents;
    return documents.filter((doc) => doc.status === statusFilter);
  }, [documents, statusFilter]);

  // Check if all visible docs are selected
  const allSelected = filteredDocs.length > 0 && filteredDocs.every((doc) => selectedIds.has(doc.id));

  // Toggle select all
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocs.map((doc) => doc.id)));
    }
  };

  // Toggle single document
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Helper to extract numeric value from wrapped or plain formats
  const getNumericValue = (val: any): number => {
    if (typeof val === "object" && val?.value !== undefined) return Number(val.value) || 0;
    return Number(val) || 0;
  };

  // Count statuses for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((doc) => {
      counts[doc.status] = (counts[doc.status] || 0) + 1;
    });
    return counts;
  }, [documents]);

  // Bulk action handlers
  const handleArchiveSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Arkivera ${ids.length} valda dokument?`)) return;

    setIsArchiving(true);
    try {
      await archiveSelectedDocuments(ids);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e) {
      alert("Kunde inte arkivera valda dokument.");
    } finally {
      setIsArchiving(false);
    }
  };

  const handleApproveSelected = async () => {
    const ids = Array.from(selectedIds);
    const reviewIds = ids.filter((id) => {
      const doc = documents.find((d) => d.id === id);
      return doc?.status === "needs_review";
    });
    if (reviewIds.length === 0) {
      alert("Inga av de valda dokumenten behöver godkännas.");
      return;
    }
    if (!confirm(`Godkänn ${reviewIds.length} valda dokument?`)) return;

    setIsApproving(true);
    try {
      await approveSelectedDocuments(reviewIds);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e) {
      alert("Kunde inte godkänna valda dokument.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`VARNING: Radera ${ids.length} valda dokument permanent?\n\nDetta kan inte ångras!`)) return;
    if (!confirm(`Sista varningen: ${ids.length} dokument kommer raderas permanent. Fortsätt?`)) return;

    setIsDeleting(true);
    try {
      await deleteSelectedDocuments(ids);
      setSelectedIds(new Set());
      router.refresh();
    } catch (e) {
      alert("Kunde inte radera valda dokument.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchiveAll = async () => {
    if (documents.length === 0) return;
    if (!confirm(`Arkivera ALLA ${documents.length} aktiva dokument?`)) return;

    setIsArchivingAll(true);
    try {
      await archiveAllDocuments();
      router.refresh();
    } catch (e) {
      alert("Kunde inte arkivera allt.");
    } finally {
      setIsArchivingAll(false);
    }
  };

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  // Count needs_review in selection for approve button
  const selectedNeedsReviewCount = Array.from(selectedIds).filter((id) => {
    const doc = documents.find((d) => d.id === id);
    return doc?.status === "needs_review";
  }).length;

  return (
    <div>
      {/* Filter + Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        {/* Status filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 font-medium mr-1">Filter:</span>
          {[
            { key: "all" as StatusFilter, label: "Alla" },
            { key: "needs_review" as StatusFilter, label: "Granska" },
            { key: "approved" as StatusFilter, label: "Godkända" },
            { key: "error" as StatusFilter, label: "Fel" },
            { key: "processing" as StatusFilter, label: "Bearbetar" },
            { key: "uploaded" as StatusFilter, label: "Uppladdade" },
          ].map(({ key, label }) => {
            const count = key === "all" ? documents.length : (statusCounts[key] || 0);
            if (key !== "all" && count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                  statusFilter === key
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/50 rounded text-[10px] font-bold">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Export + Archive All actions */}
        <div className="flex items-center gap-2">
          <ExportActions documents={documents.filter((d) => d.status === "approved")} />
        </div>
      </div>

      {/* Bulk Actions Toolbar - appears when items are selected */}
      {hasSelection && (
        <div className="flex items-center gap-3 p-3 mb-4 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-800">
            {selectedCount} dokument valda
          </span>
          <div className="w-px h-5 bg-blue-200" />

          <button
            onClick={handleArchiveSelected}
            disabled={isArchiving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isArchiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            Arkivera valda
          </button>

          {selectedNeedsReviewCount > 0 && (
            <button
              onClick={handleApproveSelected}
              disabled={isApproving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              {isApproving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Godkänn valda ({selectedNeedsReviewCount})
            </button>
          )}

          <button
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Radera valda
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Avmarkera alla
          </button>
        </div>
      )}

      {/* Table */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white rounded-lg border-2 border-dashed border-gray-200 p-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-50 rounded-full mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {statusFilter === "all" ? "Inga dokument" : `Inga dokument med status "${STATUS_CONFIG[statusFilter]?.label || statusFilter}"`}
          </h3>
          <p className="text-gray-600">
            {statusFilter !== "all" ? "Prova att ändra filter." : "Ladda upp dokument för att komma igång."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="py-3 px-4">Filnamn</th>
                  <th className="py-3 px-4 w-28">Status</th>
                  <th className="py-3 px-4 w-28">Datum</th>
                  <th className="py-3 px-4 w-20 text-right">Material</th>
                  <th className="py-3 px-4 w-24 text-right">Vikt (kg)</th>
                  <th className="py-3 px-4 w-32">Mottagare</th>
                  <th className="py-3 px-4 w-28">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDocs.map((doc) => {
                  const isSelected = selectedIds.has(doc.id);
                  const statusConfig = STATUS_CONFIG[doc.status] || STATUS_CONFIG.uploaded;
                  const isPdf = doc.filename.toLowerCase().endsWith(".pdf");
                  const isProcessed = doc.status !== "uploaded" && doc.status !== "processing";

                  const materialCount =
                    doc.extracted_data?.lineItems?.length ||
                    doc.extracted_data?.rows?.length ||
                    0;

                  const totalWeight =
                    getNumericValue(doc.extracted_data?.totalWeightKg) ||
                    (doc.extracted_data?.lineItems?.reduce(
                      (sum: number, item: any) => sum + getNumericValue(item.weightKg),
                      0
                    ) || 0);

                  // Get receiver from user-edited metadata or extracted data
                  const getVal = (field: any) => {
                    if (!field) return "";
                    if (typeof field === "object" && "value" in field) return field.value;
                    return field;
                  };
                  const receiver =
                    getVal(doc.extracted_data?.documentMetadata?.receiver) ||
                    getVal(doc.extracted_data?.receiver) ||
                    "";

                  return (
                    <tr
                      key={doc.id}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                        isSelected ? "bg-blue-50/50" : ""
                      } ${doc.status === "error" ? "bg-red-50/30" : ""}`}
                      onClick={(e) => {
                        // Don't navigate if clicking checkbox or action buttons
                        const target = e.target as HTMLElement;
                        if (
                          target.tagName === "INPUT" ||
                          target.tagName === "BUTTON" ||
                          target.closest("button") ||
                          target.closest("a")
                        ) {
                          return;
                        }
                        router.push(`/review/${doc.id}`);
                      }}
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(doc.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                              isPdf
                                ? "bg-red-50 text-red-600"
                                : "bg-green-50 text-green-600"
                            }`}
                          >
                            {isPdf ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium text-gray-900 truncate max-w-[250px]"
                              title={doc.filename}
                            >
                              {truncateFilename(doc.filename, 40)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}
                        >
                          {doc.status === "processing" && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          {doc.status === "error" && (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600" title={formatDate(doc.created_at)}>
                          <RelativeTime date={doc.created_at} />
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm text-gray-900 font-medium">
                          {isProcessed ? materialCount : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm text-gray-900">
                          {isProcessed && totalWeight > 0
                            ? totalWeight >= 1000
                              ? `${(totalWeight / 1000).toFixed(1)} ton`
                              : `${totalWeight.toFixed(0)} kg`
                            : isProcessed
                            ? "0 kg"
                            : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600 truncate block max-w-[120px]" title={receiver}>
                          {receiver || "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        {doc.status === "needs_review" && (
                          <Link
                            href={`/review/${doc.id}`}
                            className="inline-flex items-center px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            Granska
                          </Link>
                        )}
                        {doc.status === "approved" && (
                          <Link
                            href={`/review/${doc.id}`}
                            className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-600 text-xs font-medium rounded-lg transition-colors"
                          >
                            Öppna
                          </Link>
                        )}
                        {doc.status === "error" && (
                          <Link
                            href={`/review/${doc.id}`}
                            className="inline-flex items-center px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 text-xs font-medium rounded-lg transition-colors"
                          >
                            Visa fel
                          </Link>
                        )}
                        {doc.status === "processing" && (
                          <span className="text-xs text-gray-400">Vänta...</span>
                        )}
                        {doc.status === "uploaded" && (
                          <span className="text-xs text-gray-400">Ny</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination info */}
      {filteredDocs.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            Visar {filteredDocs.length} av {totalItems} dokument
            {statusFilter !== "all" && ` (filtrerat: ${STATUS_CONFIG[statusFilter]?.label})`}
          </span>
        </div>
      )}
    </div>
  );
}
