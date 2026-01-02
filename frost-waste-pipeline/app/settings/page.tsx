"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  Package, 
  Zap, 
  FileText, 
  Cloud,
  Plus,
  X,
  Save,
  AlertCircle
} from "lucide-react";

interface Settings {
  auto_approve_threshold: number;
  enterprise_auto_approve: boolean;
  material_synonyms: Record<string, string[]>;
  enable_verification: boolean;
  verification_confidence_threshold: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Local state for editing
  const [threshold, setThreshold] = useState(80);
  const [synonyms, setSynonyms] = useState<Record<string, string[]>>({});
  const [newSynonym, setNewSynonym] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");
  
  // Verification settings
  const [enableVerification, setEnableVerification] = useState(false);
  const [verificationThreshold, setVerificationThreshold] = useState(85);

  // Active sidebar item
  const [activeSection, setActiveSection] = useState("material");

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      
      if (data.success) {
        setSettings(data.settings);
        setThreshold(data.settings.auto_approve_threshold);
        setSynonyms(data.settings.material_synonyms);
        setEnableVerification(data.settings.enable_verification ?? false);
        setVerificationThreshold((data.settings.verification_confidence_threshold ?? 0.85) * 100);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveThreshold = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/threshold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: "Kunde inte spara inställningar" });
    } finally {
      setSaving(false);
    }
  };

  const saveVerificationSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enable_verification: enableVerification,
          verification_confidence_threshold: verificationThreshold / 100
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: "Verifieringsinställningar sparade!" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (error) {
      setMessage({ type: 'error', text: "Kunde inte spara inställningar" });
    } finally {
      setSaving(false);
    }
  };

  const addSynonym = async (category: string) => {
    console.log("🔵 addSynonym called");
    console.log("  Category:", category);
    console.log("  newSynonym state:", newSynonym);
    console.log("  Value for this category:", newSynonym[category]);
    
    // Check if synonym exists and is not empty
    if (!newSynonym[category]) {
      console.log("❌ No synonym entered for category:", category);
      setMessage({ type: 'error', text: 'Skriv in en synonym först!' });
      setTimeout(() => setMessage(null), 2000);
      return;
    }
    
    if (!newSynonym[category].trim()) {
      console.log("❌ Empty synonym (only whitespace)");
      setMessage({ type: 'error', text: 'Synonymen kan inte vara tom!' });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    console.log("🟢 Validation passed, sending to API...");
    console.log("  Payload:", {
      action: "add",
      category,
      synonym: newSynonym[category].trim()
    });

    try {
      const response = await fetch("/api/settings/synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          category,
          synonym: newSynonym[category].trim()
        })
      });

      console.log("📡 Response status:", response.status);
      
      const data = await response.json();
      console.log("📦 Response data:", data);
      
      if (data.success) {
        console.log("✅ Synonym added successfully!");
        setSynonyms(data.material_synonyms);
        setNewSynonym({ ...newSynonym, [category]: "" });
        setMessage({ type: 'success', text: "Synonym tillagd!" });
        setTimeout(() => setMessage(null), 2000);
      } else {
        console.log("❌ API returned success: false");
        setMessage({ type: 'error', text: data.error || "Kunde inte lägga till synonym" });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("💥 Error adding synonym:", error);
      setMessage({ type: 'error', text: "Något gick fel!" });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const removeSynonym = async (category: string, synonym: string) => {
    try {
      const response = await fetch("/api/settings/synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          category,
          synonym
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSynonyms(data.material_synonyms);
        setMessage({ type: 'success', text: "Synonym borttagen!" });
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (error) {
      console.error("Failed to remove synonym:", error);
    }
  };

  const addCategory = async () => {
    console.log("🔵 addCategory called");
    console.log("  New category:", newCategory);
    
    if (!newCategory.trim()) {
      console.log("❌ Empty category name");
      setMessage({ type: 'error', text: 'Skriv in ett kategorinamn först!' });
      setTimeout(() => setMessage(null), 2000);
      return;
    }

    console.log("🟢 Adding new category:", newCategory.trim());

    try {
      // First, add the category to local state
      const updatedSynonyms = {
        ...synonyms,
        [newCategory.trim()]: []
      };
      
      // Then save to database
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_synonyms: updatedSynonyms
        })
      });

      console.log("📡 Response status:", response.status);
      
      const data = await response.json();
      console.log("📦 Response data:", data);
      
      if (data.success) {
        console.log("✅ Category added successfully!");
        setSynonyms(data.settings.material_synonyms);
        setNewCategory("");
        setMessage({ type: 'success', text: "Kategori tillagd!" });
        setTimeout(() => setMessage(null), 2000);
      } else {
        console.log("❌ API returned error:", data.error);
        setMessage({ type: 'error', text: data.error || "Kunde inte lägga till kategori" });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("💥 Error adding category:", error);
      setMessage({ type: 'error', text: "Något gick fel!" });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Laddar inställningar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/collecct"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Tillbaka</span>
            </Link>
            
            <button
              onClick={() => window.location.href = "/collecct"}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Save className="w-4 h-4 inline mr-2" />
              Spara ändringar
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-green-600 uppercase tracking-wider">
              SYSTEM ONLINE
            </span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Dashboard
          </h1>
          <p className="text-lg text-gray-600">
            Inställningar
          </p>
        </div>
      </div>

      {/* Toast Message */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
          message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <nav className="space-y-2">
                <button
                  onClick={() => setActiveSection("material")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeSection === "material"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Package className="w-5 h-5" />
                  <span className="font-medium">Material & Synonymer</span>
                </button>

                <button
                  onClick={() => setActiveSection("ai")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeSection === "ai"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Zap className="w-5 h-5" />
                  <span className="font-medium">AI & Automation</span>
                </button>

                <button
                  onClick={() => setActiveSection("export")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeSection === "export"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  <span className="font-medium">Export & Rapporter</span>
                </button>

                <button
                  onClick={() => setActiveSection("azure")}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                    activeSection === "azure"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Cloud className="w-5 h-5" />
                  <span className="font-medium">Azure & GUIDs</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            {/* Material & Synonymer Section */}
            {activeSection === "material" && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Materialbibliotek
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                  Lär AI:n dina benämningar. Om fakturan säger "Virke", mappar vi det till "Trä".
                </p>

                {/* Categories */}
                <div className="space-y-6">
                  {Object.entries(synonyms).map(([category, items]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-semibold text-gray-900">{category}</h3>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          STANDARD
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-3">
                        {items.map((synonym) => (
                          <span
                            key={synonym}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg"
                          >
                            {synonym}
                            <button
                              onClick={() => removeSynonym(category, synonym)}
                              className="hover:text-red-600 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        
                        {/* Add Synonym Input */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Ny synonym..."
                            value={newSynonym[category] || ""}
                            onChange={(e) => setNewSynonym({ ...newSynonym, [category]: e.target.value })}
                            onKeyPress={(e) => {
                              if (e.key === "Enter") {
                                addSynonym(category);
                              }
                            }}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => addSynonym(category)}
                            className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-sm rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            + Synonym
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add New Category */}
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nytt huvudmaterial..."
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            addCategory();
                          }
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={addCategory}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Lägg till nytt huvudmaterial
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI & Automation Section */}
            {activeSection === "ai" && (
              <div className="space-y-6">
                {/* Säkerhetströskel */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-1" />
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Säkerhetströskel
                      </h2>
                      <p className="text-sm text-gray-600">
                        Bestäm när AI:n ska be om mänsklig granskning. Lägre värde betyder mer automation, men högre risk för fel.
                      </p>
                    </div>
                  </div>

                  {/* Threshold Slider */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Tillåtande (60%)</span>
                      <span className="text-2xl font-bold text-gray-900">{threshold}%</span>
                      <span className="text-sm text-gray-600">Strikt (99%)</span>
                    </div>
                    
                    <input
                      type="range"
                      min="60"
                      max="99"
                      value={threshold}
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600">
                        Just nu: Allt med under {threshold}% säkerhet kommer markeras med gul varning.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={saveThreshold}
                    disabled={saving}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? "Sparar..." : "Spara tröskel"}
                  </button>
                </div>

                {/* Auto-Godkännande */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                      Auto-Godkännande
                    </h2>
                    <p className="text-sm text-gray-600">
                      Dokumentprocessen godkänner automatiskt dokument med kvalitetsbetyg över 95%. Dokument under tröskeln skickas till mänsklig granskning.
                    </p>
                  </div>
                  
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-700">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-sm font-medium">
                        Automatisk godkännande aktivt
                      </p>
                    </div>
                    <p className="text-xs text-green-600 mt-2">
                      Dokument med 95%+ kvalitet godkänns automatiskt och exporteras till Azure
                    </p>
                  </div>
                </div>

                {/* Hallucinationskontroll (Verification) */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <svg className="w-5 h-5 text-purple-600 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-gray-900 mb-2">
                        Hallucinationskontroll
                      </h2>
                      <p className="text-sm text-gray-600">
                        AI:n verifierar extraherade data mot originaldokumentet för att upptäcka felaktiga värden (hallucinationer).
                      </p>
                    </div>
                  </div>

                  {/* Enable Toggle */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <p className="font-medium text-gray-900">Aktivera verifiering</p>
                        <p className="text-sm text-gray-600">
                          Extra LLM-anrop för att dubbelkontrollera extraherade värden
                        </p>
                      </div>
                      <button
                        onClick={() => setEnableVerification(!enableVerification)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          enableVerification ? 'bg-purple-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            enableVerification ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Verification Threshold (only shown if enabled) */}
                  {enableVerification && (
                    <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">Verifiera när konfidensen är under:</span>
                          <span className="text-xl font-bold text-purple-700">{verificationThreshold}%</span>
                        </div>
                        
                        <input
                          type="range"
                          min="50"
                          max="100"
                          value={verificationThreshold}
                          onChange={(e) => setVerificationThreshold(parseInt(e.target.value))}
                          className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                        />
                        
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-gray-500">Mer verifiering (50%)</span>
                          <span className="text-xs text-gray-500">Mindre verifiering (100%)</span>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-white rounded-lg border border-purple-100">
                        <p className="text-xs text-gray-600">
                          <strong>Hur det fungerar:</strong> Efter extraktion skickas resultatet tillbaka till AI:n 
                          tillsammans med originaldokumentet. AI:n verifierar att varje värde (datum, adress, vikt, material) 
                          faktiskt finns i dokumentet och inte är påhittat.
                        </p>
                      </div>
                      
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-xs text-yellow-800">
                          <strong>⚠️ Kostnad:</strong> Verifiering använder extra API-anrop (~$0.001/chunk). 
                          Rekommenderas för kritiska dokument eller när konfidensen är låg.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Status indicator */}
                  <div className={`p-4 rounded-lg ${
                    enableVerification 
                      ? 'bg-purple-50 border border-purple-200' 
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {enableVerification ? (
                        <>
                          <svg className="w-5 h-5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <p className="text-sm font-medium text-purple-700">
                            Hallucinationskontroll aktiv
                          </p>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                          </svg>
                          <p className="text-sm font-medium text-gray-600">
                            Hallucinationskontroll avstängd
                          </p>
                        </>
                      )}
                    </div>
                    {enableVerification && (
                      <p className="text-xs text-purple-600 mt-2">
                        Extraktioner med under {verificationThreshold}% konfidens verifieras automatiskt mot källdokumentet
                      </p>
                    )}
                  </div>

                  <button
                    onClick={saveVerificationSettings}
                    disabled={saving}
                    className="w-full mt-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? "Sparar..." : "Spara verifieringsinställningar"}
                  </button>
                </div>
              </div>
            )}

            {/* Export & Rapporter Section */}
            {activeSection === "export" && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Export & Rapporter
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                  Hantera exportformat och rapportinställningar.
                </p>
                
                <div className="space-y-6">
                  {/* Export Format */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Exportformat</h3>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">Excel (XLSX)</p>
                          <p className="text-sm text-gray-600">Standard exportformat för Simplitics</p>
                        </div>
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                          AKTIVT
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Export Location */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Exportdestination</h3>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">Azure Blob Storage</p>
                          <p className="text-sm text-gray-600 font-mono">Container: completed</p>
                        </div>
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                          ANSLUTEN
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Auto-export */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Automatisk export</h3>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-sm font-medium">
                          Godkända dokument exporteras automatiskt
                        </p>
                      </div>
                      <p className="text-xs text-green-600 mt-2">
                        Efter godkännande raderas originalfilen från "unsupported-file-format"
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Azure & GUIDs Section */}
            {activeSection === "azure" && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  Azure & GUIDs
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                  Hantera Azure-integration och GUID-inställningar.
                </p>
                
                <div className="space-y-6">
                  {/* Azure Connection Status */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Azure Blob Storage</h3>
                    <div className="space-y-3">
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-gray-900">Input Container</p>
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            ANSLUTEN
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 font-mono">unsupported-file-format</p>
                      </div>
                      
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium text-gray-900">Output Container</p>
                          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            ANSLUTEN
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 font-mono">completed</p>
                      </div>
                    </div>
                  </div>

                  {/* Auto-sync */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Automatisk synkronisering</h3>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-sm font-medium">
                          Synkar nya filer var 5:e minut
                        </p>
                      </div>
                      <p className="text-xs text-green-600 mt-2">
                        Systemet kollar automatiskt efter nya dokument i "unsupported-file-format"
                      </p>
                    </div>
                  </div>

                  {/* Filename Format */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Filnamnhantering</h3>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm text-gray-600 mb-2">
                        Systemet hanterar automatiskt UUID-baserade filnamn från Azure och extraherar datum från filnamn.
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        Format: [uuid]_[timestamp]_[datum].pdf
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
