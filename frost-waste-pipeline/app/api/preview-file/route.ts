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

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("storage_path, filename")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("raw_documents")
      .download(doc.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const filename = doc.filename || "document";
    const lower = filename.toLowerCase();

    let contentType = "application/octet-stream";
    if (lower.endsWith(".pdf")) {
      contentType = "application/pdf";
    } else if (lower.endsWith(".xlsx")) {
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (lower.endsWith(".xls")) {
      contentType = "application/vnd.ms-excel";
    }

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Preview file error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load preview file" },
      { status: 500 }
    );
  }
}

