import { CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getHealthData() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000';
  
  const response = await fetch(`${baseUrl}/api/health`, {
    cache: "no-store",
  });
  return response.json();
}

export default async function HealthDashboard() {
  const health = await getHealthData();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/collecct"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Tillbaka</span>
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">System Health</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Last updated: {new Date(health.timestamp).toLocaleString('sv-SE')}
                </p>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-full text-sm font-medium ${
              health.status === "healthy" 
                ? "bg-green-100 text-green-800" 
                : "bg-red-100 text-red-800"
            }`}>
              {health.status === "healthy" ? "✅ Healthy" : "❌ Issues Detected"}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Services Status */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Supabase */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Supabase</h3>
                {health.services.supabase.status === "ok" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div className="text-sm text-gray-600">
                Response time: <span className="font-medium">{health.services.supabase.responseTime}</span>
              </div>
            </div>

            {/* Azure Blob */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Azure Blob</h3>
                {health.services.azure.status === "ok" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div className="text-sm text-gray-600">
                Files in queue: <span className="font-medium">{health.services.azure.filesInQueue}</span>
              </div>
            </div>

            {/* Claude API */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-gray-900">Claude API</h3>
                {health.services.claude.status === "ok" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div className="text-sm text-gray-600">
                Status: <span className="font-medium">Operational</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Last 24 Hours</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-3xl font-bold text-gray-900">
                {health.stats.last24Hours.total}
              </div>
              <div className="text-sm text-gray-600 mt-1">Total Documents</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-3xl font-bold text-green-600">
                {health.stats.successRate}
              </div>
              <div className="text-sm text-gray-600 mt-1">Success Rate</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-3xl font-bold text-blue-600">
                {health.stats.avgQuality}
              </div>
              <div className="text-sm text-gray-600 mt-1">Avg Quality</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-3xl font-bold text-red-600">
                {health.stats.last24Hours.error}
              </div>
              <div className="text-sm text-gray-600 mt-1">Errors</div>
            </div>
          </div>
        </div>

        {/* Document Status Breakdown */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Status</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="space-y-4">
              <StatusBar
                label="Uploaded"
                count={health.stats.last24Hours.uploaded}
                total={health.stats.last24Hours.total}
                color="blue"
              />
              <StatusBar
                label="Processing"
                count={health.stats.last24Hours.processing}
                total={health.stats.last24Hours.total}
                color="yellow"
              />
              <StatusBar
                label="Needs Review"
                count={health.stats.last24Hours.needs_review}
                total={health.stats.last24Hours.total}
                color="orange"
              />
              <StatusBar
                label="Approved"
                count={health.stats.last24Hours.approved}
                total={health.stats.last24Hours.total}
                color="green"
              />
              <StatusBar
                label="Error"
                count={health.stats.last24Hours.error}
                total={health.stats.last24Hours.total}
                color="red"
              />
            </div>
          </div>
        </div>

        {/* Processing Jobs */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Processing Jobs (Last Hour)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-600">{health.jobs.queued}</div>
              <div className="text-xs text-gray-500 mt-1">Queued</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-blue-600">{health.jobs.processing}</div>
              <div className="text-xs text-gray-500 mt-1">Processing</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-green-600">{health.jobs.succeeded}</div>
              <div className="text-xs text-gray-500 mt-1">Succeeded</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-2xl font-bold text-red-600">{health.jobs.failed}</div>
              <div className="text-xs text-gray-500 mt-1">Failed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ 
  label, 
  count, 
  total, 
  color 
}: { 
  label: string; 
  count: number; 
  total: number; 
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  
  const colorClasses = {
    blue: "bg-blue-500",
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    green: "bg-green-500",
    red: "bg-red-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">
          {count} ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
