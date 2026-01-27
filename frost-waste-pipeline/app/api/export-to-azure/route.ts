// FINAL EXPORT: One document = One Excel file with original filename
// app/api/export-to-azure/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { BlobServiceClient } from "@azure/storage-blob";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

// Helper functions
function getValue(field: any): any {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && 'value' in field) {
    return field.value;
  }
  return field;
}

// ✅ Helper: Check if a value is a placeholder/default that should be replaced by document-level value
function isPlaceholderValue(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim().toLowerCase();
  return (
    trimmed === '' ||
    trimmed === 'okänd mottagare' ||
    trimmed === 'okänd adress' ||
    trimmed === 'okänt material' ||
    trimmed === 'saknas' ||
    trimmed === 'unknown'
  );
}

/**
 * Clean a line item for export
 * IMPORTANT: Document-level values should override placeholder values like "Okänd mottagare"
 * This ensures "What you see in Preview is what you get in Excel"
 */
function cleanLineItem(
  item: any, 
  documentFilename?: string,
  documentDate?: string | null,
  documentAddress?: string | null,  // ✅ NEW: Document-level address
  documentReceiver?: string | null  // ✅ NEW: Document-level receiver
): any {
  // PRIORITY 1: Individual row date (if set per-row)
  let date = getValue(item.date);
  
  // PRIORITY 2: Document-level date (user-edited date from form!)
  if (!date && documentDate) {
    date = documentDate;
    console.log(`   📅 Using document-level date: ${date}`);
  }
  
  // PRIORITY 3: Try to extract from document filename
  if (!date && documentFilename) {
    const cleanFilename = documentFilename.replace(/\s*\(\d+\)/g, '');
    const match = cleanFilename.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      date = match[1];
      console.log(`   📅 Extracted date from filename: ${date} (cleaned: ${cleanFilename})`);
    }
  }
  
  // PRIORITY 4: LAST RESORT - use today as fallback
  if (!date) {
    date = new Date().toISOString().split('T')[0];
    console.log(`   ⚠️  No date found anywhere, using today as last resort: ${date}`);
  }
  
  // ✅ FIX: Handle location - use document-level if row has placeholder
  const rowLocation = getValue(item.location) || getValue(item.address);
  const location = isPlaceholderValue(rowLocation) ? (documentAddress || "") : rowLocation;
  
  // ✅ FIX: Handle receiver - use document-level if row has placeholder  
  const rowReceiver = getValue(item.receiver);
  const receiver = isPlaceholderValue(rowReceiver) ? (documentReceiver || "") : rowReceiver;
  
  return {
    date: date,  // ✅ ALWAYS has a value!
    location: location,
    material: getValue(item.material) || "Okänt material",
    weightKg: parseFloat(String(getValue(item.weightKg) || getValue(item.weight) || 0)),
    unit: getValue(item.unit) || "Kg",
    receiver: receiver,
    isHazardous: getValue(item.isHazardous) || false,
  };
}

// SAFE DELETE: Only exact filename matches - never guesses or searches
async function deleteSourceFileFromAzure(
  azureOriginalFilename: string | null,
  sourceContainer: string | null,
  fallbackFilename?: string,
  fallbackSourceFolder?: string
): Promise<{ success: boolean; message: string }> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    const msg = "⚠️ No Azure connection - skipping source file deletion";
    console.warn(msg);
    return { success: false, message: msg };
  }

  // Use tracked Azure filename if available, otherwise fallback
  const filenameToDelete = azureOriginalFilename || fallbackFilename;
  const containerToCheck = sourceContainer || fallbackSourceFolder;

  if (!filenameToDelete) {
    const msg = "⚠️ No Azure original filename tracked - cannot safely delete";
    console.warn(msg);
    return { success: false, message: msg };
  }

  console.log(`🗑️  SAFE DELETE: Attempting to delete "${filenameToDelete}"`);
  console.log(`   Container: ${containerToCheck || 'unknown'}`);
  console.log(`   Using tracked filename: ${azureOriginalFilename ? 'YES ✅' : 'NO (using fallback)'}`);

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  
  // SAFETY: Only try exact filename match - NO fuzzy matching, NO searching
  const containersToTry = containerToCheck
    ? [containerToCheck]
    : ["unable-to-process", "unsupported-file-format"];
  
  for (const containerName of containersToTry) {
    try {
      console.log(`   Checking container: ${containerName}`);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // EXACT MATCH ONLY - no patterns, no searching
      const blobClient = containerClient.getBlobClient(filenameToDelete);
      const exists = await blobClient.exists();
      
      if (exists) {
        // VERIFICATION: Log what we're about to delete
        console.log(`   ✅ Found exact match: ${filenameToDelete}`);
        console.log(`   🔒 Verifying before deletion...`);
        
        await blobClient.delete();
        console.log(`   ✅ SAFELY DELETED: ${filenameToDelete} from ${containerName}`);
        return { success: true, message: `Deleted ${filenameToDelete} from ${containerName}` };
      } else {
        console.log(`   ℹ️  File "${filenameToDelete}" not found in ${containerName}`);
      }
      
    } catch (containerErr: any) {
      console.warn(`   ⚠️  Container ${containerName} error:`, containerErr.message);
      continue; // Try next container
    }
  }
  
  const msg = `⚠️  File "${filenameToDelete}" not found in any container - manual cleanup may be needed`;
  console.warn(msg);
  return { success: false, message: msg };
}

