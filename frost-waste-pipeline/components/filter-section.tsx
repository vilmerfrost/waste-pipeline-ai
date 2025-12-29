"use client";

import { useState } from "react";
import { Filter, X, Calendar, SortAsc, SortDesc, Trash2, RefreshCw } from "lucide-react";
import { useConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

interface FilterSectionProps {
  onFilterChange?: (filters: FilterState) => void;
  archivedCount?: number;
  showDeleteArchived?: boolean;
}

interface FilterState {
  status: string;
  dateRange: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

const defaultFilters: FilterState = {
  status: "all",
  dateRange: "all",
  sortBy: "created_at",
  sortOrder: "desc",
};

export function FilterSection({ 
  onFilterChange,
  archivedCount = 0,
  showDeleteArchived = false,
}: FilterSectionProps) {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const toast = useToast();

  const updateFilter = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    onFilterChange?.(defaultFilters);
  };

  const hasActiveFilters = 
    filters.status !== "all" || 
    filters.dateRange !== "all" || 
    filters.sortBy !== "created_at" ||
    filters.sortOrder !== "desc";

  const handleDeleteArchived = async () => {
    const confirmed = await confirm({
      title: "Radera arkiverade dokument",
      message: `Är du säker på att du vill radera ${archivedCount} arkiverade dokument? Detta kan inte ångras.`,
      confirmText: "Radera alla",
      cancelText: "Avbryt",
      variant: "danger",
    });

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/documents/delete-archived", {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete archived documents");
      }
      
      const result = await response.json();
      
      toast.success("Arkiverade dokument raderade", `${result.deletedCount || archivedCount} dokument har tagits bort`);
      
      // Reload page to show updated status
      window.location.reload();
    } catch (error: any) {
      toast.error("Kunde inte radera", error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDialog />
      
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        {/* Filter Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span>Filter & Sortering</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                Aktiv
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-3 h-3" />
                Återställ
              </button>
            )}
            
            {showDeleteArchived && archivedCount > 0 && (
              <button
                onClick={handleDeleteArchived}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                Radera arkiv ({archivedCount})
              </button>
            )}
          </div>
        </div>

        {/* Filter Options - Collapsible */}
        {isExpanded && (
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => updateFilter("status", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">Alla</option>
                <option value="uploaded">Uppladdade</option>
                <option value="processing">Behandlas</option>
                <option value="needs_review">Behöver granskning</option>
                <option value="approved">Godkända</option>
                <option value="exported">Exporterade</option>
                <option value="error">Fel</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                <Calendar className="w-3 h-3 inline mr-1" />
                Tidsperiod
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => updateFilter("dateRange", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">Alla</option>
                <option value="today">Idag</option>
                <option value="yesterday">Igår</option>
                <option value="week">Senaste 7 dagarna</option>
                <option value="month">Senaste 30 dagarna</option>
                <option value="quarter">Senaste 90 dagarna</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Sortera efter
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => updateFilter("sortBy", e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="created_at">Uppladdningsdatum</option>
                <option value="filename">Filnamn</option>
                <option value="status">Status</option>
                <option value="weight">Vikt</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Ordning
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => updateFilter("sortOrder", "desc")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
                    filters.sortOrder === "desc"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <SortDesc className="w-4 h-4" />
                  Nyast först
                </button>
                <button
                  onClick={() => updateFilter("sortOrder", "asc")}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
                    filters.sortOrder === "asc"
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <SortAsc className="w-4 h-4" />
                  Äldst först
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

