// app/api/documents/undo-export/route.ts
// Reverts an exported document back to approved status

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { documentId } = await request.json();
    
    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }
    
    console.log(`↩️  Undoing export for document: ${documentId}`);
    
    const supabase = createServiceRoleClient();
    
    // Get the document
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    
    if (fetchError || !doc) {
      throw new Error(`Document not found: ${fetchError?.message || "Unknown error"}`);
    }
    
    if (doc.status !== "exported") {
      return NextResponse.json(
        { error: `Document is not exported (current status: ${doc.status})` },
        { status: 400 }
      );
    }
    
    console.log(`   Found document: ${doc.filename}`);
    console.log(`   Exported at: ${doc.exported_at}`);
    
    // Revert to approved status
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        status: "approved",
        exported_at: null,
        extracted_data: {
          ...doc.extracted_data,
          // Keep track of undo history
          _undo_history: [
            ...(doc.extracted_data?._undo_history || []),
            {
              action: "undo_export",
              previous_exported_at: doc.exported_at,
              previous_azure_url: doc.extracted_data?.azure_export_url,
              undone_at: new Date().toISOString(),
            }
          ],
          // Remove export-related fields
          azure_export_url: null,
          exported_at: null,
        }
      })
      .eq("id", documentId);
    
    if (updateError) {
      throw new Error(`Failed to update document: ${updateError.message}`);
    }
    
    console.log(`✅ Successfully reverted document to approved status`);
    
    // Note: We don't delete from Azure "completed" container automatically
    // because that could be dangerous. The file stays there but can be re-exported.
    
    return NextResponse.json({
      success: true,
      message: "Export har ångrats. Dokumentet är nu godkänt igen.",
      documentId,
      filename: doc.filename,
      note: "Filen finns kvar i Azure 'completed' container och kan behöva raderas manuellt om den inte ska finnas där.",
    });
    
  } catch (error: any) {
    console.error("❌ Undo export failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to undo export" },
      { status: 500 }
    );
  }
}