// Create Excel file for a single document
async function createExcelForDocument(doc: any): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Processed Waste Data");
  
  // Simplitics-compatible headers
  worksheet.columns = [
    { header: "Utförtdatum", key: "date", width: 12 },
    { header: "Hämtställe", key: "location", width: 30 },
    { header: "Material", key: "material", width: 20 },
    { header: "Kvantitet", key: "weightKg", width: 12 },
    { header: "Enhet", key: "unit", width: 10 },
    { header: "Leveransställe", key: "receiver", width: 20 },
    { header: "Farligt avfall", key: "isHazardous", width: 15 },
  ];
  
  // Style header
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  
  // Add data rows from this document
  const lineItems = doc.extracted_data?.lineItems || [];
  
  // Get document-level values (PRIORITY ORDER):
  // 1. User-edited values from documentMetadata (most important - what user sees!)
  // 2. Top-level field (AI-extracted)
  // 3. Extract from filename (for date)
  // 4. Default/empty (last resort)
  
  // === DATE ===
  let documentDate: string | null = null;
  if (doc.extracted_data?.documentMetadata?.date) {
    documentDate = getValue(doc.extracted_data.documentMetadata.date);
  }
  if (!documentDate && doc.extracted_data?.date) {
    documentDate = getValue(doc.extracted_data.date);
  }
  if (!documentDate && doc.filename) {
    const cleanFilename = doc.filename.replace(/\s*\(\d+\)/g, '');
    const match = cleanFilename.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      documentDate = match[1];
    }
  }
  
  // === ADDRESS (Hämtställe) ===
  let documentAddress: string | null = null;
  if (doc.extracted_data?.documentMetadata?.address) {
    documentAddress = getValue(doc.extracted_data.documentMetadata.address);
  }
  if (!documentAddress || isPlaceholderValue(documentAddress)) {
    documentAddress = getValue(doc.extracted_data?.address) || null;
  }
  
  // === RECEIVER (Mottagare/Leveransställe) ===
  let documentReceiver: string | null = null;
  if (doc.extracted_data?.documentMetadata?.receiver) {
    documentReceiver = getValue(doc.extracted_data.documentMetadata.receiver);
  }
  if (!documentReceiver || isPlaceholderValue(documentReceiver)) {
    documentReceiver = getValue(doc.extracted_data?.receiver) || null;
  }
  
  console.log(`   Processing ${lineItems.length} line items`);
  console.log(`   Document date: ${documentDate || 'none'}`);
  console.log(`   Document address: ${documentAddress || 'none'}`);
  console.log(`   Document receiver: ${documentReceiver || 'none'}`);
  
  for (const item of lineItems) {
    // ✅ CRITICAL FIX: Pass all document-level values to cleanLineItem
    // This ensures user-edited values override row-level placeholder values
    const cleanItem = cleanLineItem(item, doc.filename, documentDate, documentAddress, documentReceiver);
    
    // cleanItem now has the correct values with proper fallback chain
    const finalDate = cleanItem.date;
    
    worksheet.addRow({
      date: finalDate,  // ✅ Will NEVER be empty now!
      location: cleanItem.location || "",
      material: cleanItem.material || "",
      weightKg: cleanItem.weightKg || 0,
      unit: cleanItem.unit || "Kg",
      receiver: cleanItem.receiver || "",
      isHazardous: cleanItem.isHazardous ? "Ja" : "Nej",
    });
  }
  
  // Generate buffer
  return await workbook.xlsx.writeBuffer() as Buffer;
}

// Get original filename (convert .pdf to .xlsx if needed)
function getExportFilename(originalFilename: string): string {
  // If it's a PDF, change extension to .xlsx
  if (originalFilename.endsWith('.pdf')) {
    return originalFilename.replace(/\.pdf$/i, '.xlsx');
  }
  
  // If it's already .xlsx or .xls, keep as is
  return originalFilename;
}

