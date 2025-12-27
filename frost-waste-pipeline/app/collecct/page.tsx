import { createServiceRoleClient } from "@/lib/supabase";
import Link from "next/link";
import { FileText, CheckCircle2, AlertCircle, Activity, RefreshCw, ArrowLeft, Download, Settings } from "lucide-react";
import { AutoFetchButton } from "@/components/auto-fetch-button";
import { BatchProcessButton } from "@/components/batch-process-button";
import { GranskaButton } from "@/components/granska-button";

export const dynamic = "force-dynamic";

export default async function CollecctDashboard() {
  const supabase = createServiceRoleClient();

  // Fetch documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  // Filter documents by status
  const uploadedDocs = documents?.filter(d => d.status === "uploaded") || [];
  const processingDocs = documents?.filter(d => d.status === "processing") || [];
  const needsReviewDocs = documents?.filter(d => d.status === "needs_review") || [];
  const approvedDocs = documents?.filter(d => d.status === "approved") || [];
  const failedDocs = documents?.filter(d => d.status === "error") || [];

  const stats = {
    total: documents?.length || 0,
    uploaded: uploadedDocs.length,
    processing: processingDocs.length,
    needsReview: needsReviewDocs.length,
    approved: approvedDocs.length,
    failed: failedDocs.length,
  };

  const recentDocs = documents?.slice(0, 3) || [];

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
              <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <Download className="w-4 h-4" />
                <span>Ladda ner</span>
              </button>
              
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
              {stats.total > 0 ? `${Math.round((stats.approved / stats.total) * 100)}%` : '0%'}
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
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Inga dokument än
              </h3>
              <p className="text-sm text-gray-500">
                Synka från Azure för att ladda dokument
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentDocs.map((doc) => {
                const validation = doc.extracted_data?._validation;
                const completeness = validation?.completeness || 100;
                const materialCount = doc.extracted_data?.lineItems?.length || doc.extracted_data?.rows?.length || 0;
                // Calculate weight from lineItems if totalWeightKg is missing
                const totalWeight = doc.extracted_data?.totalWeightKg || 
                  (doc.extracted_data?.lineItems?.reduce((sum: number, item: any) => 
                    sum + (item.weightKg || 0), 0) || 0);
                
                // Status color
                let statusColor = "gray";
                let statusText = "Laddat upp";
                if (doc.status === "needs_review") {
                  statusColor = "yellow";
                  statusText = "Väntar";
                } else if (doc.status === "approved") {
                  statusColor = "green";
                  statusText = "Godkänd";
                } else if (doc.status === "error") {
                  statusColor = "red";
                  statusText = "Fel";
                }

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
                            <h3 className="font-medium text-gray-900 text-sm truncate mb-1">
                              {doc.filename.length > 25 
                                ? `${doc.filename.substring(0, 25)}...`
                                : doc.filename
                              }
                            </h3>
                            <p className="text-xs text-gray-500">
                              {new Date(doc.created_at).toLocaleDateString('sv-SE', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                        {/* Status Badge */}
                        <div className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                          doc.status === 'uploaded' ? 'bg-blue-100 text-blue-800' :
                          doc.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                          doc.status === 'needs_review' ? 'bg-orange-100 text-orange-800' :
                          doc.status === 'approved' ? 'bg-green-100 text-green-800' :
                          doc.status === 'error' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {doc.status === 'uploaded' && '🔵 Uppladdad'}
                          {doc.status === 'processing' && '🟡 Behandlar...'}
                          {doc.status === 'needs_review' && '🟠 Behöver granskning'}
                          {doc.status === 'approved' && '🟢 Godkänd'}
                          {doc.status === 'error' && '🔴 Fel'}
                        </div>
                      </div>
                    </div>

                    {/* Document Stats */}
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
                      
                      {/* Completeness Bar */}
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
                            style={{ width: `${completeness}%` }}
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
                        <GranskaButton documentId={doc.id} />
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

        {/* All Documents Needing Review */}
        {needsReviewDocs.length > 0 && (
          <div id="needs-review-section" className="scroll-mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Behöver granskning
              </h2>
              <p className="text-sm text-gray-500">
                {needsReviewDocs.length} dokument väntar
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {needsReviewDocs.map((doc) => {
                const validation = doc.extracted_data?._validation;
                const completeness = validation?.completeness || 100;
                const materialCount = doc.extracted_data?.lineItems?.length || doc.extracted_data?.rows?.length || 0;
                // Calculate weight from lineItems if totalWeightKg is missing
                const totalWeight = doc.extracted_data?.totalWeightKg || 
                  (doc.extracted_data?.lineItems?.reduce((sum: number, item: any) => 
                    sum + (item.weightKg || 0), 0) || 0);

                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="p-5 border-b border-gray-100">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 text-sm truncate mb-1">
                            {doc.filename.length > 25 
                              ? `${doc.filename.substring(0, 25)}...`
                              : doc.filename
                            }
                          </h3>
                          <p className="text-xs text-gray-500">
                            {new Date(doc.created_at).toLocaleDateString('sv-SE', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit'
                            })}
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
                            style={{ width: `${completeness}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0">
                      {doc.status === 'uploaded' && (
                        <GranskaButton documentId={doc.id} />
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
          </div>
        )}
      </div>
    </div>
  );
}
