// app/api/documents/delete-archived/route.ts
// Deletes all exported/archived documents from the database

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    
    // First, get count of archived documents
    const { count, error: countError } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "exported")
      .not("exported_at", "is", null);
    
    if (countError) {
      throw new Error(`Failed to count documents: ${countError.message}`);
    }
    
    if (!count || count === 0) {
      return NextResponse.json({
        success: true,
        message: "Inga arkiverade dokument att radera",
        deletedCount: 0,
      });
    }
    
    console.log(`🗑️  Deleting ${count} archived documents...`);
    
    // Get the documents to delete (for logging/audit)
    const { data: docsToDelete, error: fetchError } = await supabase
      .from("documents")
      .select("id, filename, exported_at")
      .eq("status", "exported")
      .not("exported_at", "is", null);
    
    if (fetchError) {
      throw new Error(`Failed to fetch documents: ${fetchError.message}`);
    }
    
    // Log what we're deleting
    console.log("Documents to delete:");
    docsToDelete?.forEach(doc => {
      console.log(`  - ${doc.filename} (exported: ${doc.exported_at})`);
    });
    
    // Delete from Supabase storage first (if files exist)
    const storageErrors: string[] = [];
    for (const doc of docsToDelete || []) {
      try {
        // Try to delete from storage bucket
        const { error: storageError } = await supabase
          .storage
          .from("raw_documents")
          .remove([`${doc.id}`]);
        
        if (storageError) {
          // Log but don't fail - file might not exist
          console.warn(`  ⚠️  Storage cleanup warning for ${doc.filename}:`, storageError.message);
          storageErrors.push(doc.filename);
        }
      } catch (e: any) {
        console.warn(`  ⚠️  Storage error for ${doc.filename}:`, e.message);
      }
    }
    
    // Delete from database
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("status", "exported")
      .not("exported_at", "is", null);
    
    if (deleteError) {
      throw new Error(`Failed to delete documents: ${deleteError.message}`);
    }
    
    console.log(`✅ Successfully deleted ${count} archived documents`);
    
    return NextResponse.json({
      success: true,
      message: `${count} arkiverade dokument har raderats`,
      deletedCount: count,
      storageWarnings: storageErrors.length > 0 ? storageErrors : undefined,
    });
    
  } catch (error: any) {
    console.error("❌ Delete archived failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete archived documents" },
      { status: 500 }
    );
  }
}

// Also support POST for clients that don't support DELETE
export async function POST(request: NextRequest) {
  return DELETE(request);
}

