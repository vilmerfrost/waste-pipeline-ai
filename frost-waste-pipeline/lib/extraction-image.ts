// Image extraction using Gemini Flash Vision
// Handles PNG, JPG, JPEG files via callGeminiFlashWithVision

import { callGeminiFlashWithVision } from "./ai-clients";

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/png";
}

function extractJsonFromText(text: string): any {
  let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON found in response");
  clean = clean.substring(firstBrace, lastBrace + 1);
  return JSON.parse(clean);
}

/**
 * Extract waste data from an image file (PNG, JPG, JPEG)
 * Uses Gemini Flash Vision via OpenRouter
 */
export async function extractFromImage(
  imageBuffer: ArrayBuffer,
  filename: string,
  settings: any
): Promise<any> {
  const processingLog: string[] = [];
  const log = (msg: string) => {
    const ts = new Date().toISOString().split("T")[1].split(".")[0];
    processingLog.push(`[${ts}] ${msg}`);
    console.log(msg);
  };

  log(`${"=".repeat(60)}`);
  log(`🖼️ IMAGE EXTRACTION: ${filename}`);
  log(`${"=".repeat(60)}`);

  const base64Data = Buffer.from(imageBuffer).toString("base64");
  const mimeType = getMimeType(filename);
  log(`✓ Image converted to base64 (${(imageBuffer.byteLength / 1024).toFixed(0)} KB, ${mimeType})`);

  const filenameDate = filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null;

  const prompt = `Extract ALL waste data from this Swedish waste report image.

CRITICAL METADATA TO EXTRACT:
1. DOCUMENT DATE: Look for date in header/footer or most common date in table rows
2. PROJECT/ADDRESS: Project name or address at top
3. SUPPLIER/SENDER: Company name at bottom or footer
4. RECEIVER: Who receives the waste

MATERIAL SYNONYMS:
${Object.entries(settings.material_synonyms || {})
  .map(([std, syns]) => `${std}: ${(syns as string[]).join(", ")}`)
  .join("\n")}

OUTPUT FORMAT (JSON, no markdown, NO {value, confidence} wrappers):
{
  "documentInfo": {
    "date": "2025-09-18",
    "address": "Östergårds Förskola",
    "supplier": "Stefan Hallberg",
    "receiver": ""
  },
  "items": [
    {
      "date": "2025-09-18",
      "location": "USE_DOCUMENT_ADDRESS",
      "material": "Trä",
      "weightKg": 3820,
      "unit": "Kg",
      "receiver": ""
    }
  ]
}

RULES:
1. Extract document date from header/footer FIRST
2. If table has NO address/location column, use "USE_DOCUMENT_ADDRESS" as location marker
3. If table has NO date column, use document date for all rows
4. All weights in kg (convert from ton: × 1000, from g: ÷ 1000)
5. Extract EVERY row from any tables in the image
6. Leave receiver empty if not found in document

FALLBACKS:
- Date: Use "${filenameDate || new Date().toISOString().split("T")[0]}"
- Supplier: "Okänd leverantör"
- Address: "Okänd adress"

Return JSON only, no markdown!`;

  try {
    log(`📤 Calling Gemini Flash Vision for image OCR...`);
    const response = await callGeminiFlashWithVision(prompt, base64Data, mimeType);
    log(`✓ Gemini response received (${response.content.length} chars)`);

    const parsed = extractJsonFromText(response.content);
    log(`✓ JSON parsed successfully`);

    const documentInfo = parsed.documentInfo || {};
    const documentDate = documentInfo.date || filenameDate || new Date().toISOString().split("T")[0];
    const documentAddress = documentInfo.address || documentInfo.projectAddress || null;
    const documentSupplier = documentInfo.supplier || "Okänd leverantör";

    log(`📋 Document: date=${documentDate}, address=${documentAddress || "none"}, supplier=${documentSupplier}`);

    const rawItems: any[] = parsed.items || [];
    log(`📦 Found ${rawItems.length} raw items`);

    const processedItems = rawItems.map((item: any) => {
      let location = item.location?.value || item.location;
      if (!location || location === "USE_DOCUMENT_ADDRESS" || location === "" || location === "SAKNAS") {
        location = documentAddress || "Okänd adress";
      }

      return {
        date: item.date || documentDate,
        location,
        material: item.material || "Okänt material",
        weightKg: parseFloat(String(item.weightKg || 0)),
        unit: item.unit || "Kg",
        receiver: (item.receiver && String(item.receiver).trim()) || "",
        costSEK: parseFloat(String(item.costSEK || 0)),
      };
    });

    // Aggregate duplicates
    const grouped = new Map<string, any>();
    for (const item of processedItems) {
      const key = `${item.date}|${item.location}|${item.material}|${item.receiver}`;
      if (grouped.has(key)) {
        grouped.get(key)!.weightKg += item.weightKg;
      } else {
        grouped.set(key, { ...item });
      }
    }

    const aggregated = Array.from(grouped.values());
    const totalWeight = aggregated.reduce((sum: number, item: any) => sum + item.weightKg, 0);
    const uniqueAddresses = new Set(aggregated.map((item: any) => item.location)).size;
    const uniqueMaterials = new Set(aggregated.map((item: any) => item.material)).size;

    log(`✅ Image extraction complete: ${processedItems.length} rows → ${aggregated.length} unique`);
    log(`${"=".repeat(60)}`);

    return {
      lineItems: aggregated,
      metadata: {
        totalRows: processedItems.length,
        extractedRows: processedItems.length,
        aggregatedRows: aggregated.length,
        chunked: false,
        chunks: 1,
        model: "gemini-flash-vision",
      },
      totalWeightKg: totalWeight,
      totalCostSEK: 0,
      documentType: "waste_report",
      uniqueAddresses,
      uniqueReceivers: 1,
      uniqueMaterials,
      documentMetadata: {
        date: documentDate,
        address: documentAddress || "Okänd adress",
        supplier: documentSupplier,
        receiver: documentInfo.receiver || "",
      },
      _validation: {
        completeness: processedItems.length > 0 ? 90 : 0,
        confidence: 85,
        issues: processedItems.length === 0 ? ["No data extracted from image"] : [],
      },
      _processingLog: processingLog,
    };
  } catch (error: any) {
    log(`❌ Image extraction failed: ${error.message}`);
    const enhancedError = new Error(`Image extraction failed: ${error.message}`);
    (enhancedError as any)._processingLog = processingLog;
    throw enhancedError;
  }
}
