import { createServiceRoleClient } from "@/lib/supabase";
import { extractAdaptive } from "@/lib/adaptive-extraction";
import * as XLSX from "xlsx";

// SSE helper to format messages
function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Get settings from database
async function getSettings() {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .single();
  
  if (error) {
    console.log("No settings found, using defaults");
    return {};
  }
  return data || {};
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get("id");
  
  if (!documentId) {
    return new Response("Document ID required", { status: 400 });
  }
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Helper to send SSE message
      const send = (type: string, data: any) => {
        controller.enqueue(encoder.encode(formatSSE({ type, ...data })));
      };
      
      // Log callback for streaming
      const onLog = (message: string, level: string = 'info') => {
        send('log', { message, level, timestamp: new Date().toISOString() });
      };
      
      try {
        const supabase = createServiceRoleClient();
        const settings = await getSettings();
        
        // Get document
        const { data: doc, error: docError } = await supabase
          .from("documents")
          .select("*")
          .eq("id", documentId)
          .single();
        
        if (docError || !doc) {
          send('error', { message: 'Document not found' });
          controller.close();
          return;
        }
        
        send('start', { 
          documentId: doc.id, 
          filename: doc.filename,
          status: 'processing'
        });
        
        // Update status to processing
        await supabase
          .from("documents")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", documentId);
        
        // Download file
        let arrayBuffer: ArrayBuffer;
        
        if (doc.url) {
          onLog(`📥 Downloading from URL...`, 'info');
          const response = await fetch(doc.url);
          arrayBuffer = await response.arrayBuffer();
        } else if (doc.storage_path) {
          onLog(`📥 Downloading from storage...`, 'info');
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("raw_documents")
            .download(doc.storage_path);
          
          if (downloadError) {
            throw new Error(`Failed to download: ${downloadError.message}`);
          }
          arrayBuffer = await fileData.arrayBuffer();
        } else {
          throw new Error("No file URL or storage path");
        }
        
        onLog(`✓ File downloaded (${(arrayBuffer.byteLength / 1024).toFixed(0)} KB)`, 'success');
        
        // Check file type
        const isExcel = doc.filename.match(/\.(xlsx|xls)$/i);
        
        if (!isExcel) {
          send('error', { message: 'Streaming only supported for Excel files' });
          controller.close();
          return;
        }
        
        // Process Excel file with streaming logs
        onLog(`📊 Starting adaptive extraction...`, 'info');
        
        const workbook = XLSX.read(arrayBuffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        
        // Run extraction with log callback
        const adaptiveResult = await extractAdaptive(
          jsonData as any[][],
          doc.filename,
          settings,
          onLog  // Pass the log callback!
        );
        
        // Convert to expected format
        const extractedData = {
          ...adaptiveResult,
          totalCostSEK: 0,
          documentType: "waste_report",
        };
        
        // Determine status
        const qualityScore = (adaptiveResult._validation.completeness + (adaptiveResult.metadata?.confidence || 0) * 100) / 2;
        const newStatus = qualityScore >= 90 ? "approved" : "needs_review";
        
        // Generate AI summary
        const rowCount = extractedData.metadata?.processedRows || extractedData.lineItems?.length || 0;
        const completeness = extractedData._validation.completeness;
        const confidence = extractedData.metadata?.confidence ? extractedData.metadata.confidence * 100 : 90;
        
        const aiSummary = completeness >= 95 && confidence >= 90
          ? `✓ Dokument med ${rowCount} rader från ${extractedData.uniqueAddresses} adresser. Total vikt: ${(extractedData.totalWeightKg/1000).toFixed(2)} ton. Data komplett (${confidence.toFixed(0)}% säkerhet) - redo för godkännande.`
          : `⚠️ Dokument med ${rowCount} rader. ${(100 - completeness).toFixed(0)}% data saknas, ${confidence.toFixed(0)}% säkerhet - behöver granskning.`;
        
        extractedData.aiSummary = aiSummary;
        
        // Save to database
        await supabase
          .from("documents")
          .update({
            status: newStatus,
            extracted_data: extractedData,
            updated_at: new Date().toISOString()
          })
          .eq("id", doc.id);
        
        // Send completion
        send('complete', {
          status: newStatus,
          extractedRows: rowCount,
          totalWeight: extractedData.totalWeightKg,
          confidence: confidence,
          completeness: completeness,
          uniqueAddresses: extractedData.uniqueAddresses,
          uniqueMaterials: extractedData.uniqueMaterials,
          processingLog: adaptiveResult._processingLog
        });
        
      } catch (error: any) {
        console.error("Stream processing error:", error);
        send('error', { message: error.message || 'Processing failed' });
        
        // Update document status to error
        const supabase = createServiceRoleClient();
        await supabase
          .from("documents")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", documentId);
      }
      
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
