"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function DashboardCharts({ documents }: { documents: any[] }) {
  
  // 1. DATA FÖR MATERIAL-FÖRDELNING (Bar Chart)
  const materialStats: Record<string, number> = {};
  
  documents.forEach(doc => {
    const lines = doc.extracted_data?.lineItems || [];
    if (lines.length > 0) {
        lines.forEach((item: any) => {
            const mat = item.material?.value || "Okänt";
            // Förenkla namn (ta bort detaljer) för snyggare graf
            const simpleMat = mat.split(",")[0].split("-")[0].trim(); 
            materialStats[simpleMat] = (materialStats[simpleMat] || 0) + (Number(item.weightKg?.value) || 0);
        });
    } else {
        const mat = doc.extracted_data?.material?.value || "Blandat";
        materialStats[mat] = (materialStats[mat] || 0) + (Number(doc.extracted_data?.weightKg?.value) || 0);
    }
  });

  const barData = Object.entries(materialStats)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6); // Topp 6 material

  // 2. DATA FÖR FARLIGT AVFALL (Pie Chart)
  let hazardousWeight = 0;
  let nonHazardousWeight = 0;

  documents.forEach(doc => {
     const lines = doc.extracted_data?.lineItems || [];
     if (lines.length > 0) {
        lines.forEach((item: any) => {
            const weight = Number(item.weightKg?.value) || 0;
            if (item.isHazardous?.value) hazardousWeight += weight;
            else nonHazardousWeight += weight;
        });
     } else {
        const weight = Number(doc.extracted_data?.weightKg?.value) || 0;
        nonHazardousWeight += weight; // Antar icke-farligt om ej specat
     }
  });

  const pieData = [
    { name: 'Icke Farligt', value: Math.round(nonHazardousWeight), color: '#3b82f6' }, // Blå
    { name: 'Farligt', value: Math.round(hazardousWeight), color: '#ef4444' }, // Röd
  ];

  if (documents.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
      
      {/* BAR CHART */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Topp Material (kg)</h3>
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
            <BarChart data={barData}>
              <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} interval={0} />
              <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PIE CHART */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Farligt vs Icke-Farligt</h3>
        <div className="h-64 w-full min-w-0 relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256}>
            <PieChart>
                <Pie
                    data={pieData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                >
                    {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none'}} />
            </PieChart>
            </ResponsiveContainer>
            {/* Legend i mitten */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                    <p className="text-2xl font-bold text-slate-800">{Math.round((hazardousWeight / (hazardousWeight + nonHazardousWeight || 1)) * 100)}%</p>
                    <p className="text-xs text-slate-400">Farligt</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}