"use client";

import { useState, useEffect } from "react";
import { SmartInput } from "@/components/smart-input";
import { saveDocument } from "@/app/actions";
import { ArrowRight, Save, Skull } from "lucide-react";

export function ReviewForm({ doc }: { doc: any }) {
  const initialData = doc.extracted_data || {};
  
  // State för rader så vi kan loopa och räkna
  const [lineItems, setLineItems] = useState(initialData.lineItems || []);
  const [totals, setTotals] = useState({
    weight: initialData.weightKg?.value || 0,
    cost: initialData.cost?.value || 0,
    co2: initialData.totalCo2Saved?.value || 0
  });

  // LIVE-RÄKNARE 🧮
  useEffect(() => {
    if (lineItems.length > 0) {
      const newWeight = lineItems.reduce((sum: number, item: any) => sum + (Number(item.weightKg?.value) || 0), 0);
      const newCo2 = lineItems.reduce((sum: number, item: any) => sum + (Number(item.co2Saved?.value) || 0), 0);
      
      // Om raderna har vikt, uppdatera totalvikten. Annars behåll originalet.
      if (newWeight > 0) {
        setTotals(prev => ({ ...prev, weight: newWeight, co2: newCo2 }));
      }
    }
  }, [lineItems]);

  // Funktion för att uppdatera en rad när man skriver
  const updateLineItem = (index: number, field: string, value: any) => {
    const newItems = [...lineItems];
    if (!newItems[index][field]) newItems[index][field] = { value: null, confidence: 1 };
    
    // Hantera checkbox för farligt avfall
    if (field === 'isHazardous') {
        newItems[index][field].value = value; // value är boolean här
    } else {
        newItems[index][field].value = value;
    }
    setLineItems(newItems);
  };

  const hasLineAddress = lineItems.some((item: any) => item.address?.value && item.address.value.length > 1);
  const hasHandling = lineItems.some((item: any) => item.handling?.value);

  return (
    <form action={saveDocument} className="space-y-8">
      <input type="hidden" name="id" value={doc.id} />
      
      {/* GRUNDLÄGGANDE INFO */}
      <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-50 pb-2">Grundläggande Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SmartInput label="Datum" name="date" type="date" fieldData={initialData.date} />
          <SmartInput label="Leverantör" name="supplier" type="text" fieldData={initialData.supplier} />
        </div>
      </section>

      {/* DYNAMISK TABELL */}
      <section className="space-y-6 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-50 pb-2">Specifikation</h3>
        
        <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-6">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-500 font-medium">
              <tr>
                <th className="p-3 pl-4">Material</th>
                {hasLineAddress && <th className="p-3">Hämtställe</th>}
                {hasHandling && <th className="p-3">Hantering</th>}
                <th className="p-3 text-right">Vikt (kg)</th>
                <th className="p-3 text-right text-green-600">CO2</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {lineItems.length > 0 ? (
                lineItems.map((item: any, index: number) => (
                  <tr key={index}>
                    <td className="p-2">
                       <div className="flex items-center gap-2">
                            {/* Klickbar Skalle för Farligt Avfall */}
                            <button 
                                type="button"
                                onClick={() => updateLineItem(index, 'isHazardous', !item.isHazardous?.value)}
                                className={`p-1 rounded transition-colors ${item.isHazardous?.value ? 'text-red-600 bg-red-50' : 'text-slate-200 hover:text-slate-400'}`}
                                title="Markera som farligt avfall"
                            >
                                <Skull className="w-4 h-4" />
                            </button>
                            <input type="hidden" name={`lineItems[${index}].isHazardous`} value={String(item.isHazardous?.value)} />

                            <SmartInput 
                                label="" name={`lineItems[${index}].material`} type="text" 
                                fieldData={item.material} 
                                onChange={(e) => updateLineItem(index, 'material', e.target.value)}
                                className="border-0 shadow-none focus:ring-0 p-1 font-medium" 
                            />
                       </div>
                    </td>
                    
                    {hasLineAddress && (
                        <td className="p-2">
                            <SmartInput label="" name={`lineItems[${index}].address`} type="text" fieldData={item.address} className="border-0 shadow-none focus:ring-0 p-1 text-xs" />
                        </td>
                    )}
                     {hasHandling && (
                        <td className="p-2">
                            <SmartInput label="" name={`lineItems[${index}].handling`} type="text" fieldData={item.handling} className="border-0 shadow-none focus:ring-0 p-1 text-slate-500" />
                        </td>
                    )}

                    <td className="p-2 text-right">
                        <SmartInput 
                            label="" name={`lineItems[${index}].weightKg`} type="number" 
                            fieldData={item.weightKg}
                            // Här sker magin: onChange uppdaterar state -> useEffect räknar om totalen
                            onChange={(e) => updateLineItem(index, 'weightKg', e.target.value)}
                            className="border-0 shadow-none focus:ring-0 p-1 text-right font-mono" 
                        />
                    </td>
                    <td className="p-2 text-right text-green-600">
                        <SmartInput 
                            label="" name={`lineItems[${index}].co2Saved`} type="number" 
                            fieldData={item.co2Saved}
                            onChange={(e) => updateLineItem(index, 'co2Saved', e.target.value)}
                            className="border-0 shadow-none focus:ring-0 p-1 text-right font-mono text-green-600" 
                        />
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Inga rader.</td></tr>
              )}
            </tbody>
          </table>

          {/* TOTALER - UPPDATERAS LIVE */}
          <div className="bg-slate-100 p-3 flex justify-between items-center border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Totaler (Live)</span>
            <div className="flex gap-6">
               <div className="text-right">
                 <span className="block text-[10px] text-green-600 font-medium">CO2 Besparing</span>
                 <span className="font-bold text-green-700 text-lg transition-all duration-300">-{totals.co2.toFixed(1)} kg</span>
                 <input type="hidden" name="totalCo2Saved" value={totals.co2} />
               </div>
               <div className="text-right">
                 <span className="block text-[10px] text-slate-400">Total Vikt</span>
                 <span className="font-bold text-slate-900 text-lg transition-all duration-300">{totals.weight.toFixed(1)} kg</span>
                 <input type="hidden" name="weightKg" value={totals.weight} />
               </div>
               <div className="text-right">
                  <span className="block text-[10px] text-slate-400">Kostnad</span>
                   {/* Kostnad uppdateras inte live här för enkelhetens skull, men kan läggas till */}
                  <span className="font-bold text-slate-700">{totals.cost} kr</span>
                  <input type="hidden" name="cost" value={totals.cost} />
               </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Footer med Legacy-fält och Knappar */}
      <div className="pt-4 pb-20">
         <div className="grid grid-cols-2 gap-6 mb-8">
            <SmartInput label="Hämtadress (Huvud)" name="address" type="text" fieldData={initialData.address} />
            <SmartInput label="Mottagare (Huvud)" name="receiver" type="text" fieldData={initialData.receiver} />
         </div>
         <input type="hidden" name="material" value={initialData.material?.value || "Blandat"} />

         {/* KNAPP FÖR "SPARA & NÄSTA" */}
         <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
                type="submit"
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-xl font-medium transition-all hover:scale-[1.02] shadow-xl shadow-slate-200"
            >
                <Save className="w-4 h-4" />
                Spara & Nästa
                <ArrowRight className="w-4 h-4 ml-1 opacity-50" />
            </button>
         </div>
      </div>
    </form>
  );
}