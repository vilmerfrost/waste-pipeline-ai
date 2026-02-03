// Document Assistant API
// Claude Haiku powered assistant for answering questions about processed documents

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import { askDocumentAssistant, summarizeDocument, explainErrors } from "@/lib/document-assistant";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    const { documentId, question, action } = await request.json();

    if (!documentId) {
      return NextResponse.json({ error: "Document ID required" }, { status: 400 });
    }

    // Fetch document
    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const context = {
      filename: doc.filename,
      extractedData: doc.extracted_data,
      processingLog: doc.extracted_data?._processingLog || [],
      status: doc.status,
    };

    let response;

    switch (action) {
      case "summarize":
        response = { answer: await summarizeDocument(context) };
        break;
      case "explain_errors":
        response = { answer: await explainErrors(context) };
        break;
      case "ask":
      default:
        if (!question) {
          return NextResponse.json({ error: "Question required" }, { status: 400 });
        }
        response = await askDocumentAssistant(question, context);
        break;
    }

    return NextResponse.json(response);

  } catch (error: any) {
    console.error("[Assistant API]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
