"use client";

import { useState } from "react";
import { Save, Plus, Trash2, Sliders, Database, FileSpreadsheet, ShieldAlert, Zap } from "lucide-react";
import Link from "next/link";

// Mock-data för material (i en riktig app hämtar vi detta från DB)
const INITIAL_MATERIALS = [
  { id: 1, name: "Trä", aliases: ["Brädor", "Virke", "Lastpall", "Spont"] },
  { id: 2, name: "Gips", aliases: ["Gipsskivor", "Rivningsgips", "Gipsspill"] },
  { id: 3, name: "Betong", aliases: ["Armerad betong", "Betongkross"] },
  { id: 4, name: "Brännbart", aliases: ["Restavfall", "Blandat brännbart"] },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("materials");
  const [materials, setMaterials] = useState(INITIAL_MATERIALS);
  const [confidenceThreshold, setConfidenceThreshold] = useState(80);

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-20">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">Dashboard</Link>
             <span className="text-slate-300">/</span>
             <h1 className="font-serif text-lg text-slate-900">Inställningar</h1>
          </div>
          <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> Spara ändringar
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* SIDEBAR NAVIGATION */}
          <aside className="w-full md:w-64 flex-shrink-0">
            <nav className="space-y-1">
              <button 
                onClick={() => setActiveTab("materials")}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${activeTab === "materials" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-slate-100"}`}
              >
                <Database className="w-4 h-4" />
                Material & Synonymer
              </button>
              <button 
                onClick={() => setActiveTab("ai")}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${activeTab === "ai" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-slate-100"}`}
              >
                <Zap className="w-4 h-4" />
                AI & Automation
              </button>
              <button 
                onClick={() => setActiveTab("export")}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${activeTab === "export" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-slate-100"}`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export & Rapporter
              </button>
            </nav>
          </aside>

          {/* CONTENT AREA */}
          <div className="flex-1 space-y-6">
            
            {/* --- TAB: MATERIAL --- */}
            {activeTab === "materials" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="mb-6">
                    <h2 className="text-lg font-bold text-slate-900">Materialbibliotek</h2>
                    <p className="text-sm text-slate-500">Lär AI:n dina benämningar. Om fakturan säger "Virke", mappar vi det till "Trä".</p>
                  </div>

                  <div className="space-y-4">
                    {materials.map((mat) => (
                      <div key={mat.id} className="group p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:border-slate-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            {mat.name}
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full uppercase tracking-wide">Standard</span>
                          </h3>
                          <button className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {mat.aliases.map((alias, i) => (
                            <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs text-slate-600">
                              {alias}
                            </span>
                          ))}
                          <button className="px-2 py-1 border border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 rounded-md text-xs flex items-center gap-1 transition-colors">
                            <Plus className="w-3 h-3" /> Synonym
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button className="mt-6 w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium hover:border-slate-300 hover:text-slate-600 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Lägg till nytt huvudmaterial
                  </button>
                </div>
              </div>
            )}

            {/* --- TAB: AI & AUTOMATION --- */}
            {activeTab === "ai" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                
                {/* Confidence Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-slate-900">Säkerhetströskel</h2>
                      <p className="text-sm text-slate-500 mb-6">
                        Bestäm när AI:n ska be om mänsklig granskning. Lägre värde betyder mer automation, men högre risk för fel.
                      </p>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-slate-500">Tillåtande (60%)</span>
                          <span className="text-blue-600">{confidenceThreshold}%</span>
                          <span className="text-slate-500">Strikt (99%)</span>
                        </div>
                        <input 
                          type="range" 
                          min="60" 
                          max="99" 
                          value={confidenceThreshold}
                          onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-xs text-slate-400 italic">
                          Just nu: Alla fält med under {confidenceThreshold}% säkerhet kommer markeras med gul varning.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto-Approve Card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm opacity-50 grayscale cursor-not-allowed">
                   <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold text-slate-900">Auto-Godkännande</h3>
                      <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] uppercase font-bold rounded">Enterprise</span>
                   </div>
                   <p className="text-sm text-slate-500">Hoppa över granskning helt för dokument med 100% säkerhet.</p>
                </div>

              </div>
            )}

            {/* --- TAB: EXPORT --- */}
            {activeTab === "export" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h2 className="text-lg font-bold text-slate-900 mb-6">Exportinställningar</h2>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">Standardformat</p>
                        <p className="text-xs text-slate-500">Vilket format föredrar du vid snabb-export?</p>
                      </div>
                      <select className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2 outline-none">
                        <option>Excel (.xlsx)</option>
                        <option>CSV (Semikolon-separerad)</option>
                        <option>JSON (API Standard)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">Inkludera "Line Items"</p>
                        <p className="text-xs text-slate-500">Skapa en rad per fraktion istället för per dokument.</p>
                      </div>
                      <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full cursor-pointer bg-green-500">
                        <span className="absolute left-6 top-1 bg-white w-4 h-4 rounded-full shadow-sm"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}