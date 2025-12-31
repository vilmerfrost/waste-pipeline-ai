import { createServiceRoleClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { documentIds } = await req.json();
    
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: "Document IDs array required" },
        { status: 400 }
      );
    }
    
    console.log(`📦 Batch processing requested for ${documentIds.length} documents`);
    
    const supabase = createServiceRoleClient();
    
    // Verify all documents exist and are in uploaded status
    const { data: docs, error: fetchError } = await supabase
      .from("documents")
      .select("id, status")
      .in("id", documentIds);
    
    if (fetchError) {
      console.error("Failed to fetch documents:", fetchError);
      throw fetchError;
    }
    
    const validDocs = docs?.filter(d => d.status === "uploaded") || [];
    
    if (validDocs.length === 0) {
      return NextResponse.json(
        { error: "No documents in 'uploaded' status found" },
        { status: 400 }
      );
    }
    
    const validIds = validDocs.map(d => d.id);
    
    // Update all to processing status
    const { error: updateError } = await supabase
      .from("documents")
      .update({ 
        status: "processing",
        updated_at: new Date().toISOString()
      })
      .in("id", validIds);
    
    if (updateError) {
      console.error("Failed to update batch status:", updateError);
      throw updateError;
    }
    
    // Create processing jobs for all documents
    const jobs = validIds.map(id => ({
      document_id: id,
      status: "queued",
      created_at: new Date().toISOString()
    }));
    
    const { error: jobError } = await supabase
      .from("processing_jobs")
      .insert(jobs);
    
    if (jobError) {
      console.error("Failed to create processing jobs:", jobError);
      // Don't throw - status is already updated
    }
    
    console.log(`✓ ${validIds.length} documents marked as 'processing'`);
    
    // Trigger processing in background (sequential with delay)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    
    // Process each document sequentially (with small delay)
    // 🔧 FIX: Pass document ID to /api/process
    (async () => {
      for (let i = 0; i < validIds.length; i++) {
        const docId = validIds[i];
        console.log(`📊 Triggering processing ${i + 1}/${validIds.length} (${docId})`);
        
        // ✅ FIXED: Added ?id=${docId} to pass document ID!
        await fetch(`${baseUrl}/api/process?id=${docId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json"
          }
        }).catch(err => console.error(`Failed to trigger process ${i + 1}:`, err));
        
        // Small delay between documents (1 second)
        if (i < validIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`✓ Batch processing triggers sent for all ${validIds.length} documents`);
    })();
    
    return NextResponse.json({ 
      success: true,
      message: `Processing started for ${validIds.length} documents`,
      count: validIds.length,
      documentIds: validIds
    });
    
  } catch (error: any) {
    console.error("Batch process error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start batch processing" },
      { status: 500 }
    );
  }
}

