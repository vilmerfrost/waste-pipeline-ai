import { createServiceRoleClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json();
    
    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID required" },
        { status: 400 }
      );
    }
    
    console.log(`📄 Processing document: ${documentId}`);
    
    const supabase = createServiceRoleClient();
    
    // Check if document exists
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    
    if (docError || !doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }
    
    // Check if document is already processing or approved
    if (doc.status === "processing") {
      return NextResponse.json(
        { error: "Document is already being processed" },
        { status: 400 }
      );
    }
    
    if (doc.status === "approved") {
      return NextResponse.json(
        { error: "Document is already approved" },
        { status: 400 }
      );
    }
    
    // Update status to processing
    const { error: updateError } = await supabase
      .from("documents")
      .update({ 
        status: "processing",
        updated_at: new Date().toISOString()
      })
      .eq("id", documentId);
    
    if (updateError) {
      console.error("Failed to update document status:", updateError);
      throw updateError;
    }
    
    // Create processing job
    const { error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        document_id: documentId,
        status: "queued",
        created_at: new Date().toISOString()
      });
    
    if (jobError) {
      console.error("Failed to create processing job:", jobError);
      // Don't throw - status is already updated
    }
    
    console.log(`✓ Document ${documentId} queued for processing`);
    
    // Trigger processing in background (non-blocking)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/process`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    }).catch(err => {
      console.error("Failed to trigger processing:", err);
      // Non-critical - job will be picked up by cron or next request
    });
    
    return NextResponse.json({ 
      success: true,
      message: "Processing started",
      documentId
    });
    
  } catch (error: any) {
    console.error("Process document error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start processing" },
      { status: 500 }
    );
  }
}

