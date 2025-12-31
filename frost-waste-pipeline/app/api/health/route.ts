import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceRoleClient();
  const startTime = Date.now();

  try {
    // 1. Check Supabase connection
    const { data: dbTest, error: dbError } = await supabase
      .from("documents")
      .select("count")
      .limit(1);

    const supabaseStatus = dbError ? "error" : "ok";

    // 2. Check Azure Blob connection
    let azureStatus = "ok";
    let azureFiles = 0;
    try {
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      if (connectionString) {
        const azureConnector = new AzureBlobConnector(connectionString, "arrivalwastedata");
        const files = await azureConnector.fetchFilesFromInput();
        azureFiles = files.length;
      } else {
        azureStatus = "not_configured";
      }
    } catch (error) {
      azureStatus = "error";
    }

    // 3. Get processing stats (last 24 hours)
    const { data: documents } = await supabase
      .from("documents")
      .select("status, created_at, extracted_data")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const stats = {
      total: documents?.length || 0,
      uploaded: documents?.filter(d => d.status === "uploaded").length || 0,
      processing: documents?.filter(d => d.status === "processing").length || 0,
      needs_review: documents?.filter(d => d.status === "needs_review").length || 0,
      approved: documents?.filter(d => d.status === "approved").length || 0,
      error: documents?.filter(d => d.status === "error").length || 0,
    };

    // 4. Calculate success rate (approved + needs_review = successfully processed)
    const processedDocs = documents?.filter(d => 
      d.status === "needs_review" || d.status === "approved"
    ) || [];
    
    const successRate = stats.total > 0 
      ? ((processedDocs.length / stats.total) * 100).toFixed(1)
      : "100";

    // 5. Calculate average extraction quality
    const qualityScores = processedDocs
      .map(d => d.extracted_data?._validation?.completeness || 0)
      .filter(s => s > 0);
    
    const avgQuality = qualityScores.length > 0
      ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1)
      : "0";

    // 6. Get processing jobs status (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Get uploaded docs in last hour (queued for processing)
    const { data: queuedDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("status", "uploaded")
      .gte("created_at", oneHourAgo);
    
    // Get currently processing docs
    const { data: processingDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("status", "processing")
      .gte("created_at", oneHourAgo);
    
    // Get succeeded docs (approved or needs_review in last hour)
    const { data: succeededDocs } = await supabase
      .from("documents")
      .select("id")
      .in("status", ["approved", "needs_review"])
      .gte("created_at", oneHourAgo);
    
    // Get failed docs in last hour
    const { data: failedDocs } = await supabase
      .from("documents")
      .select("id")
      .eq("status", "error")
      .gte("created_at", oneHourAgo);

    const jobStats = {
      queued: queuedDocs?.length || 0,
      processing: processingDocs?.length || 0,
      succeeded: succeededDocs?.length || 0,
      failed: failedDocs?.length || 0,
    };

    // 7. Response time
    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        supabase: {
          status: supabaseStatus,
          responseTime: `${responseTime}ms`,
        },
        azure: {
          status: azureStatus,
          filesInQueue: azureFiles,
        },
        claude: {
          status: "ok", // Assume ok if we got here
        },
      },
      stats: {
        last24Hours: stats,
        successRate: `${successRate}%`, // Keep the % here for display
        avgQuality: `${avgQuality}%`,   // Keep the % here for display
      },
      jobs: jobStats,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