export async function POST(request: NextRequest) {
  try {
    const { documentIds } = await request.json();
    
    console.log("📤 EXPORT TO AZURE - ONE FILE PER DOCUMENT");
    console.log(`   Documents: ${documentIds?.length || 'all approved'}`);
    
    const supabase = createServiceRoleClient();
    
    // Get approved documents that haven't been exported
    let query = supabase
      .from("documents")
      .select("*")
      .eq("status", "approved")
      .is("exported_at", null);
    
    if (documentIds && documentIds.length > 0) {
      query = query.in("id", documentIds);
    }
    
    const { data: documents, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
    
    if (!documents || documents.length === 0) {
      return NextResponse.json(
        { error: "No approved documents to export" },
        { status: 404 }
      );
    }
    
    console.log(`✓ Found ${documents.length} documents to export`);
    
    // Fetch output folder setting
    const { data: settings } = await supabase
      .from("settings")
      .select("azure_output_folder")
      .eq("user_id", "default")
      .single();
    
    const outputPath = settings?.azure_output_folder || "completed";
    const outputParts = outputPath.split("/");
    const outputContainer = outputParts[0];
    const outputFolderPrefix = outputParts.slice(1).join("/");
    
    console.log(`📁 Output destination: ${outputPath}`);
    
    // Azure setup
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
    }
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(outputContainer);
    
    // Ensure container exists
    await containerClient.createIfNotExists();
    
    // Process each document separately
    const results = [];
    let totalRows = 0;
    let totalWeight = 0;
    
    for (const doc of documents) {
      try {
        console.log(`\n📄 Processing: ${doc.filename}`);
        
        // Create Excel for this document
        const buffer = await createExcelForDocument(doc);
        
        // Use original filename (change .pdf to .xlsx if needed)
        const exportFilename = getExportFilename(doc.filename);
        
        // Build full blob path with optional folder prefix
        const blobPath = outputFolderPrefix 
          ? `${outputFolderPrefix}/${exportFilename}` 
          : exportFilename;
        
        console.log(`   Export as: ${blobPath}`);
        
        // Upload to Azure
        const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
        
        // Convert buffer to Uint8Array for Azure
        const uint8Array = new Uint8Array(buffer as ArrayBuffer);
        
        await blockBlobClient.upload(uint8Array, uint8Array.length, {
          blobHTTPHeaders: {
            blobContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        });
        
        console.log(`   ✅ Uploaded to Azure`);
        
        // SAFE DELETE: Only delete if we have tracked Azure filename
        const deleteResult = await deleteSourceFileFromAzure(
          doc.azure_original_filename || null,
          doc.source_container || null,
          doc.filename, // Fallback
          doc.extracted_data?.source_folder // Fallback
        );
        
        if (!deleteResult.success) {
          console.warn(`   ⚠️  Cleanup warning: ${deleteResult.message}`);
          // Don't fail export if cleanup fails - better to leave file than delete wrong one
        }
        
        // Mark as exported
        const exportedAt = new Date().toISOString();
        
        await supabase
          .from("documents")
          .update({ 
            exported_at: exportedAt,
            status: "exported",
            extracted_data: {
              ...doc.extracted_data,
              azure_export_url: blockBlobClient.url,
              exported_at: exportedAt
            }
          })
          .eq("id", doc.id);
        
        console.log(`   ✅ Marked as exported`);
        
        // Track stats
        const lineItems = doc.extracted_data?.lineItems || [];
        const docWeight = lineItems.reduce((sum: number, item: any) => {
          const weight = parseFloat(String(getValue(item.weightKg) || getValue(item.weight) || 0));
          return sum + weight;
        }, 0);
        
        totalRows += lineItems.length;
        totalWeight += docWeight;
        
        results.push({
          filename: exportFilename,
          originalFilename: doc.filename,
          rows: lineItems.length,
          weightKg: docWeight,
          url: blockBlobClient.url,
          success: true,
        });
        
      } catch (error: any) {
        console.error(`   ❌ Failed to export ${doc.filename}:`, error.message);
        
        results.push({
          filename: doc.filename,
          success: false,
          error: error.message,
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log(`\n✅ Export complete!`);
    console.log(`   Success: ${successCount}/${documents.length}`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Total rows: ${totalRows}`);
    console.log(`   Total weight: ${(totalWeight / 1000).toFixed(2)} ton`);
    
    // Get first successful filename for display
    const firstSuccessful = results.find(r => r.success);
    
    return NextResponse.json({
      success: true,
      message: `Exported ${successCount} documents`,
      stats: {
        total: documents.length,
        success: successCount,
        failed: failedCount,
        rows: totalRows,
        totalWeightKg: totalWeight,
        totalWeightTon: totalWeight / 1000,
        // Add display-friendly fields
        displayFilename: successCount === 1 
          ? firstSuccessful?.filename 
          : `${successCount} filer`,
      },
      files: results,
    });
    
  } catch (error: any) {
    console.error("❌ Export failed:", error);
    return NextResponse.json(
      { error: error.message || "Export failed" },
      { status: 500 }
    );
  }
}
