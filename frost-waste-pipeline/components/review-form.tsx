"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SmartInput } from "@/components/smart-input";
import { saveDocument } from "@/app/actions";
import { ArrowRight, Save, Skull, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

export function ReviewForm({
  initialData,
  documentId,
  nextDocId,
}: {
  initialData?: any;
  documentId: string;
  nextDocId?: string;
}) {
  const router = useRouter();
  const data = initialData || {};

  // State for editable document-level metadata (pre-filled from AI extraction)
  const [documentDate, setDocumentDate] = useState("");
  const [documentSupplier, setDocumentSupplier] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [mainReceiver, setMainReceiver] = useState("");
  
  // Success toast state
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Track if form has been modified
  const [hasBeenModified, setHasBeenModified] = useState(false);

  // Pre-fill metadata from AI extraction when component loads
  useEffect(() => {
    const metadata = data.documentMetadata || {};
    
    // Pre-fill from documentMetadata (from PDF extraction) or fallback to top-level fields
    setDocumentDate(
      metadata.date || 
      (typeof data.date === 'object' ? data.date?.value : data.date) || 
      ""
    );
    setDocumentSupplier(
      metadata.supplier || 
      (typeof data.supplier === 'object' ? data.supplier?.value : data.supplier) || 
      ""
    );
    setProjectAddress(
      metadata.address || 
      (typeof data.address === 'object' ? data.address?.value : data.address) || 
      ""
    );
    setMainReceiver(
      metadata.receiver || 
      (typeof data.receiver === 'object' ? data.receiver?.value : data.receiver) || 
      ""
    );
  }, [data]);

  // Helper function to normalize data (handle both wrapped {value, confidence} and clean formats)
  const normalizeValue = (field: any): any => {
    if (!field) return null;
    if (typeof field === 'object' && 'value' in field) {
      return field; // Already wrapped
    }
    return { value: field, confidence: 1 }; // Wrap clean data
  };

  // Normalize lineItems to ensure consistent format
  // IMPORTANT: Preserve ALL original fields, not just the ones we display in the form
  const normalizeLineItems = (items: any[]): any[] => {
    return items.map(item => {
      // Start with ALL original fields to preserve data like wasteCode, referensnummer, fordon, etc.
      const normalizedItem: any = {};
      
      // Copy ALL original fields, normalizing their format
      for (const key of Object.keys(item)) {
        normalizedItem[key] = normalizeValue(item[key]);
      }
      
      // Ensure critical fields are properly set (with fallbacks)
      normalizedItem.material = normalizeValue(item.material);
      normalizedItem.weightKg = normalizeValue(item.weightKg);
      normalizedItem.location = normalizeValue(item.location || item.address);
      normalizedItem.address = normalizeValue(item.address || item.location);
      normalizedItem.receiver = normalizeValue(item.receiver);
      normalizedItem.date = normalizeValue(item.date);
      normalizedItem.handling = normalizeValue(item.handling);
      normalizedItem.isHazardous = normalizeValue(item.isHazardous);
      normalizedItem.co2Saved = normalizeValue(item.co2Saved || item.co2);
      normalizedItem.costSEK = normalizeValue(item.costSEK || item.cost);
      normalizedItem.unit = normalizeValue(item.unit || "Kg");
      
      return normalizedItem;
    });
  };
  
  // State för rader så vi kan loopa och räkna
  const [lineItems, setLineItems] = useState(() => {
    const items = data.lineItems || [];
    return normalizeLineItems(items);
  });
  
  const [totals, setTotals] = useState({
    weight: data.totalWeightKg || (typeof data.weightKg === 'object' ? data.weightKg?.value : data.weightKg) || 0,
    cost: data.totalCostSEK || (typeof data.cost === 'object' ? data.cost?.value : data.cost) || 0,
    co2: (typeof data.totalCo2Saved === 'object' ? data.totalCo2Saved?.value : data.totalCo2Saved) || 
         (typeof data.co2Saved === 'object' ? data.co2Saved?.value : data.co2Saved) || 0,
  });

  // Unsaved changes warning
  const { safeNavigate } = useUnsavedChanges({
    hasUnsavedChanges: hasBeenModified,
    message: "Du har osparade ändringar. Är du säker på att du vill lämna sidan?",
  });

  // LIVE-RÄKNARE 🧮
  useEffect(() => {
    if (lineItems.length > 0) {
      const newWeight = lineItems.reduce(
        (sum: number, item: any) => {
          const weight = typeof item.weightKg === 'object' ? item.weightKg?.value : item.weightKg;
          return sum + (Number(weight) || 0);
        },
        0
      );
      const newCo2 = lineItems.reduce(
        (sum: number, item: any) => {
          const co2 = typeof item.co2Saved === 'object' ? item.co2Saved?.value : item.co2Saved;
          return sum + (Number(co2) || 0);
        },
        0
      );
      const newCost = lineItems.reduce(
        (sum: number, item: any) => {
          const cost = typeof item.costSEK === 'object' ? item.costSEK?.value : item.costSEK;
          return sum + (Number(cost) || 0);
        },
        0
      );

      setTotals({
        weight: newWeight,
        co2: newCo2,
        cost: newCost,
      });
    }
  }, [lineItems]);

  // Funktion för att uppdatera en rad när man skriver
  const updateLineItem = (index: number, field: string, value: any) => {
    setHasBeenModified(true);
    const newItems = [...lineItems];
    
    // Ensure field exists and is in wrapped format
    if (!newItems[index][field]) {
      newItems[index][field] = { value: null, confidence: 1 };
    }
    
    // If field is not wrapped, wrap it
    if (typeof newItems[index][field] !== 'object' || !('value' in newItems[index][field])) {
      newItems[index][field] = { value: newItems[index][field], confidence: 1 };
    }
    
    // Update the value
        newItems[index][field].value = value;
    
    // If updating address, also update location (and vice versa)
    if (field === "address") {
      if (!newItems[index].location) {
        newItems[index].location = { value: null, confidence: 1 };
      }
      if (typeof newItems[index].location !== 'object' || !('value' in newItems[index].location)) {
        newItems[index].location = { value: newItems[index].location, confidence: 1 };
      }
      newItems[index].location.value = value;
    }
    if (field === "location") {
      if (!newItems[index].address) {
        newItems[index].address = { value: null, confidence: 1 };
      }
      if (typeof newItems[index].address !== 'object' || !('value' in newItems[index].address)) {
        newItems[index].address = { value: newItems[index].address, confidence: 1 };
      }
      newItems[index].address.value = value;
    }

    setLineItems(newItems);
  };

  // Ta bort rad
  const removeLineItem = (index: number) => {
    setHasBeenModified(true);
    const newItems = lineItems.filter((_: any, i: number) => i !== index);
    setLineItems(newItems);
  };

  // Lägg till ny rad
  const addLineItem = () => {
    setHasBeenModified(true);
    const newItem = {
      material: { value: "", confidence: 1 },
      weightKg: { value: 0, confidence: 1 },
      handling: { value: "", confidence: 1 },
      isHazardous: { value: false, confidence: 1 },
      co2Saved: { value: 0, confidence: 1 },
      address: { value: data.address?.value || "", confidence: 1 },
      receiver: { value: data.receiver?.value || "", confidence: 1 },
      // Date defaults to document date (can be overridden per row)
      date: { value: documentDate || "", confidence: 1 },
    };
    setLineItems([...lineItems, newItem]);
  };

  // Show address column if ANY row has address field OR if we have rows (always show for editing)
  // This allows users to fill in missing addresses even if all rows have "SAKNAS"
  const hasLineAddress = lineItems.length > 0 && (
    lineItems.some((item: any) => {
      const addr = typeof item.address === 'object' ? item.address?.value : item.address;
      const loc = typeof item.location === 'object' ? item.location?.value : item.location;
      return addr !== undefined || loc !== undefined;
    }) || true // Always show if we have rows - allows editing missing addresses
  );
  
  const hasLineReceiver = lineItems.some((item: any) => {
    const rec = typeof item.receiver === 'object' ? item.receiver?.value : item.receiver;
    return rec && String(rec).length > 1;
  });
  
  const hasHandling = lineItems.some((item: any) => {
    const hand = typeof item.handling === 'object' ? item.handling?.value : item.handling;
    return hand && String(hand).length > 0;
  });

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, goToNext: boolean = false) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      
      // Helper to get value from wrapped or clean format
      const getValue = (field: any): any => {
        if (!field) return null;
        if (typeof field === 'object' && 'value' in field) {
          return field.value;
        }
        return field;
      };
      
      // Add lineItems to formData
      lineItems.forEach((item: any, index: number) => {
        const material = getValue(item.material);
        const weightKg = getValue(item.weightKg);
        const address = getValue(item.address) || getValue(item.location);
        const receiver = getValue(item.receiver);
        const handling = getValue(item.handling);
        const isHazardous = getValue(item.isHazardous);
        const co2Saved = getValue(item.co2Saved);
        // Get row-specific date (or document date as fallback)
        const rowDate = getValue(item.date) || documentDate;
        
        formData.append(`lineItems[${index}].material`, material || "");
        formData.append(`lineItems[${index}].weightKg`, String(weightKg || 0));
        if (handling) {
          formData.append(`lineItems[${index}].handling`, handling);
        }
        formData.append(`lineItems[${index}].isHazardous`, String(isHazardous || false));
        if (co2Saved) {
          formData.append(`lineItems[${index}].co2Saved`, String(co2Saved));
        }
        if (address && address !== "SAKNAS") {
          formData.append(`lineItems[${index}].address`, address);
          formData.append(`lineItems[${index}].location`, address);
        }
        if (receiver) {
          formData.append(`lineItems[${index}].receiver`, receiver);
        }
        // ✅ Include row-specific date (critical for export!)
        if (rowDate) {
          formData.append(`lineItems[${index}].date`, rowDate);
        }
      });
      
      // Add totals
      formData.append("totalCo2Saved", String(totals.co2));
      formData.append("weightKg", String(totals.weight));
      formData.append("cost", String(totals.cost));
      
      // Add edited document metadata
      formData.append("date", documentDate);
      formData.append("supplier", documentSupplier);
      formData.append("address", projectAddress);
      formData.append("receiver", mainReceiver);
      
      await saveDocument(formData);
      
      // Mark as clean after successful save
      setHasBeenModified(false);
      
      // Show success toast
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      
      // Handle navigation based on button clicked
      if (goToNext) {
        // "Spara & Nästa" - navigate to next document or dashboard
        if (nextDocId) {
          router.push(`/review/${nextDocId}`);
        } else {
          // No more documents to review, go back to dashboard
          router.push('/collecct');
        }
      } else {
        // "Spara" - stay on same page, refresh to show updated data
        router.refresh();
      }
      
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle metadata field changes
  const handleMetadataChange = (setter: (val: string) => void, value: string) => {
    setHasBeenModified(true);
    setter(value);
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="bg-white rounded-lg shadow p-6 space-y-6">
      <input type="hidden" name="id" value={documentId} />
      
      {/* UNSAVED CHANGES INDICATOR */}
      {hasBeenModified && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-700">Osparade ändringar</span>
        </div>
      )}
      
      {/* SUCCESS TOAST */}
      {showSuccess && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Sparat!</span>
        </div>
      )}
      
      {/* GRUNDLÄGGANDE INFORMATION */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Grundläggande Information
        </h3>
        
        {/* Info message if metadata was auto-extracted */}
        {data.documentMetadata && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700">
              ℹ️ Dessa fält är förfyllda från AI-extraktionen. Du kan redigera dem om något är fel.
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Datum - EDITABLE */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Datum
            </label>
            <input
              type="date"
              name="date"
              value={documentDate}
              onChange={(e) => handleMetadataChange(setDocumentDate, e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none transition-all shadow-sm focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          
          {/* Leverantör - EDITABLE */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Leverantör
            </label>
            <input
              type="text"
              name="supplier"
              value={documentSupplier}
              onChange={(e) => handleMetadataChange(setDocumentSupplier, e.target.value)}
              placeholder="t.ex. Stefan Hallberg"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none transition-all shadow-sm focus:ring-blue-100 focus:border-blue-400"
            />
            <p className="text-xs text-slate-400 mt-1.5 font-light">t.ex. Returab</p>
          </div>
        </div>
      </div>

      {/* TOTALER */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Totaler (Live)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
          <div>
            <div className="text-xs text-gray-500 mb-1">CO2 Besparing</div>
            <div className="text-xl font-bold text-green-600">
              {totals.co2.toFixed(0)} kg
            </div>
            <input type="hidden" name="totalCo2Saved" value={totals.co2} />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Vikt</div>
            <div className="text-xl font-bold">{totals.weight.toFixed(0)} kg</div>
            <input type="hidden" name="weightKg" value={totals.weight} />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Kostnad</div>
            <div className="text-xl font-bold">{totals.cost.toFixed(0)} kr</div>
            <input type="hidden" name="cost" value={totals.cost} />
          </div>
        </div>
      </div>

      {/* HÄMTADRESS & MOTTAGARE (HUVUD) */}
      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Hämtadress (Huvud)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Projektadress - EDITABLE */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Projektadress
            </label>
            <input
              type="text"
              name="address"
              value={projectAddress}
              onChange={(e) => handleMetadataChange(setProjectAddress, e.target.value)}
              placeholder="t.ex. Östergårds Förskola"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none transition-all shadow-sm focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          
          {/* Mottagare (Huvud) - EDITABLE */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              Mottagare (Huvud)
            </label>
            <input
              type="text"
              name="receiver"
              value={mainReceiver}
              onChange={(e) => handleMetadataChange(setMainReceiver, e.target.value)}
              placeholder="t.ex. Renova"
              className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none transition-all shadow-sm focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* SPECIFIKATION - MATERIAL TABLE */}
      <div className="border-t pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Specifikation - Material ({lineItems.length} rader)
          </h3>
                            <button 
                                type="button"
            onClick={addLineItem}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
            <Plus className="w-4 h-4" />
            Lägg till rad
                            </button>
        </div>

        {lineItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
            Inga rader. Klicka "Lägg till rad" för att lägga till material.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                    Material
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                    Vikt (kg)
                  </th>
                  {hasHandling && (
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                      Hantering
                    </th>
                  )}
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                    CO2
                  </th>
                  <th className="text-center text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                    Farligt
                  </th>
                  {hasLineAddress && (
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                      Adress
                    </th>
                  )}
                  {hasLineReceiver && (
                    <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                      Mottagare
                    </th>
                  )}
                  <th className="text-left text-xs font-semibold text-gray-600 uppercase py-2 px-2">
                    Datum
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item: any, index: number) => {
                  // Check for missing required fields (for highlighting)
                  const materialValue = typeof item.material === 'object' ? item.material?.value : item.material;
                  const weightValue = typeof item.weightKg === 'object' ? item.weightKg?.value : item.weightKg;
                  const addressValue = typeof item.address === 'object' ? item.address?.value : item.address;
                  const locationValue = typeof item.location === 'object' ? item.location?.value : item.location;
                  const receiverValue = typeof item.receiver === 'object' ? item.receiver?.value : item.receiver;
                  // Get row date - defaults to document date if not set
                  const rowDateValue = typeof item.date === 'object' ? item.date?.value : item.date;
                  // Display date: use row date if available, otherwise show document date
                  const displayDate = rowDateValue || documentDate || "";
                  
                  const missingMaterial = !materialValue || String(materialValue).trim() === "";
                  const missingWeight = !weightValue || Number(weightValue) === 0;
                  const missingAddress = (!addressValue || String(addressValue) === "SAKNAS") && 
                                        (!locationValue || String(locationValue) === "SAKNAS");
                  const missingReceiver = !receiverValue || String(receiverValue).trim() === "";
                  
                  return (
                  <tr 
                    key={index} 
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      missingMaterial || missingWeight ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        name={`lineItems[${index}].material`}
                        value={materialValue || ''}
                        onChange={(e) => updateLineItem(index, "material", e.target.value)}
                        placeholder={missingMaterial ? "SAKNAS - Fyll i" : ""}
                        className={`w-full text-sm px-2 py-1 border rounded ${
                          missingMaterial ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        name={`lineItems[${index}].weightKg`}
                        value={weightValue || ''}
                        onChange={(e) => updateLineItem(index, "weightKg", parseFloat(e.target.value) || 0)}
                        placeholder={missingWeight ? "SAKNAS" : ""}
                        className={`w-full text-sm px-2 py-1 border rounded ${
                          missingWeight ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                      />
                        </td>
                     {hasHandling && (
                      <td className="py-2 px-2">
                        <SmartInput
                          label=""
                          name={`lineItems[${index}].handling`}
                          type="text"
                          fieldData={item.handling}
                          onChange={(e) =>
                            updateLineItem(index, "handling", e.target.value)
                          }
                          className="text-sm border-0 shadow-none focus:ring-0 p-1"
                        />
                        </td>
                    )}
                    <td className="py-2 px-2">
                        <SmartInput 
                        label=""
                        name={`lineItems[${index}].co2Saved`}
                        type="number"
                        fieldData={item.co2Saved}
                        onChange={(e) =>
                          updateLineItem(index, "co2Saved", parseFloat(e.target.value) || 0)
                        }
                        className="text-sm border-0 shadow-none focus:ring-0 p-1"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={item.isHazardous?.value || false}
                          onChange={(e) =>
                            updateLineItem(index, "isHazardous", e.target.checked)
                          }
                          className="w-4 h-4"
                        />
                        <input
                          type="hidden"
                          name={`lineItems[${index}].isHazardous`}
                          value={String(item.isHazardous?.value || false)}
                        />
                        {item.isHazardous?.value && (
                          <Skull className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </td>
                    {hasLineAddress && (
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          name={`lineItems[${index}].address`}
                          value={(addressValue || locationValue || '').replace('SAKNAS', '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateLineItem(index, "address", val);
                            updateLineItem(index, "location", val);
                          }}
                          placeholder={missingAddress ? "SAKNAS - Fyll i adress" : ""}
                          className={`w-full text-sm px-2 py-1 border rounded ${
                            missingAddress ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300'
                          }`}
                        />
                      </td>
                    )}
                    {hasLineReceiver && (
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          name={`lineItems[${index}].receiver`}
                          value={receiverValue || ''}
                          onChange={(e) => updateLineItem(index, "receiver", e.target.value)}
                          placeholder={missingReceiver ? "SAKNAS" : ""}
                          className={`w-full text-sm px-2 py-1 border rounded ${
                            missingReceiver ? 'border-red-500 bg-red-50' : 'border-gray-300'
                          }`}
                        />
                      </td>
                    )}
                    {/* DATE PER ROW - defaults to document date but can be overridden */}
                    <td className="py-2 px-2">
                      <input
                        type="date"
                        name={`lineItems[${index}].date`}
                        value={displayDate || ''}
                        onChange={(e) => updateLineItem(index, "date", e.target.value)}
                        className="w-full text-sm px-2 py-1 border border-gray-300 rounded"
                        title={rowDateValue ? "Rad-specifikt datum" : "Använder dokumentets datum"}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Ta bort rad"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
        )}
        </div>

      {/* ACTIONS */}
      <div className="flex justify-end gap-4 pt-6 border-t">
            <button
                type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
                <Save className="w-4 h-4" />
          )}
          Spara
        </button>
        <button
          type="button"
          onClick={(e) => {
            const form = e.currentTarget.closest('form');
            if (form) {
              handleSubmit({ preventDefault: () => {}, currentTarget: form } as any, true);
            }
          }}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Sparar...' : 'Spara & Nästa'}
          <ArrowRight className="w-4 h-4" />
            </button>
      </div>
    </form>
  );
}
