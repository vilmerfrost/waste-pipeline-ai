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

    console.log("\n" + "=".repeat(60));
    console.log("🔍 AUTO-FETCHER: Starting scheduled scan...");
    console.log("=".repeat(60));
    console.log(`📅 Time: ${new Date().toISOString()}`);
    console.log(`📦 Default container: ${containerName}`);

    const supabasedbclient = createServiceRoleClient();
    
    // Fetch folder settings from database
    const { data: settings, error: settingsError } = await supabasedbclient
      .from("settings")
      .select("azure_input_folders")
      .eq("user_id", "default")
      .single();

    if (settingsError) {
      console.warn(`⚠️ Could not fetch settings: ${settingsError.message}`);
    }

    const inputFolders = settings?.azure_input_folders;
    
    if (inputFolders && Array.isArray(inputFolders) && inputFolders.length > 0) {
      const enabledFolders = inputFolders.filter((f: any) => f.enabled !== false);
      console.log(`\n📁 Configured input folders (${enabledFolders.length} enabled):`);
      enabledFolders.forEach((f: any, i: number) => {
        const path = f.folder ? `${f.container}/${f.folder}` : f.container;
        console.log(`   ${i + 1}. ${path}`);
      });
    } else {
      console.log("\n⚠️ No input folders configured!");
      console.log("   Please configure folders in Settings → Azure & GUIDs");
      return NextResponse.json({
        success: true,
        message: "No input folders configured",
        processed: 0,
      });
    }

    console.log("\n🔎 Scanning for files...");
    const connector = new AzureBlobConnector(connectionString, containerName);
    const failedFiles = await connector.listFailedFiles(inputFolders);

    if (failedFiles.length === 0) {
      console.log("\n" + "=".repeat(60));
      console.log("✅ AUTO-FETCHER: Complete - No files to process");
      console.log("=".repeat(60) + "\n");
      return NextResponse.json({
        success: true,
        message: "No files found in configured folders",
        processed: 0,
      });
    }

    console.log(`\n📦 Found ${failedFiles.length} file(s) to process:`);
    failedFiles.slice(0, 10).forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.name} (${(f.size / 1024).toFixed(1)} KB)`);
    });
    if (failedFiles.length > 10) {
      console.log(`   ... and ${failedFiles.length - 10} more`);
    }
    console.log("");

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
        const { error: uploadError } = await supabasedbclient.storage
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
        const { data: doc, error: docError } = await supabasedbclient
          .from("documents")
          .insert({
            filename: fileInfo.name,
            status: "uploaded",
            storage_path: storagePath,
            azure_original_filename: fileInfo.full_path, // Track FULL blob path for safe cleanup (includes folder!)
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
        await supabasedbclient.from("processing_jobs").insert({
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

    console.log("\n" + "=".repeat(60));
    console.log(`✅ AUTO-FETCHER: Batch complete`);
    console.log(`   📊 Total files: ${results.total}`);
    console.log(`   ✅ Processed: ${results.processed}`);
    console.log(`   ❌ Errors: ${results.errors}`);
    console.log("=".repeat(60) + "\n");

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} of ${results.total} files`,
      ...results,
    });
  } catch (error: any) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ AUTO-FETCHER: Fatal error");
    console.error(`   ${error?.message || error}`);
    console.error("=".repeat(60) + "\n");
    return NextResponse.json(
      { error: error.message || "Failed to run auto-fetcher" },
      { status: 500 }
    );
  }
}

