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

  // Get signed URL for file preview
  const { data } = await supabase.storage
    .from("raw_documents")
    .createSignedUrl(doc.storage_path, 3600);

  const signedUrl = data?.signedUrl;
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
    
    console.log("📊 Column detection:");
    console.log("  Mandatory:", MANDATORY_FIELDS);
    console.log("  Optional (found):", existingOptional);
    console.log("  Optional (not found):", OPTIONAL_FIELDS.filter(f => !existingOptional.includes(f)));
    
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

  // Validation issues
  const validation = extractedData._validation || { completeness: 100, issues: [] };
  const issues = [...(validation.issues || [])];
  
  // Check for missing mandatory fields
  lineItems.forEach((item: any, index: number) => {
    const material = getValue(item.material);
    const weightKg = getValue(item.weightKg);
    const address = getValue(item.address) || getValue(item.location) || getValue(extractedData.address);
    const receiver = getValue(item.receiver) || getValue(extractedData.receiver);
    
    if (!material || String(material).trim() === "") {
      issues.push(`KRITISKT: Rad ${index + 1} saknar Material`);
    }
    if (!weightKg || Number(weightKg) === 0) {
      issues.push(`KRITISKT: Rad ${index + 1} saknar Vikt`);
    }
    if (!address || address === "SAKNAS" || String(address).trim() === "") {
      issues.push(`KRITISKT: Rad ${index + 1} saknar Adress`);
    }
    if (!receiver || String(receiver).trim() === "") {
      issues.push(`KRITISKT: Rad ${index + 1} saknar Mottagare`);
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
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/collecct"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Tillbaka</span>
            </Link>
            <ReverifyButton docId={doc.id} />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-green-600 uppercase tracking-wider">
              SYSTEM ONLINE
            </span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {doc.filename}
          </h1>
          <p className="text-sm text-gray-600">
            Granska och godkänn dokument för Collecct AB.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
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
          <div className="flex items-start justify-between">
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
            <div className="text-xs text-blue-700 ml-4">
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

        {/* MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
          {/* Left: Document Preview */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Förhandsvisning</h2>
              {signedUrl ? (
                isExcel ? (
                  <ExcelViewer url={signedUrl} />
                ) : (
                  <iframe 
                    src={signedUrl} 
                    className="w-full h-full min-h-[600px] rounded border border-gray-200" 
                    title="PDF Viewer" 
                  />
                )
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Förhandsvisning inte tillgänglig
                </div>
              )}
            </div>
          </div>

          {/* Right: Review Form */}
          <div className="space-y-4">
            <ReviewForm
              initialData={extractedData}
              documentId={doc.id}
            />
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

        {/* DATA TABLE WITH PAGINATION */}
        {lineItems.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Extraherad Data</h2>
            <PaginatedTable 
              lineItems={lineItems}
              columns={allColumns}
            />
          </div>
        )}
      </div>
    </div>
  );
}
