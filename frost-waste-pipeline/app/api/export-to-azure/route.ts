// FIXED: /api/export-to-azure/route.ts
// Handles BOTH {value, confidence} format AND clean format
// Uses Simplitics-compatible headers for Power BI integration

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { BlobServiceClient } from "@azure/storage-blob";
import { AzureBlobConnector } from "@/lib/azure-blob-connector";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

// Helper function to extract value from wrapped or clean format
function getValue(field: any): any {
  if (field === null || field === undefined) return null;
  
  // Check if it's wrapped format: {value: ..., confidence: ...}
  if (typeof field === 'object' && 'value' in field) {
    return field.value;
  }
  
  // Already clean format
  return field;
}

// Helper function to clean line items (handles both formats)
function cleanLineItem(item: any): any {
  return {
    date: getValue(item.date) || "",
    location: getValue(item.location) || getValue(item.address) || "",
    material: getValue(item.material) || "Okänt material",
    weightKg: parseFloat(String(getValue(item.weightKg) || getValue(item.weight) || 0)),
    unit: getValue(item.unit) || "Kg",
    receiver: getValue(item.receiver) || "",
    costSEK: getValue(item.costSEK) || getValue(item.cost) || 0,
    wasteCode: getValue(item.wasteCode) || "",
    handling: getValue(item.handling) || "",
    isHazardous: getValue(item.isHazardous) || false,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { documentIds, filename } = await request.json();
    
    console.log("📤 EXPORT TO AZURE REQUEST (Simplitics-compatible)");
    console.log(`   Documents: ${documentIds?.length || 'all approved'}`);
    
    const supabase = createServiceRoleClient();
    
    // Get approved documents that haven't been exported yet
    let query = supabase
      .from("documents")
      .select("*")
      .eq("status", "approved")
      .is("exported_at", null); // Only non-exported documents
    
    if (documentIds && documentIds.length > 0) {
      query = query.in("id", documentIds);
    }
    
    const { data: documents, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }
    
    if (!documents || documents.length === 0) {
      return NextResponse.json(
        { error: "No approved documents found" },
        { status: 404 }
      );
    }
    
    console.log(`✓ Found ${documents.length} approved documents`);
    
    // Create Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Processed Waste Data");
    
    // 🔥 USE SIMPLITICS-COMPATIBLE HEADERS!
    // Required columns: WOTimeFinished, LocationReference, Material, Amount, Unit
    // Optional columns: ReceiverReference, HazardousWaste
    worksheet.columns = [
      { header: "WOTimeFinished", key: "date", width: 12 },        // Required! (Datum alias)
      { header: "LocationReference", key: "location", width: 30 }, // Required! (Adress alias)
      { header: "Material", key: "material", width: 20 },          // Required! (exact match)
      { header: "Amount", key: "weightKg", width: 12 },            // Required! (Vikt (kg) alias)
      { header: "Unit", key: "unit", width: 10 },                  // Required! (exact match)
      { header: "ReceiverReference", key: "receiver", width: 20 }, // Optional (Mottagare alias)
      { header: "HazardousWaste", key: "isHazardous", width: 15 }, // Optional (Farligt avfall alias)
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    
    // Add data rows
    let totalRows = 0;
    let totalWeight = 0;
    
    for (const doc of documents) {
      const lineItems = doc.extracted_data?.lineItems || [];
      
      console.log(`📄 Processing document: ${doc.filename}`);
      console.log(`   Line items: ${lineItems.length}`);
      
      for (const item of lineItems) {
        // Clean the item (handles both wrapped and clean formats)
        const cleanItem = cleanLineItem(item);
        
        worksheet.addRow({
          date: cleanItem.date || "",
          location: cleanItem.location || "",
          material: cleanItem.material || "",
          weightKg: cleanItem.weightKg || 0,
          unit: cleanItem.unit || "Kg",
          receiver: cleanItem.receiver || "",
          isHazardous: cleanItem.isHazardous ? "Ja" : "Nej", // Convert boolean to Swedish
        });
        
        totalRows++;
        totalWeight += cleanItem.weightKg || 0;
      }
    }
    
    console.log(`✓ Excel created: ${totalRows} rows from ${documents.length} documents`);
    console.log(`✓ Total weight: ${(totalWeight / 1000).toFixed(2)} ton`);
    console.log(`✓ Using Simplitics-compatible headers!`);
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // Upload to Azure
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
    }
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient("completed");
    
    // Ensure container exists
    await containerClient.createIfNotExists();
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const blobName = filename || `collecct-export-${timestamp}.xlsx`;
    
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    console.log(`⬆️  Uploading to Azure: ${blobName}`);
    
    // Convert buffer to Uint8Array for Azure
    const uint8Array = new Uint8Array(buffer as ArrayBuffer);
    
    await blockBlobClient.upload(uint8Array, uint8Array.length, {
      blobHTTPHeaders: {
        blobContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
    
    console.log(`✅ Upload successful!`);
    console.log(`✅ File will be processed by Simplitics → Power BI`);
    
    // 🔥 CLEANUP STEP 1: Delete source files from Azure failed containers
    // Reuse the same connectionString variable (already defined above)
    const azureConnector = new AzureBlobConnector(connectionString, "arrivalwastedata");
    let deletedCount = 0;
    
    for (const doc of documents) {
      const sourceFolder = doc.extracted_data?.source_folder;
      const originalBlobPath = doc.extracted_data?.original_blob_path;
      const filename = doc.filename;
      
      // Try to delete from Azure failed containers
      if (sourceFolder && filename) {
        try {
          // source_folder is the container name (unable-to-process or unsupported-file-format)
          await azureConnector.deleteFromInput(sourceFolder, filename);
          deletedCount++;
          console.log(`🗑️  Deleted ${filename} from ${sourceFolder}`);
        } catch (deleteError: any) {
          console.warn(`⚠️  Could not delete ${filename} from ${sourceFolder}:`, deleteError.message);
          // Don't fail the export if deletion fails
        }
      } else if (originalBlobPath && filename) {
        // Fallback: try to extract container from original_blob_path
        try {
          // original_blob_path might contain container info
          const containerMatch = originalBlobPath.match(/(unable-to-process|unsupported-file-format)/);
          if (containerMatch) {
            const containerName = containerMatch[1];
            await azureConnector.deleteFromInput(containerName, filename);
            deletedCount++;
            console.log(`🗑️  Deleted ${filename} from ${containerName}`);
          }
        } catch (deleteError: any) {
          console.warn(`⚠️  Could not delete ${filename}:`, deleteError.message);
        }
      }
    }
    
    console.log(`🗑️  Cleanup: Deleted ${deletedCount} source files from Azure failed containers`);
    
    // 🔥 CLEANUP STEP 2: Mark documents as exported
    const documentIdsToUpdate = documents.map(d => d.id);
    const exportedAt = new Date().toISOString();
    
    await supabase
      .from("documents")
      .update({
        status: "exported",
        exported_at: exportedAt,
        extracted_data: {
          ...documents[0].extracted_data,
          azure_export_url: blockBlobClient.url,
          exported_at: exportedAt
        }
      })
      .in("id", documentIdsToUpdate);
    
    console.log(`✅ Marked ${documentIdsToUpdate.length} documents as exported`);
    
    return NextResponse.json({
      success: true,
      filename: blobName,
      azureUrl: blockBlobClient.url,
      stats: {
        documents: documents.length,
        rows: totalRows,
        totalWeightKg: totalWeight,
        totalWeightTon: (totalWeight / 1000).toFixed(2),
      },
    });
    
  } catch (error: any) {
    console.error("❌ Export to Azure failed:", error);
    return NextResponse.json(
      { error: error.message || "Export failed" },
      { status: 500 }
    );
  }
}
