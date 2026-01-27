import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { ExcelCreator } from "@/lib/excel-creator";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";

export async function POST(req: NextRequest) {
  try {
    const { documentIds } = await req.json();

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json({ error: "No documents selected" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      return NextResponse.json({ error: "Azure connection string not configured" }, { status: 500 });
    }

    const azureConnector = new AzureBlobConnector(connectionString, "arrivalwastedata");
    const excelCreator = new ExcelCreator();

    const results = {
      success: [] as Array<{ id: string; filename: string }>,
      failed: [] as Array<{ id: string; error: string }>,
    };

    // Process each document
    for (const docId of documentIds) {
      try {
        // Fetch document
        const { data: document, error: fetchError } = await supabase
          .from("documents")
          .select("*")
          .eq("id", docId)
          .single();

        if (fetchError || !document) {
          results.failed.push({ id: docId, error: "Document not found" });
          continue;
        }

        // Convert to Excel
        const rows = excelCreator.convertWasteRecordToExcelRows(
          document.extracted_data,
          document.filename
        );

        const excelBuffer = excelCreator.createExcel(rows, document.filename);

        // Upload to Azure
        const outputFilename = document.filename.replace(/\.(pdf|xlsx|xls|csv|png|jpg|jpeg)$/i, ".xlsx");
        const azureUrl = await azureConnector.uploadToCompleted(outputFilename, excelBuffer);

        // Update status
        await supabase
          .from("documents")
          .update({
            status: "approved",
            extracted_data: {
              ...document.extracted_data,
              azure_output_url: azureUrl,
              approved_at: new Date().toISOString(),
            }
          })
          .eq("id", docId);

        // Clean up - use azure_original_filename (full blob path) or fallback to original_blob_path
        const blobPathToDelete = document.azure_original_filename || document.extracted_data?.original_blob_path;
        if (document.source_container && blobPathToDelete) {
          try {
            await azureConnector.deleteFromInput(document.source_container, blobPathToDelete);
          } catch (deleteError) {
            console.error("Error deleting from input:", deleteError);
            // Don't fail the request if deletion fails
          }
        }

        results.success.push({ id: docId, filename: document.filename });
      } catch (error: any) {
        results.failed.push({ id: docId, error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Approved ${results.success.length}/${documentIds.length} documents`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

