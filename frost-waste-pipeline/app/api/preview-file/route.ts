import { createServiceRoleClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

// Timeout helper for Supabase storage download
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("id");

  if (!documentId) {
    return NextResponse.json(
      { error: "Document ID required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServiceRoleClient();

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("storage_path, filename")
      .eq("id", documentId)
      .single();

    if (docError || !doc) {
      console.error(`[preview-file] Document ${documentId} not found:`, docError?.message);
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (!doc.storage_path) {
      console.error(`[preview-file] Document ${documentId} has no storage_path`);
      return NextResponse.json(
        { error: "No file path for document" },
        { status: 404 }
      );
    }

    // Download with 30s timeout to avoid Azure 502
    const downloadResult = await withTimeout(
      supabase.storage.from("raw_documents").download(doc.storage_path),
      30000,
      "Supabase storage download"
    );

    const { data: fileData, error: downloadError } = downloadResult;

    if (downloadError || !fileData) {
      console.error(`[preview-file] Download failed for ${doc.storage_path}:`, downloadError?.message);
      return NextResponse.json(
        { error: "File not found in storage" },
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
    console.error(`[preview-file] Error for document ${documentId}:`, error?.message || error);
    return NextResponse.json(
      { error: error.message || "Failed to load preview file" },
      { status: 500 }
    );
  }
}

