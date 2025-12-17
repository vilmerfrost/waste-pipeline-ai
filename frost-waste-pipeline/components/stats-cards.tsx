import { ArrowUpRight, Banknote, FileText, Scale, CheckCircle2 } from "lucide-react";

export function StatsCards({ documents }: { documents: any[] }) {
  const verifiedDocs = documents.filter((d) => d.status === "verified").length;
  
  const totalWeightKg = documents.reduce((sum, doc) => {
    const val = doc.extracted_data?.weightKg;
    const weight = (typeof val === "object" && val !== null) ? Number(val.value) : Number(val);
    return sum + (isNaN(weight) ? 0 : weight);
  }, 0);

  const totalCostSEK = documents.reduce((sum, doc) => {
    const val = doc.extracted_data?.cost;
    const cost = (typeof val === "object" && val !== null) ? Number(val.value) : Number(val);
    return sum + (isNaN(cost) ? 0 : cost);
  }, 0);

  const formatWeight = (kg: number) => {
    if (kg >= 1_000_000) {
      // För mycket stora tal: visa i miljoner ton med tusentalsavgränsare
      const millions = kg / 1_000_000;
      return `${millions.toFixed(1).replace(".", ",")} milj ton`;
    } else if (kg >= 1000) {
      // För ton: visa med tusentalsavgränsare
      const tons = kg / 1000;
      // Använd svensk formatering med mellanslag som tusentalsavgränsare
      const formatted = tons.toFixed(1).replace(".", ",");
      // Lägg till mellanslag som tusentalsavgränsare
      const parts = formatted.split(",");
      const wholePart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return `${wholePart}${parts[1] ? `,${parts[1]}` : ""} ton`;
    }
    // För kg: visa med tusentalsavgränsare
    return `${Math.round(kg).toLocaleString("sv-SE")} kg`;
  };

  const formatMoney = (sek: number) => {
    return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(sek);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 border-y border-slate-100 py-8 mb-8">
      
      {/* KORT 1: KOSTNAD */}
      <div className="text-center md:text-left group cursor-default">
        <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
           <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Kostnad</p>
           <Banknote className="w-3 h-3 text-slate-300 group-hover:text-green-500 transition-colors" />
        </div>
        <p className="text-3xl font-serif text-slate-900 tracking-tight">{formatMoney(totalCostSEK)}</p>
        
        {/* Visa bara trend om vi har faktiska pengar, annars ser det trasigt ut */}
        {totalCostSEK > 0 && (
            <div className="text-[10px] text-green-600 font-medium mt-1 flex items-center justify-center md:justify-start gap-1">
            <ArrowUpRight className="w-3 h-3" /> Analyserat värde
            </div>
        )}
      </div>

      {/* KORT 2: VIKT */}
      <div className="text-center md:text-left group cursor-default">
        <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
           <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Vikt</p>
           <Scale className="w-3 h-3 text-slate-300 group-hover:text-blue-500 transition-colors" />
        </div>
        <p className="text-3xl font-serif text-slate-900 tracking-tight">{formatWeight(totalWeightKg)}</p>
      </div>
      
      {/* KORT 3: ANTAL FILER */}
      <div className="text-center md:text-left group cursor-default">
         <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
           <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Dokument</p>
           <FileText className="w-3 h-3 text-slate-300 group-hover:text-purple-500 transition-colors" />
        </div>
        <p className="text-3xl font-serif text-slate-900 tracking-tight">{documents.length}</p>
      </div>

      {/* KORT 4: GODKÄNDA */}
      <div className="text-center md:text-left group cursor-default">
         <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
           <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Verifierade</p>
           <CheckCircle2 className="w-3 h-3 text-slate-300 group-hover:text-emerald-500 transition-colors" />
        </div>
        <p className="text-3xl font-serif text-slate-900 tracking-tight">{verifiedDocs}</p>
      </div>
    </div>
  );
}