import { createServiceRoleClient } from "@/lib/supabase";
import Link from "next/link";
import { FileText, CheckCircle2, AlertCircle, Activity, RefreshCw, ArrowLeft, Download, Settings, Home } from "lucide-react";
import { AutoFetchButton } from "@/components/auto-fetch-button";
import { BatchProcessButton } from "@/components/batch-process-button";
import { GranskaButton } from "@/components/granska-button";
import { ExportToAzureButton } from "@/components/export-to-azure-button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getDashboardBreadcrumbs } from "@/lib/breadcrumb-utils";
import { FilterSection } from "@/components/filter-section";
import { UndoExportButton } from "@/components/undo-export-button";
import { formatDate, formatDateTime } from "@/lib/time-utils";
import { RelativeTime } from "@/components/relative-time";
import { truncateFilename } from "@/lib/filename-utils";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

export default async function CollecctDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; perPage?: string }>;
}) {
  const supabase = createServiceRoleClient();
  const params = await searchParams;
  const activeTab = params.tab || "active";
  
  // Pagination params
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));
  const itemsPerPage = Math.min(50, Math.max(10, parseInt(params.perPage || "10", 10)));

  // Fetch documents - filter by tab
  let documentsQuery = supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  // Filter: Active tab shows non-exported, Archive tab shows exported
  if (activeTab === "archive") {
    documentsQuery = documentsQuery.not("exported_at", "is", null);
  } else {
    documentsQuery = documentsQuery.is("exported_at", null);
  }

  const { data: documents } = await documentsQuery;

  // Fetch paginated needs_review documents separately (only for active tab)
  let needsReviewDocs: any[] = [];
  let needsReviewTotal = 0;
  
  if (activeTab === "active") {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage - 1;
    
    // Get total count - removed exported_at filter since needs_review shouldn't be exported
    const { count } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "needs_review");
    
    needsReviewTotal = count || 0;
    
    // FALLBACK: Also check the main documents array in case count query missed some
    const needsReviewFromMain = documents?.filter(d => d.status === "needs_review") || [];
    if (needsReviewTotal === 0 && needsReviewFromMain.length > 0) {
      needsReviewTotal = needsReviewFromMain.length;
    }
    
    // Get paginated data - removed exported_at filter
    const { data: paginatedNeedsReview } = await supabase
      .from("documents")
      .select("*")
      .eq("status", "needs_review")
      .order("created_at", { ascending: true })
      .range(startIndex, endIndex);
    
    needsReviewDocs = paginatedNeedsReview || [];
    
    // FALLBACK: If paginated query returned empty but we have docs in main array, use those
    if (needsReviewDocs.length === 0 && needsReviewFromMain.length > 0) {
      needsReviewDocs = needsReviewFromMain.slice(startIndex, endIndex + 1);
    }
  }

  // Filter documents by status (only for active tab)
  const uploadedDocs = activeTab === "active" 
    ? documents?.filter(d => d.status === "uploaded") || []
    : [];
  const processingDocs = activeTab === "active"
    ? documents?.filter(d => d.status === "processing") || []
    : [];
  const approvedDocs = activeTab === "active"
    ? documents?.filter(d => d.status === "approved") || []
    : [];
  const failedDocs = activeTab === "active"
    ? documents?.filter(d => d.status === "error") || []
    : [];
  const exportedDocs = activeTab === "archive"
    ? documents?.filter(d => d.status === "exported") || []
    : [];

  const stats = {
    total: activeTab === "active" 
      ? (documents?.filter(d => !d.exported_at).length || 0)
      : (documents?.filter(d => d.exported_at).length || 0),
    uploaded: uploadedDocs.length,
    processing: processingDocs.length,
    needsReview: activeTab === "active" ? needsReviewTotal : 0,
    approved: approvedDocs.length,
    failed: failedDocs.length,
    exported: exportedDocs.length,
  };

  // Show documents based on active tab (max 10 for cleaner look)
  const recentDocs = activeTab === "archive"
    ? exportedDocs.slice(0, 10)
    : documents?.filter(d => d.status !== 'needs_review').slice(0, 10) || [];

  // Calculate quality metrics
  const avgCompleteness = documents && documents.length > 0
    ? documents
        .filter(d => d.extracted_data?._validation?.completeness)
        .reduce((sum, d) => sum + (d.extracted_data._validation.completeness || 0), 0) / 
        documents.filter(d => d.extracted_data?._validation?.completeness).length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Clean and Professional */}
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
              Aktiva ({documents?.filter(d => !d.exported_at).length || 0})
            </a>
            <a
              href="/collecct?tab=archive"
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "archive"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Arkiverade ({documents?.filter(d => d.exported_at).length || 0})
            </a>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Batch Processing UI */}
        {uploadedDocs.length > 0 && (
          <BatchProcessButton uploadedDocs={uploadedDocs} />
        )}
        
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

          {/* Needs Review - Clickable */}
          <a 
            href="#needs-review-section"
            className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer block"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                BEHÖVER GRANSKNING
              </span>
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900 mb-1">
              {stats.needsReview}
            </div>
            <p className="text-xs text-yellow-600 font-medium">Väntar - Klicka för att visa</p>
          </a>

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
            <p className="text-xs text-gray-500">
              {activeTab === "active" ? "Redo för export" : "Exporterade"}
            </p>
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

        {/* PRIORITY: Documents Needing Review - SHOW FIRST */}
        {activeTab === "active" && (
          <div id="needs-review-section" className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></span>
                Behöver granskning
              </h2>
              <p className="text-sm text-gray-500">
                {needsReviewTotal} dokument väntar
              </p>
            </div>

            {needsReviewDocs.length === 0 ? (
              <div className="bg-white rounded-lg border-2 border-dashed border-yellow-300 p-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-50 rounded-full mb-4">
                  <FileText className="w-8 h-8 text-yellow-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Inga dokument behöver granskning
                </h3>
                <p className="text-gray-600">
                  Alla dokument är granskade eller väntar på bearbetning.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {needsReviewDocs.map((doc) => {
                const validation = doc.extracted_data?._validation;
                const completeness = validation?.completeness || 100;
                const materialCount = doc.extracted_data?.lineItems?.length || doc.extracted_data?.rows?.length || 0;
                const totalWeight = doc.extracted_data?.totalWeightKg || 
                  (doc.extracted_data?.lineItems?.reduce((sum: number, item: any) => 
                    sum + (item.weightKg || 0), 0) || 0);

                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-lg border-2 border-yellow-300 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="p-5 border-b border-yellow-100 bg-yellow-50">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-yellow-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 
                            className="font-medium text-gray-900 text-sm truncate mb-1"
                            title={doc.filename}
                          >
                            {truncateFilename(doc.filename, 30)}
                          </h3>
                          <p className="text-xs text-gray-500" title={formatDate(doc.created_at)}>
                            <RelativeTime date={doc.created_at} />
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Material:</span>
                        <span className="font-medium text-gray-900">{materialCount} rader</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Total vikt:</span>
                        <span className="font-medium text-gray-900">
                          {totalWeight > 0 ? `${(totalWeight / 1000).toFixed(1)} ton` : '0 kg'}
                        </span>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600">Fullständighet:</span>
                          <span className={`font-medium ${
                            completeness >= 95 ? 'text-green-600' :
                            completeness >= 80 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {completeness.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              completeness >= 95 ? 'bg-green-500' :
                              completeness >= 80 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(completeness, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0">
                      <Link
                        href={`/review/${doc.id}`}
                        className="block w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                      >
                        Granska nu
                      </Link>
                    </div>
                  </div>
                );
                  })}
                </div>
                
                {/* Pagination */}
                {needsReviewTotal >= itemsPerPage && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(needsReviewTotal / itemsPerPage)}
                    totalItems={needsReviewTotal}
                    itemsPerPage={itemsPerPage}
                    onPageSizeChange={() => {}}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Senaste Dokument Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Senaste dokument
            </h2>
            <p className="text-sm text-gray-500">
              Visar {recentDocs.length} av {stats.total} dokument
            </p>
          </div>

          {recentDocs.length === 0 ? (
            <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-16 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-full mb-4">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {activeTab === "archive" 
                  ? "Inga arkiverade dokument ännu"
                  : "Inga dokument ännu"}
              </h3>
              <p className="text-gray-600 mb-6">
                {activeTab === "archive"
                  ? "Exporterade dokument visas här"
                  : "Börja med att synka dokument från Azure"}
              </p>
              {activeTab === "active" && <AutoFetchButton />}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentDocs.map((doc) => {
                const validation = doc.extracted_data?._validation;
                const completeness = validation?.completeness || 100;
                const isProcessed = doc.status !== 'uploaded';
                const materialCount = doc.extracted_data?.lineItems?.length || doc.extracted_data?.rows?.length || 0;
                const totalWeight = doc.extracted_data?.totalWeightKg || 
                  (doc.extracted_data?.lineItems?.reduce((sum: number, item: any) => 
                    sum + (item.weightKg || 0), 0) || 0);

                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {/* Document Header */}
                    <div className="p-5 border-b border-gray-100">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 
                              className="font-medium text-gray-900 text-sm truncate mb-1"
                              title={doc.filename}
                            >
                              {truncateFilename(doc.filename, 30)}
                            </h3>
                            <p className="text-xs text-gray-500" title={formatDate(doc.created_at)}>
                              <RelativeTime date={doc.created_at} />
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Status Badge */}
                          <div className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                            doc.status === 'uploaded' ? 'bg-blue-100 text-blue-800' :
                            doc.status === 'processing' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                            doc.status === 'needs_review' ? 'bg-yellow-100 text-yellow-800' :
                            doc.status === 'approved' ? 'bg-green-100 text-green-800' :
                            doc.status === 'exported' ? 'bg-purple-100 text-purple-800' :
                            doc.status === 'error' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {doc.status === 'uploaded' && 'Uppladdad'}
                            {doc.status === 'processing' && '🔄 Behandlar...'}
                            {doc.status === 'needs_review' && 'Behöver granskning'}
                            {doc.status === 'approved' && '✅ Godkänd'}
                            {doc.status === 'exported' && '📤 Exporterad'}
                            {doc.status === 'error' && '❌ Fel'}
                          </div>
                          {/* Delete Button - only show for non-exported documents */}
                          {doc.status !== 'exported' && (
                            <DeleteDocumentButton
                              documentId={doc.id}
                              storagePath={doc.storage_path}
                              filename={doc.filename}
                              variant="icon"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Document Stats */}
                    <div className="p-5 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Material:</span>
                        <span className="font-medium text-gray-900">
                          {isProcessed ? `${materialCount} rader` : 'Ej processad'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Total vikt:</span>
                        <span className="font-medium text-gray-900">
                          {isProcessed 
                            ? (totalWeight > 0 ? `${(totalWeight / 1000).toFixed(1)} ton` : '0 kg')
                            : '-'
                          }
                        </span>
                      </div>
                      
                      {/* Completeness Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600">Fullständighet:</span>
                          <span className={`font-medium ${
                            !isProcessed ? 'text-gray-400' :
                            completeness >= 95 ? 'text-green-600' :
                            completeness >= 80 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {isProcessed ? `${completeness.toFixed(0)}%` : '-'}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              !isProcessed ? 'bg-gray-300' :
                              completeness >= 95 ? 'bg-green-500' :
                              completeness >= 80 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: isProcessed ? `${completeness}%` : '0%' }}
                          />
                        </div>
                      </div>

                      {/* Validation Warnings */}
                      {validation && validation.issues && validation.issues.length > 0 && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-medium text-yellow-800 mb-1">
                                Varningar:
                              </p>
                              <ul className="text-xs text-yellow-700 space-y-1">
                                {validation.issues.slice(0, 2).map((issue: string, idx: number) => (
                                  <li key={idx} className="truncate">• {issue}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="p-5 pt-0">
                      {doc.status === 'uploaded' && (
                        <GranskaButton documentId={doc.id} filename={doc.filename} />
                      )}
                      {doc.status === 'processing' && (
                        <div className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-medium flex items-center justify-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Behandlar...
                        </div>
                      )}
                      {doc.status === 'needs_review' && (
                        <Link
                          href={`/review/${doc.id}`}
                          className="block w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                        >
                          Granska nu
                        </Link>
                      )}
                      {doc.status === 'approved' && (
                        <Link
                          href={`/review/${doc.id}`}
                          className="block w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                        >
                          Se detaljer
                        </Link>
                      )}
                      {doc.status === 'exported' && (
                        <div className="space-y-2">
                          <div className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg text-center">
                            <p className="text-xs text-purple-700 font-medium">📤 Exporterad</p>
                            {doc.exported_at && (
                              <p className="text-xs text-purple-600 mt-1" title={formatDateTime(doc.exported_at)}>
                                <RelativeTime date={doc.exported_at} />
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {doc.extracted_data?.azure_export_url && (
                              <a
                                href={doc.extracted_data.azure_export_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                              >
                                Öppna i Azure
                              </a>
                            )}
                            <UndoExportButton 
                              documentId={doc.id} 
                              filename={doc.filename}
                              variant="icon"
                            />
                          </div>
                        </div>
                      )}
                      {doc.status === 'error' && (
                        <Link
                          href={`/review/${doc.id}`}
                          className="block w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
                        >
                          Visa fel
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
