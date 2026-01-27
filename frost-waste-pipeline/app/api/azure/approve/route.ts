import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { ExcelCreator } from "@/lib/excel-creator";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: "Document ID required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 1. Fetch document from Supabase
    const { data: document, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (fetchError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 2. Parse extracted data
    const extractedData = document.extracted_data;
    const originalFilename = document.filename;

    // 3. Convert to Excel rows (one row per material)
    const excelCreator = new ExcelCreator();
    const rows = excelCreator.convertWasteRecordToExcelRows(extractedData, originalFilename);

    // 4. Create Excel file
    const excelBuffer = excelCreator.createExcel(rows, originalFilename);

    // 5. Upload to Azure "completed" container
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      return NextResponse.json({ error: "Azure connection string not configured" }, { status: 500 });
    }

    const azureConnector = new AzureBlobConnector(connectionString, "arrivalwastedata");
    const outputFilename = originalFilename.replace(/\.(pdf|xlsx|xls|csv|png|jpg|jpeg)$/i, ".xlsx");
    
    const azureUrl = await azureConnector.uploadToCompleted(
      outputFilename,
      excelBuffer
    );

    // 6. Update document status in Supabase
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        status: "approved",
        extracted_data: {
          ...extractedData,
          azure_output_url: azureUrl,
          approved_at: new Date().toISOString()
        }
      })
      .eq("id", documentId);

    if (updateError) {
      console.error("Error updating document:", updateError);
    }

    // 7. Optional: Delete from input container (clean up)
    // Use azure_original_filename (full blob path) or fallback to original_blob_path
    const blobPathToDelete = document.azure_original_filename || document.extracted_data?.original_blob_path;
    if (document.source_container && blobPathToDelete) {
      try {
        await azureConnector.deleteFromInput(
          document.source_container, 
          blobPathToDelete
        );
      } catch (deleteError) {
        console.error("Error deleting from input:", deleteError);
        // Don't fail the request if deletion fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Document approved and uploaded to Azure",
      azureUrl,
      rows: rows.length
    });

  } catch (error: any) {
    console.error("Error approving document:", error);
    return NextResponse.json(
      { error: error.message || "Failed to approve document" },
      { status: 500 }
    );
  }
}
