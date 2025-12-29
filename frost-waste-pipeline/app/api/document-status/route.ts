import { createServiceRoleClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("id");
    
    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID required" },
        { status: 400 }
      );
    }
    
    const supabase = createServiceRoleClient();
    
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();
    
    if (error || !doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ document: doc });
    
  } catch (error: any) {
    console.error("Document status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch document status" },
      { status: 500 }
    );
  }
}

