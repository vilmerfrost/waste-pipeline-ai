// Claude Sonnet Reconciliation
// Used when extraction confidence is below 0.80 to review and fix extracted data

import { anthropic } from "./ai-clients";

export interface LineItem {
  date: { value: string; confidence: number };
  material: { value: string; confidence: number };
  handling: { value: string; confidence: number };
  weightKg: { value: number; confidence: number };
  percentage: { value: string; confidence: number };
  co2Saved: { value: number; confidence: number };
  isHazardous: { value: boolean; confidence: number };
  address: { value: string; confidence: number };
  receiver: { value: string; confidence: number };
}

interface ReconciliationResult {
  items: LineItem[];
  confidence: number;
  changes: string[];
  processingLog: string[];
}

export async function reconcileWithSonnet(
  items: LineItem[],
  originalBuffer: Buffer,
  filename: string,
  extractionLog: string[],
  settings: any
): Promise<ReconciliationResult> {
  const log: string[] = [...extractionLog];
  const timestamp = () => new Date().toISOString().split("T")[1].split(".")[0];
  
  log.push(`[${timestamp()}] 🧠 SONNET RECONCILIATION: Starting (confidence < 0.80)`);

  const isPdf = filename.toLowerCase().endsWith(".pdf");
  
  const prompt = `You are a data reconciliation expert. The primary extraction had low confidence.

FILENAME: ${filename}
EXTRACTED ITEMS (${items.length} rows):
${JSON.stringify(items.slice(0, 50), null, 2)}
${items.length > 50 ? `\n... and ${items.length - 50} more rows` : ""}

EXTRACTION LOG:
${extractionLog.slice(-20).join("\n")}

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK: Review and FIX the extracted data
═══════════════════════════════════════════════════════════════════════════════

Common issues to check:
1. DATES: Are they valid? Are they in YYYY-MM-DD format? Any future dates?
2. WEIGHTS: Are magnitudes correct? (Watch for 10x errors: 500 vs 5000)
3. MATERIALS: Are they standardized? Any typos?
4. LOCATIONS: Are they real addresses or placeholders?
5. MISSING DATA: Any rows with empty required fields?

DO NOT re-extract from scratch. FIX the existing data.

Return JSON (no markdown):
{
  "items": [
    // Return ALL items, with fixes applied
    {
      "date": { "value": "YYYY-MM-DD", "confidence": 0.0-1.0 },
      "material": { "value": "string", "confidence": 0.0-1.0 },
      "handling": { "value": "string", "confidence": 0.0-1.0 },
      "weightKg": { "value": number, "confidence": 0.0-1.0 },
      "percentage": { "value": "string", "confidence": 0.0-1.0 },
      "co2Saved": { "value": number, "confidence": 0.0-1.0 },
      "isHazardous": { "value": boolean, "confidence": 0.0-1.0 },
      "address": { "value": "string", "confidence": 0.0-1.0 },
      "receiver": { "value": "string", "confidence": 0.0-1.0 }
    }
  ],
  "changes": [
    "Row 3: Fixed date from 2025-13-01 to 2025-01-03",
    "Row 7: Fixed weight from 50000 kg to 500 kg (10x error)"
  ],
  "newConfidence": 0.0-1.0
}`;

  try {
    const messageContent: any[] = isPdf
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: originalBuffer.toString("base64"),
            },
          },
          { type: "text", text: prompt },
        ]
      : [{ type: "text", text: prompt }];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16384,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("No JSON in Sonnet reconciliation response");
    }

    const result = JSON.parse(jsonMatch[0]);
    
    log.push(`[${timestamp()}] ✅ Reconciliation complete`);
    log.push(`[${timestamp()}] 🔧 Changes made: ${result.changes?.length || 0}`);
    result.changes?.forEach((change: string) => log.push(`[${timestamp()}]    - ${change}`));
    log.push(`[${timestamp()}] 📊 New confidence: ${((result.newConfidence || 0.85) * 100).toFixed(0)}%`);

    return {
      items: result.items || items,
      confidence: result.newConfidence || 0.85,
      changes: result.changes || [],
      processingLog: log,
    };
  } catch (error: any) {
    log.push(`[${timestamp()}] ❌ Reconciliation failed: ${error.message}`);
    // Return original items if reconciliation fails
    return {
      items,
      confidence: 0.7,
      changes: [],
      processingLog: log,
    };
  }
}
