import { createServiceRoleClient } from "@/lib/supabase";
import { ArrowLeft, Plus, Trash2, Tag } from "lucide-react";
import Link from "next/link";
import { addMaterial, deleteMaterial } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createServiceRoleClient();

  // Hämta material sorterat i bokstavsordning
  const { data: materials } = await supabase
    .from("materials")
    .select("*")
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        
        {/* HEADER */}
        <header className="mb-10 flex items-center gap-4">
          <Link href="/" className="p-2 bg-white rounded-full hover:bg-slate-200 transition border border-slate-200">
             <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="font-serif text-3xl text-slate-900">Inställningar</h1>
            <p className="text-slate-500">Hantera giltiga materialtyper</p>
          </div>
        </header>

        {/* LÄGG TILL MATERIAL */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-lg font-medium text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-500" />
            Lägg till nytt material
          </h2>
          
          <form action={addMaterial} className="flex gap-3">
            <input 
              name="name"
              type="text" 
              placeholder="T.ex. 'Asbest' eller 'Plast'" 
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              required
            />
            <button 
              type="submit"
              className="px-6 py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
            >
              Spara
            </button>
          </form>
        </div>

        {/* LISTA MED MATERIAL */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
             <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Giltiga Material</span>
             <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{materials?.length || 0} st</span>
          </div>
          
          <div className="divide-y divide-slate-100">
            {materials?.map((mat) => (
              <div key={mat.id} className="p-4 flex items-center justify-between group hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                    <Tag className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-slate-700">{mat.name}</span>
                </div>

                <form action={deleteMaterial}>
                  <input type="hidden" name="id" value={mat.id} />
                  <button 
                    type="submit"
                    className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Ta bort"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ))}
            
            {(!materials || materials.length === 0) && (
              <div className="p-8 text-center text-slate-400 italic">
                Inga material inlagda än.
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}