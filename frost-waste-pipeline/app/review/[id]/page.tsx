import { createServiceRoleClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle,
  Save,
  ArrowRight
} from "lucide-react";
import { ReverifyButton } from "@/components/reverify-button";
import { ExcelViewer } from "@/components/excel-viewer";
import { ReviewForm } from "@/components/review-form";
import { PaginatedTable } from "@/components/paginated-table";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getReviewBreadcrumbs } from "@/lib/breadcrumb-utils";
import { truncateFilename } from "@/lib/filename-utils";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { ProcessingLogViewer } from "@/components/processing-log-viewer";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = createServiceRoleClient();
  const { id } = await params;

  // Fetch document
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (!doc) notFound();

  // Fetch next document needing review (for "Nästa" button)
  const { data: nextDocs } = await supabase
    .from("documents")
    .select("id")
    .eq("status", "needs_review")
    .neq("id", id)
    .order("created_at", { ascending: true })
    .limit(1);
  
  const nextDocId = nextDocs?.[0]?.id;

  // Use preview endpoint to ensure inline display and avoid downloads
  const previewUrl = `/api/preview-file?id=${doc.id}`;
  const isExcel = doc.filename.toLowerCase().endsWith(".xlsx") || 
                  doc.filename.toLowerCase().endsWith(".xls");

  const extractedData = doc.extracted_data || {};
  const lineItems = extractedData.lineItems || [];
  
  // Helper to get value (handle both wrapped {value, confidence} and clean formats)
  const getValue = (field: any): any => {
    if (!field) return null;
    if (typeof field === 'object' && 'value' in field) {
      return field.value;
    }
    return field;
  };

  // === EXPORT PREVIEW DATA ===
  // Apply the SAME fallbacks as the export-to-azure route so users see the final result
  // Get document-level metadata for fallbacks
  const docDate = getValue(extractedData.documentMetadata?.date) || 
                  getValue(extractedData.date) || 
                  (() => {
                    // Try to extract from filename
                    const match = doc.filename.replace(/\s*\(\d+\)/g, '').match(/(\d{4}-\d{2}-\d{2})/);
                    return match ? match[1] : new Date().toISOString().split('T')[0];
                  })();
  const docAddress = getValue(extractedData.documentMetadata?.address) || getValue(extractedData.address) || "";
  const docReceiver = getValue(extractedData.documentMetadata?.receiver) || getValue(extractedData.receiver) || "";
  const docSupplier = getValue(extractedData.documentMetadata?.supplier) || getValue(extractedData.supplier) || "";

  // ✅ Helper: Check if a value is a placeholder/default that should be replaced
  const isPlaceholderValue = (val: string | null | undefined): boolean => {
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
  };

  // Create export preview rows (exactly what will be in Excel)
  // ✅ FIX: Treat placeholder values like "Okänd mottagare" as empty so document-level values apply
  const exportPreviewRows = lineItems.map((item: any, idx: number) => {
    const rowReceiver = getValue(item.receiver);
    const rowLocation = getValue(item.location) || getValue(item.address);
    
    return {
      rowNum: idx + 1,
      date: getValue(item.date) || docDate,
      location: isPlaceholderValue(rowLocation) ? docAddress : rowLocation,
      material: getValue(item.material) || "Okänt material",
      weightKg: parseFloat(String(getValue(item.weightKg) || getValue(item.weight) || 0)),
      unit: getValue(item.unit) || "Kg",
      receiver: isPlaceholderValue(rowReceiver) ? (docReceiver || "Okänd mottagare") : rowReceiver,
      isHazardous: getValue(item.isHazardous) || false,
    };
  });
  
  // Calculate stats from lineItems
  const uniqueAddresses = new Set(
    lineItems
      .map((item: any) => {
        const addr = getValue(item.address) || getValue(item.location);
        return addr && addr !== "SAKNAS" ? addr : null;
      })
      .filter(Boolean)
  ).size;
  
  const uniqueReceivers = new Set(
    lineItems
      .map((item: any) => {
        const rec = getValue(item.receiver);
        return rec || null;
      })
      .filter(Boolean)
  ).size;
  
  const uniqueMaterials = new Set(
    lineItems
      .map((item: any) => {
        const mat = getValue(item.material);
        return mat || null;
      })
      .filter(Boolean)
  ).size;

  const totalWeightKg = lineItems.reduce(
    (sum: number, item: any) => {
      const weight = getValue(item.weightKg);
      return sum + (Number(weight) || 0);
    },
    0
  );

  const totalCost = lineItems.reduce(
    (sum: number, item: any) => {
      const cost = getValue(item.costSEK) || getValue(item.cost);
      return sum + (Number(cost) || 0);
    },
    Number(getValue(extractedData.costSEK) || getValue(extractedData.cost)) || 0
  );

  const totalCo2 = lineItems.reduce(
    (sum: number, item: any) => {
      const co2 = getValue(item.co2Saved) || getValue(item.co2);
      return sum + (Number(co2) || 0);
    },
    0
  );

  // Dynamic column detection - only show columns that exist in data
  function detectExistingColumns(items: any[]): {
    mandatory: string[];
    optional: string[];
  } {
    if (!items || items.length === 0) {
      return { mandatory: [], optional: [] };
    }
    
    // These MUST always be present
    const MANDATORY_FIELDS = ["date", "address", "material", "weightKg", "unit", "receiver"];
    
    // These are optional - only show if they have data
    const OPTIONAL_FIELDS = ["wasteCode", "cost", "costSEK", "co2Saved", "co2", "notes", "quantity", "container", "handling", "isHazardous", "percentage", "referensnummer", "fordon", "avfallskod"];
    
    // Check which optional fields actually have data
    const existingOptional = OPTIONAL_FIELDS.filter(field => {
      return items.some(item => {
        const value = item[field];
        if (value && typeof value === 'object' && 'value' in value) {
          const val = value.value;
          return val !== undefined && val !== null && val !== "" && val !== 0 && val !== "0" && val !== false;
        }
        return value !== undefined && value !== null && value !== "" && value !== 0 && value !== "0" && value !== false;
      });
    });
    
    // Also check top-level cost
    if (extractedData.cost?.value) {
      if (!existingOptional.includes("cost") && !existingOptional.includes("costSEK")) {
        existingOptional.push("cost");
      }
    }
    
    
    return {
      mandatory: MANDATORY_FIELDS,
      optional: existingOptional
    };
  }

  const { mandatory, optional } = detectExistingColumns(lineItems);
  const allColumns = [...mandatory, ...optional];

  // Check if columns exist for display (after optional is defined)
  const hasCost = optional.includes("cost") || optional.includes("costSEK") || extractedData.cost?.value;
  const hasCo2 = optional.includes("co2Saved") || optional.includes("co2");

  // Primary key validation (Adress + Mottagare + Material + Datum)
  const primaryKeys = new Map<string, number[]>();
  lineItems.forEach((item: any, index: number) => {
    const address = getValue(item.address) || getValue(item.location) || getValue(extractedData.address) || "";
    const receiver = getValue(item.receiver) || getValue(extractedData.receiver) || "";
    const material = getValue(item.material) || "";
    const date = getValue(extractedData.date) || "";
    const key = `${address}|${receiver}|${material}|${date}`;
    
    if (!primaryKeys.has(key)) {
      primaryKeys.set(key, []);
    }
    primaryKeys.get(key)!.push(index + 1);
  });

  const duplicateKeys = Array.from(primaryKeys.entries())
    .filter(([_, indices]) => indices.length > 1)
    .map(([key, indices]) => ({ key, indices }));

  // Validation issues - now using export preview data (with fallbacks applied)
  const validation = extractedData._validation || { completeness: 100, issues: [] };
  const issues = [...(validation.issues || [])];
  
  // Check for missing mandatory fields in EXPORT data (after fallbacks)
  exportPreviewRows.forEach((row: any) => {
    if (!row.material || row.material === "Okänt material") {
      issues.push(`KRITISKT: Rad ${row.rowNum} saknar Material`);
    }
    if (!row.weightKg || Number(row.weightKg) === 0) {
      issues.push(`KRITISKT: Rad ${row.rowNum} saknar Vikt`);
    }
    if (!row.location || row.location === "SAKNAS" || String(row.location).trim() === "") {
      issues.push(`VARNING: Rad ${row.rowNum} saknar Adress (använder dokumentnivå: "${docAddress || 'tom'}")`);
    }
    if (!row.receiver || row.receiver === "Okänd mottagare") {
      issues.push(`VARNING: Rad ${row.rowNum} saknar Mottagare (använder fallback: "Okänd mottagare")`);
    }
  });

  // Add duplicate key warnings
  duplicateKeys.forEach(({ indices }) => {
    issues.push(`VARNING: Rad ${indices.join(", ")}: Duplicerad primärnyckel`);
  });

  // Generate AI summary
  const hasCriticalIssues = issues.some((issue: string) => issue.includes("KRITISKT"));
  const aiSummary = hasCriticalIssues
    ? `⚠️ Dokument med ${lineItems.length} rader från ${uniqueAddresses} adresser till ${uniqueReceivers} mottagare. ${issues.filter((i: string) => i.includes("KRITISKT")).length} kritiska problem måste åtgärdas.`
    : `✓ Dokument med ${lineItems.length} rader från ${uniqueAddresses} adresser till ${uniqueReceivers} mottagare (${Array.from(new Set(lineItems.map((i: any) => i.receiver?.value || extractedData.receiver?.value).filter(Boolean))).join(", ")}). All obligatorisk data komplett.`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Breadcrumbs */}
          <Breadcrumbs 
            items={getReviewBreadcrumbs(doc.id, doc.filename)} 
            className="mb-4" 
          />
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <Link
              href="/collecct"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Tillbaka</span>
            </Link>
            <div className="flex items-center gap-3">
              <ReverifyButton docId={doc.id} />
              {doc.status !== 'exported' && (
                <DeleteDocumentButton
                  documentId={doc.id}
                  storagePath={doc.storage_path}
                  filename={doc.filename}
                  redirectAfter="/collecct"
                  variant="button"
                />
              )}
              {nextDocId && (
                <Link
                  href={`/review/${nextDocId}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <span>Nästa dokument</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              doc.status === 'approved' ? 'bg-green-500' :
              doc.status === 'needs_review' ? 'bg-yellow-500' :
              doc.status === 'error' ? 'bg-red-500' :
              'bg-blue-500'
            }`} />
            <span className={`text-xs font-medium uppercase tracking-wider ${
              doc.status === 'approved' ? 'text-green-600' :
              doc.status === 'needs_review' ? 'text-yellow-600' :
              doc.status === 'error' ? 'text-red-600' :
              'text-blue-600'
            }`}>
              {doc.status === 'approved' ? 'GODKÄND' :
               doc.status === 'needs_review' ? 'BEHÖVER GRANSKNING' :
               doc.status === 'error' ? 'FEL' :
               doc.status.toUpperCase()}
            </span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2" title={doc.filename}>
            {truncateFilename(doc.filename, 60)}
          </h1>
          <p className="text-sm text-gray-600">
            Granska och godkänn dokument för Collecct AB.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* AI SUMMARY */}
        <div className={`mb-6 p-4 rounded-lg border ${
          aiSummary.startsWith('✓') 
            ? 'bg-green-50 border-green-200' 
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-start gap-3">
            {aiSummary.startsWith('✓') ? (
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">AI-sammanfattning</h3>
              <p className="text-sm text-gray-700">{aiSummary}</p>
            </div>
          </div>
        </div>

        {/* PROCESSING LOG VIEWER */}
        {extractedData._processingLog && extractedData._processingLog.length > 0 && (
          <div className="mb-6">
            <ProcessingLogViewer 
              documentId={doc.id}
              filename={doc.filename}
              showStoredLogs={extractedData._processingLog}
            />
          </div>
        )}

        {/* DOCUMENT METADATA */}
        {extractedData.documentMetadata && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Dokumentinformation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {extractedData.documentMetadata.date && (
                <div>
                  <label className="text-sm font-medium text-blue-700 block mb-1">Datum</label>
                  <div className="text-gray-900 font-medium">
                    {extractedData.documentMetadata.date}
                  </div>
                </div>
              )}
              {extractedData.documentMetadata.supplier && (
                <div>
                  <label className="text-sm font-medium text-blue-700 block mb-1">Leverantör</label>
                  <div className="text-gray-900 font-medium">
                    {extractedData.documentMetadata.supplier}
                  </div>
                </div>
              )}
              {extractedData.documentMetadata.address && (
                <div>
                  <label className="text-sm font-medium text-blue-700 block mb-1">Projektadress</label>
                  <div className="text-gray-900 font-medium">
                    {extractedData.documentMetadata.address}
                  </div>
                </div>
              )}
              {extractedData.documentMetadata.receiver && (
                <div>
                  <label className="text-sm font-medium text-blue-700 block mb-1">Mottagare</label>
                  <div className="text-gray-900 font-medium">
                    {extractedData.documentMetadata.receiver}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DOCUMENT STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Rader</div>
            <div className="text-2xl font-bold text-gray-900">{lineItems.length}</div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Adresser</div>
            <div className="text-2xl font-bold text-gray-900">{uniqueAddresses || '—'}</div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Mottagare</div>
            <div className="text-2xl font-bold text-gray-900">{uniqueReceivers || '—'}</div>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide">Material</div>
            <div className="text-2xl font-bold text-gray-900">{uniqueMaterials || '—'}</div>
          </div>
        </div>

        {/* COLUMN LEGEND */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">
                Kolumner ({allColumns.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {mandatory.map(col => (
                  <span 
                    key={col}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full font-medium"
                    title="Obligatorisk kolumn"
                  >
                    {col === "date" ? "Datum" : 
                     col === "address" ? "Adress" :
                     col === "material" ? "Material" :
                     col === "weightKg" ? "Vikt" :
                     col === "unit" ? "Enhet" :
                     col === "receiver" ? "Mottagare" : col}
                  </span>
                ))}
                {optional.map(col => (
                  <span 
                    key={col}
                    className="px-3 py-1 bg-purple-100 border border-purple-300 text-purple-700 text-sm rounded-full"
                    title="Valfri kolumn (hittades i data)"
                  >
                    {col === "cost" || col === "costSEK" ? "Kostnad" :
                     col === "co2Saved" || col === "co2" ? "CO2" :
                     col === "wasteCode" || col === "avfallskod" ? "Avfallskod" :
                     col === "referensnummer" ? "Referensnummer" :
                     col === "fordon" ? "Fordon" :
                     col === "container" ? "Container" :
                     col === "handling" ? "Hantering" :
                     col === "isHazardous" ? "Farligt Avfall" :
                     col === "percentage" ? "Procent" :
                     col === "notes" ? "Anteckningar" :
                     col === "quantity" ? "Antal" : col} +
                  </span>
                ))}
              </div>
              
              {/* Show which optional columns were NOT found */}
              {["wasteCode", "costSEK", "co2Saved", "notes"].filter(f => !optional.includes(f) && !optional.includes("cost") && !optional.includes("co2")).length > 0 && (
                <div className="mt-3 text-xs text-gray-600">
                  Saknas i detta dokument: {
                    ["wasteCode", "costSEK", "co2Saved", "notes"]
                      .filter(f => !optional.includes(f) && !optional.includes("cost") && !optional.includes("co2"))
                      .map(f => f === "wasteCode" ? "Avfallskod" : f === "costSEK" ? "Kostnad" : f === "co2Saved" ? "CO2" : f === "notes" ? "Anteckningar" : f)
                      .join(", ")
                  }
                </div>
              )}
            </div>
            <div className="text-xs text-blue-700 lg:ml-4">
              <div className="font-semibold mb-1">Legend:</div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-3 h-3 bg-blue-600 rounded-full"></span>
                <span>Obligatorisk</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 bg-purple-100 border border-purple-300 rounded-full"></span>
                <span>Valfri</span>
              </div>
            </div>
          </div>
        </div>

        {/* PRIMARY KEY INFO */}
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-2">
            Primärnyckel
          </h3>
          <p className="text-sm text-gray-700 mb-3">
            Varje unik kombination av <strong>Adress + Mottagare + Material + Datum</strong> är en rad.
          </p>
          <div className="text-xs text-gray-600 space-y-1">
            <div>• Samma material till olika mottagare = olika rader</div>
            <div>• Samma adress med olika material = olika rader</div>
            <div>• Samma allt = EN rad (duplicerad primärnyckel - VARNING!)</div>
          </div>
          {duplicateKeys.length > 0 && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              <strong>Varning:</strong> {duplicateKeys.length} duplicerade primärnycklar hittades (rad {duplicateKeys.map(d => d.indices.join(", ")).join(", ")})
            </div>
          )}
        </div>

        {/* Left: Document Preview */}
        <div className="mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Förhandsvisning</h2>
            {previewUrl ? (
              isExcel ? (
                <ExcelViewer url={previewUrl} />
              ) : (
                <object
                  data={previewUrl}
                  type="application/pdf"
                  className="w-full h-full min-h-[600px] rounded border border-gray-200"
                  title="PDF Viewer"
                >
                  <embed
                    src={previewUrl}
                    type="application/pdf"
                    className="w-full h-full min-h-[600px] rounded border border-gray-200"
                  />
                  <div className="text-center py-8 text-gray-500">
                    <p>Din webbläsare stödjer inte PDF-förhandsvisning.</p>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Öppna PDF i ny flik
                    </a>
                  </div>
                </object>
              )
            ) : (
              <div className="text-center py-8 text-gray-500">
                Förhandsvisning inte tillgänglig
              </div>
            )}
          </div>
        </div>

        {/* TOTALS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600 mb-1">Total vikt</div>
            <div className="text-2xl font-bold text-gray-900">
              {(totalWeightKg / 1000).toFixed(2)} ton
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {totalWeightKg.toFixed(2)} kg
            </div>
          </div>

          {hasCost && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Total kostnad</div>
              <div className="text-2xl font-bold text-gray-900">
                {totalCost.toLocaleString('sv-SE')} SEK
              </div>
            </div>
          )}

          {hasCo2 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Total CO2</div>
              <div className="text-2xl font-bold text-gray-900">
                {totalCo2.toFixed(2)} kg
              </div>
            </div>
          )}

          {!hasCo2 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Fullständighet</div>
              <div className={`text-2xl font-bold ${
                validation.completeness >= 95 ? 'text-green-600' :
                validation.completeness >= 80 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {validation.completeness?.toFixed(0) || 100}%
              </div>
            </div>
          )}
        </div>

        {/* VALIDATION ISSUES */}
        {issues.length > 0 && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Valideringsproblem ({issues.length})
            </h3>
            <ul className="space-y-1">
              {issues.map((issue: string, idx: number) => (
                <li 
                  key={idx} 
                  className={`text-sm ${
                    issue.includes('KRITISKT') ? 'text-red-800 font-semibold' : 'text-red-700'
                  }`}
                >
                  • {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* RAW EXTRACTED DATA TABLE */}
        {lineItems.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Extraherad Data (Rådata från AI)</h2>
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                {lineItems.length} rader extraherade
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Rå data som AI:n extraherade. Fält med "SAKNAS" fylls i med fallback-värden vid export.
            </p>
            <PaginatedTable 
              lineItems={lineItems}
              columns={allColumns}
            />
          </div>
        )}

        {/* Right: Review Form */}
        <div className="mb-6">
          <ReviewForm
            initialData={extractedData}
            documentId={doc.id}
            nextDocId={nextDocId}
          />
        </div>

        {/* === EXPORT PREVIEW === */}
        {/* Shows EXACTLY what will be in the Excel file uploaded to Azure */}
        {exportPreviewRows.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Förhandsgranskning av Export
              </h2>
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full font-medium">
                {exportPreviewRows.length} rader → Excel
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Detta är exakt vad som kommer att exporteras till Excel-filen i Azure. 
              Fallback-värden från dokumentnivå har applicerats där data saknas.
            </p>
            
            <div className="bg-white rounded-lg border-2 border-green-200 overflow-hidden">
              <div className="bg-green-50 px-4 py-2 border-b border-green-200">
                <span className="text-sm font-medium text-green-800">
                  Excel-format (Simplitics-kompatibel)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-blue-600 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Utförtdatum</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Hämtställe</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Material</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Kvantitet</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Enhet</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Leveransställe</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase">Farligt avfall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {exportPreviewRows.map((row: any) => (
                      <tr key={row.rowNum} className="hover:bg-green-50">
                        <td className="px-4 py-3 text-sm text-gray-500">{row.rowNum}</td>
                        <td className="px-4 py-3 text-sm font-medium">{row.date}</td>
                        <td className="px-4 py-3 text-sm">{row.location || <span className="text-gray-400">-</span>}</td>
                        <td className="px-4 py-3 text-sm">{row.material}</td>
                        <td className="px-4 py-3 text-sm font-mono">
                          {row.weightKg.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm">{row.unit}</td>
                        <td className="px-4 py-3 text-sm">{row.receiver}</td>
                        <td className="px-4 py-3 text-sm">
                          {row.isHazardous ? (
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">Ja</span>
                          ) : (
                            <span className="text-gray-500">Nej</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Summary of fallbacks applied */}
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Fallback-värden (dokumentnivå):</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-blue-700 font-medium">Datum:</span>{' '}
                  <span className="text-gray-900">{docDate}</span>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Adress:</span>{' '}
                  <span className="text-gray-900">{docAddress || <span className="text-gray-400">-</span>}</span>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Mottagare:</span>{' '}
                  <span className="text-gray-900">{docReceiver || "Okänd mottagare"}</span>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Leverantör:</span>{' '}
                  <span className="text-gray-900">{docSupplier || <span className="text-gray-400">-</span>}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
