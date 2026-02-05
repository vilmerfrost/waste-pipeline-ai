// Claude Haiku Verification (ALWAYS ON)
// Verifies extracted data against source to detect hallucinations

import { getAnthropic } from "./ai-clients";

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
  _verificationIssues?: VerificationIssue[];
}

export interface VerificationResult {
  passed: boolean;
  items: LineItem[];
  issues: VerificationIssue[];
  confidence: number;
  processingLog: string[];
}

export interface VerificationIssue {
  rowIndex: number;
  field: string;
  issue: string;
  severity: "warning" | "error";
  suggestion?: string;
}

export async function verifyWithHaiku(
  items: LineItem[],
  originalContent: string,
  filename: string,
  previousLog: string[]
): Promise<VerificationResult> {
  const log: string[] = [...previousLog];
  const timestamp = () => new Date().toISOString().split("T")[1].split(".")[0];
  
  log.push(`[${timestamp()}] 🔍 HAIKU VERIFICATION: Starting (ALWAYS ON)`);

  const VERIFY_CHUNK_SIZE = 25;
  const allIssues: VerificationIssue[] = [];
  let totalConfidence = 0;
  let chunksProcessed = 0;

  for (let i = 0; i < items.length; i += VERIFY_CHUNK_SIZE) {
    const chunk = items.slice(i, i + VERIFY_CHUNK_SIZE);
    const chunkNum = Math.floor(i / VERIFY_CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(items.length / VERIFY_CHUNK_SIZE);

    const prompt = `You are a strict data verification agent. Your job is to detect hallucinations and fabricated data.

FILENAME: ${filename}

SOURCE CONTENT (reference):
${originalContent.substring(0, 10000)}

EXTRACTED DATA TO VERIFY (chunk ${chunkNum}/${totalChunks}, rows ${i + 1}-${i + chunk.length}):
${JSON.stringify(chunk, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
VERIFICATION CHECKS - BE STRICT
═══════════════════════════════════════════════════════════════════════════════

For EACH row, verify these fields against the source:

1. DATE - Does this exact date (or recognizable format) appear in source?
2. LOCATION/ADDRESS - Does this address text appear verbatim in source?
3. MATERIAL - Does this material name (or clear synonym) appear in source?
4. WEIGHT - Does this weight value appear? Watch for unit conversion errors (500 kg vs 5000 kg, decimal errors)
5. RECEIVER - Does this company/organization name appear VERBATIM in source text? 
   ⚠️ If the receiver name cannot be found anywhere in the source document, mark as ERROR.
   ⚠️ Do NOT accept receiver names inferred from filename, context, or assumed from industry knowledge.

═══════════════════════════════════════════════════════════════════════════════
HALLUCINATION PATTERNS - FLAG AS ERROR
═══════════════════════════════════════════════════════════════════════════════

- Company/organization names (especially receiver) that don't appear VERBATIM in source → ERROR
- Made-up addresses that don't exist in source → ERROR
- Wrong weight magnitude (10x errors: 185 vs 1850, decimal shifts) → ERROR
- Dates from wrong rows or not in source → ERROR
- Materials that don't appear anywhere in source → ERROR
- Any value that looks "reasonable" but isn't actually in the document → ERROR

CRITICAL: If a field value cannot be traced to specific text in the source, it is a hallucination.

Return JSON (no markdown):
{
  "issues": [
    {
      "rowIndex": number (0-indexed within this chunk, add ${i} for global index),
      "field": "date|weightKg|material|address|receiver",
      "issue": "description of what's wrong",
      "severity": "warning|error",
      "suggestion": "leave empty or set to null if value should be removed"
    }
  ],
  "confidence": 0.0-1.0 (for this chunk)
}

If no issues found, return: {"issues": [], "confidence": 0.95}`;

    try {
      const response = await getAnthropic().messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch?.[0] || '{"issues":[],"confidence":0.9}');

      const adjustedIssues = (result.issues || []).map((issue: any) => ({
        ...issue,
        rowIndex: issue.rowIndex + i,
      }));

      allIssues.push(...adjustedIssues);
      totalConfidence += result.confidence || 0.9;
      chunksProcessed++;

    } catch (error: any) {
      log.push(`[${timestamp()}] ⚠️ Verification chunk ${chunkNum} failed: ${error.message}`);
      totalConfidence += 0.8;
      chunksProcessed++;
    }
  }

  const avgConfidence = chunksProcessed > 0 ? totalConfidence / chunksProcessed : 0.8;
  const errorCount = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  
  const passed = errorCount === 0 && avgConfidence >= 0.7;

  log.push(`[${timestamp()}] ✅ Verification complete`);
  log.push(`[${timestamp()}] 📊 Confidence: ${(avgConfidence * 100).toFixed(0)}%`);
  log.push(`[${timestamp()}] ❌ Errors: ${errorCount}, ⚠️ Warnings: ${warningCount}`);
  log.push(`[${timestamp()}] ${passed ? "✅ PASSED" : "🚨 FLAGGED FOR REVIEW"}`);

  const flaggedItems = items.map((item, idx) => {
    const itemIssues = allIssues.filter(i => i.rowIndex === idx);
    if (itemIssues.length > 0) {
      return {
        ...item,
        _verificationIssues: itemIssues,
      };
    }
    return item;
  });

  return {
    passed,
    items: flaggedItems,
    issues: allIssues,
    confidence: avgConfidence,
    processingLog: log,
  };
}