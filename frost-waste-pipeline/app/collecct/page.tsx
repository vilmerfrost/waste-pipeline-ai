import { createServiceRoleClient } from "@/lib/supabase";
import React from "react";
import Link from "next/link";
import { FileText, Activity, ArrowLeft, Settings, Archive } from "lucide-react";
import { AutoFetchButton } from "@/components/auto-fetch-button";
import { BatchProcessButton } from "@/components/batch-process-button";
import { ExportToAzureButton } from "@/components/export-to-azure-button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getDashboardBreadcrumbs } from "@/lib/breadcrumb-utils";
import { UnifiedDocumentTable } from "@/components/unified-document-table";
import { RecentDocuments } from "@/components/recent-documents";

export const dynamic = "force-dynamic";

export default async function CollecctDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; perPage?: string; mode?: string }>;
}) {
  const supabase = createServiceRoleClient();
  const params = await searchParams;
  const activeTab = params.tab || "active";

  // Pagination params
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));
  const itemsPerPage = Math.min(50, Math.max(10, parseInt(params.perPage || "50", 10)));

  // Get independent counts for tabs
  const { count: activeCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .is("exported_at", null);

  const { count: archivedCount } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true })
    .not("exported_at", "is", null);

  // Fetch documents based on tab
  let documentsQuery = supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (activeTab === "archive") {
    documentsQuery = documentsQuery.not("exported_at", "is", null);
  } else {
    documentsQuery = documentsQuery.is("exported_at", null);
  }

  const { data: documents, error } = await documentsQuery;

  if (error) {
    console.error("Supabase query error:", error);
  }

  // All active (non-exported) documents for the unified table
  const activeDocs = activeTab === "active"
    ? documents?.filter(d => !d.exported_at) || []
    : [];

  // Exported docs for archive tab
  const exportedDocs = activeTab === "archive"
    ? documents || []
    : [];

  // Uploaded docs for batch processing
  const uploadedDocs = activeDocs.filter(d => d.status === "uploaded");
  const approvedDocs = activeDocs.filter(d => d.status === "approved");

  // Stats for cards
  const stats = {
    total: activeDocs.length,
    needsReview: activeDocs.filter(d => d.status === "needs_review").length,
    approved: activeDocs.filter(d => d.status === "approved").length,
    failed: activeDocs.filter(d => d.status === "error").length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Breadcrumbs */}
          <Breadcrumbs items={getDashboardBreadcrumbs()} className="mb-4" />

          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between mb-6">
            {/* Left: Back button */}
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Tillbaka</span>
            </Link>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-3">
              {activeTab === "active" && approvedDocs.length > 0 && (
                <ExportToAzureButton
                  selectedDocuments={approvedDocs.map(d => d.id)}
                />
              )}

              <Link
                href="/health"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium"
              >
                <Activity className="w-4 h-4" />
                <span>Health</span>
              </Link>

              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium"
              >
                <Settings className="w-4 h-4" />
                <span>Inställningar</span>
              </Link>

              <AutoFetchButton />
            </div>
          </div>

          {/* System Status */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-green-600 uppercase tracking-wider">
              SYSTEM ONLINE
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Collecct Review
          </h1>
          <p className="text-lg text-teal-600 italic font-medium mb-2">
            Dashboard
          </p>
          <p className="text-sm text-gray-600">
            Granska och godkänn dokument för Collecct AB.
          </p>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 mt-6">
            <a
              href="/collecct?tab=active"
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "active" || !activeTab
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Aktiva ({activeCount || 0})
            </a>
            <a
              href="/collecct?tab=archive"
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "archive"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Arkiverade ({archivedCount || 0})
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "active" ? (
          <div>
            {/* Batch Processing UI */}
            {uploadedDocs.length > 0 && (
              <BatchProcessButton uploadedDocs={uploadedDocs} />
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Total */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    TOTALT
                  </span>
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {stats.total}
                </div>
                <p className="text-xs text-gray-500">Dokument</p>
              </div>

              {/* Needs Review */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    BEHÖVER GRANSKNING
                  </span>
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {stats.needsReview}
                </div>
                <p className="text-xs text-yellow-600 font-medium">Väntar</p>
              </div>

              {/* Approved */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    GODKÄNDA
                  </span>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {stats.approved}
                </div>
                <p className="text-xs text-gray-500">Redo för export</p>
              </div>

              {/* Failed */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                    FEL
                  </span>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                </div>
                <div className="text-4xl font-bold text-gray-900 mb-1">
                  {stats.failed}
                </div>
                <p className="text-xs text-red-600 font-medium">Kräver åtgärd</p>
              </div>
            </div>

            {/* Unified Document Table - ONE table for ALL active documents */}
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Alla dokument
              </h2>
              <UnifiedDocumentTable
                documents={activeDocs}
                currentPage={currentPage}
                totalItems={activeDocs.length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </div>
        ) : (
          /* Archive Tab - keep separate for exported documents */
          <RecentDocuments
            documents={exportedDocs.slice(0, 50)}
            total={exportedDocs.length}
            activeTab={activeTab}
          />
        )}
      </div>
    </div>
  );
}
