import { NextResponse } from "next/server";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";
import { createServiceRoleClient } from "@/lib/supabase";
import { uploadAndEnqueueDocument } from "@/app/actions";
import { sanitizeFilename } from "@/lib/sanitize-filename";

/**
 * Workflow Sync Endpoint
 * Fetches files from Azure failed folders and processes them
 * Matches Python workflow_manager.py functionality
 */
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

    const connector = new AzureBlobConnector(connectionString, containerName);
    const failedFiles = await connector.listFailedFiles();

    if (failedFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No failed files to process",
        processed: 0,
      });
    }

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
        // Download file (use source_folder as container name)
        const buffer = await connector.downloadFile(fileInfo.full_path, fileInfo.source_folder);

        // Create a File object for uploadAndEnqueueDocument
        const file = new File([buffer], fileInfo.name, {
          type: fileInfo.content_type || "application/pdf",
        });

        // Upload to Supabase and enqueue for processing
        // Note: This requires modifying uploadAndEnqueueDocument to accept File objects
        // For now, we'll create a document record directly
        const sanitizedName = sanitizeFilename(fileInfo.name);
        const storagePath = `azure-sync/${sanitizedName}`;
        
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .insert({
            filename: fileInfo.name,
            status: "uploaded",
            storage_path: storagePath,
            extracted_data: {
              source: "azure_failed",
              original_blob_path: fileInfo.full_path,
              source_folder: fileInfo.source_folder,
            },
          })
          .select()
          .single();

        if (docError) {
          console.error(`Error creating document for ${fileInfo.name}:`, docError);
          results.errors++;
          continue;
        }

        // Upload file to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from("raw_documents")
          .upload(storagePath, buffer, {
            contentType: fileInfo.content_type || "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Error uploading ${fileInfo.name}:`, uploadError);
          results.errors++;
          continue;
        }

        // Enqueue for processing
        await supabase.from("processing_jobs").insert({
          document_id: doc.id,
          status: "queued",
        });

        results.processed++;
        results.files.push({
          filename: fileInfo.name,
          status: "queued",
          documentId: doc.id,
        });
      } catch (error: any) {
        console.error(`Error processing ${fileInfo.name}:`, error);
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
    console.error("Error in workflow sync:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync workflow" },
      { status: 500 }
    );
  }
}

