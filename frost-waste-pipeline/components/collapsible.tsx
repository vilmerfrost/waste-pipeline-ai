"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({ title, defaultOpen = false, children, className = "" }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className={`border border-gray-200 rounded-lg bg-white ${className}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
      >
        <span>{title}</span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}
