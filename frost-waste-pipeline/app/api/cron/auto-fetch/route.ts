/**
 * Auto-Fetcher Cron Job
 * Runs periodically to check Azure Blob Storage for failed files
 * Matches Python auto_fetcher_service.py functionality
 * 
 * Configure in Vercel: Add cron job in vercel.json
 * Or use external cron service to call this endpoint
 */

import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";
import { createServiceRoleClient } from "@/lib/supabase";
import { processDocument } from "@/app/actions";
import { sanitizeFilename } from "@/lib/sanitize-filename";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

export async function GET(request: Request) {
  // Verify cron secret (if using Vercel Cron)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || "arrivalwastedata";

    if (!connectionString) {
      return NextResponse.json(
        { error: "Azure connection string not configured" },
        { status: 500 }
      );
    }

    console.log("🔍 Auto-fetcher: Checking for failed files...");

    const supabase = createServiceRoleClient();
    
    // Fetch folder settings from database
    const { data: settings } = await supabase
      .from("settings")
      .select("azure_input_folders")
      .eq("user_id", "default")
      .single();

    const inputFolders = settings?.azure_input_folders;
    
    if (inputFolders) {
      console.log(`📁 Auto-fetcher: Using configured input folders:`, inputFolders.map((f: any) => f.folder ? `${f.container}/${f.folder}` : f.container).join(", "));
    }

    const connector = new AzureBlobConnector(connectionString, containerName);
    const failedFiles = await connector.listFailedFiles(inputFolders);

    if (failedFiles.length === 0) {
      console.log("✅ Auto-fetcher: No failed files found");
      return NextResponse.json({
        success: true,
        message: "No failed files found",
        processed: 0,
      });
    }

    console.log(`📦 Auto-fetcher: Found ${failedFiles.length} failed files`);

    const supabase = createServiceRoleClient();
    const results = {
      total: failedFiles.length,
      processed: 0,
      errors: 0,
      files: [] as any[],
    };

    // Process each file
    for (const fileInfo of failedFiles) {
      try {
        console.log(`📄 Auto-fetcher: Processing ${fileInfo.name}`);

        // Download file (use source_folder as container name)
        const buffer = await connector.downloadFile(fileInfo.full_path, fileInfo.source_folder);

        // Upload to Supabase storage
        const sanitizedName = sanitizeFilename(fileInfo.name);
        const storagePath = `azure-auto-fetch/${Date.now()}-${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from("raw_documents")
          .upload(storagePath, buffer, {
            contentType: fileInfo.content_type || "application/pdf",
            upsert: false,
          });

        if (uploadError) {
          console.error(`❌ Auto-fetcher: Upload failed for ${fileInfo.name}:`, uploadError);
          results.errors++;
          continue;
        }

        // Create document record with Azure filename tracking
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            filename: fileInfo.name,
            status: "uploaded",
            storage_path: storagePath,
            azure_original_filename: fileInfo.name, // Track original Azure filename for safe cleanup
            source_container: fileInfo.source_folder || (fileInfo.name.endsWith('.pdf') ? 'unsupported-file-format' : 'unable-to-process'), // Track source container
            extracted_data: {
              source: "azure_auto_fetch",
              original_blob_path: fileInfo.full_path,
              source_folder: fileInfo.source_folder,
              auto_fetched_at: new Date().toISOString(),
            },
          })
          .select()
          .single();

        if (docError) {
          console.error(`❌ Auto-fetcher: Document creation failed for ${fileInfo.name}:`, docError);
          results.errors++;
          continue;
        }

        // Enqueue for processing
        await supabase.from("processing_jobs").insert({
          document_id: doc.id,
          status: "queued",
        });

        console.log(`✅ Auto-fetcher: Queued ${fileInfo.name} for processing (doc: ${doc.id})`);

        results.processed++;
        results.files.push({
          filename: fileInfo.name,
          status: "queued",
          documentId: doc.id,
        });
      } catch (error: any) {
        console.error(`❌ Auto-fetcher: Error processing ${fileInfo.name}:`, error);
        results.errors++;
        results.files.push({
          filename: fileInfo.name,
          status: "error",
          error: error.message,
        });
      }
    }

    console.log(
      `📊 Auto-fetcher: Batch complete - Processed: ${results.processed}, Errors: ${results.errors}`
    );

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} of ${results.total} files`,
      ...results,
    });
  } catch (error: any) {
    console.error("❌ Auto-fetcher: Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run auto-fetcher" },
      { status: 500 }
    );
  }
}

