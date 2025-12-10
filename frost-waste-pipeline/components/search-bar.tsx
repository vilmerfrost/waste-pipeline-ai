"use client";

import { Search } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce"; // Vi behöver installera denna

export function SearchBar() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  // Vänta 300ms efter att användaren slutat skriva innan vi söker (för prestanda)
  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }
    
    // Uppdatera URL:en utan att ladda om sidan
    replace(`${pathname}?${params.toString()}`);
  }, 300);

  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
      <input
        onChange={(e) => handleSearch(e.target.value)}
        defaultValue={searchParams.get("q")?.toString()}
        placeholder="Sök på filnamn, material..."
        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
      />
    </div>
  );
}