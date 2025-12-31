/**
 * Manual Auto-Fetch Trigger
 * Allows manual triggering of the auto-fetcher
 * Useful for testing or immediate sync
 */

import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";
import { createServiceRoleClient } from "@/lib/supabase";
import { sanitizeFilename } from "@/lib/sanitize-filename";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

export async function POST() {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_CONTAINER_NAME || "arrivalwastedata";

    if (!connectionString) {
      return NextResponse.json(
        { error: "Azure connection string not configured" },
        { status: 500 }
      );
    }

    console.log("🔍 Manual auto-fetch: Checking for failed files...");

    const connector = new AzureBlobConnector(connectionString, containerName);
    const failedFiles = await connector.listFailedFiles();

    if (failedFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed files found",
        processed: 0,
      });
    }

    console.log(`📦 Manual auto-fetch: Found ${failedFiles.length} failed files`);

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
        console.log(`📄 Manual auto-fetch: Processing ${fileInfo.name}`);

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
          console.error(`❌ Manual auto-fetch: Upload failed for ${fileInfo.name}:`, uploadError);
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
              source: "azure_auto_fetch_manual",
              original_blob_path: fileInfo.full_path,
              source_folder: fileInfo.source_folder,
              auto_fetched_at: new Date().toISOString(),
            },
          })
          .select()
          .single();

        if (docError) {
          console.error(`❌ Manual auto-fetch: Document creation failed for ${fileInfo.name}:`, docError);
          results.errors++;
          continue;
        }

        // Enqueue for processing
        await supabase.from("processing_jobs").insert({
          document_id: doc.id,
          status: "queued",
        });

        console.log(`✅ Manual auto-fetch: Queued ${fileInfo.name} for processing (doc: ${doc.id})`);

        results.processed++;
        results.files.push({
          filename: fileInfo.name,
          status: "queued",
          documentId: doc.id,
        });
      } catch (error: any) {
        console.error(`❌ Manual auto-fetch: Error processing ${fileInfo.name}:`, error);
        results.errors++;
        results.files.push({
          filename: fileInfo.name,
          status: "error",
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} of ${results.total} files`,
      ...results,
    });
  } catch (error: any) {
    console.error("❌ Manual auto-fetch: Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to run auto-fetch" },
      { status: 500 }
    );
  }
}

