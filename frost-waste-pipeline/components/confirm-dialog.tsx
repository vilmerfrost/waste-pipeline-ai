"use client";

import { useState, ReactNode } from "react";
import { AlertTriangle, X, Info } from "lucide-react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "warning" | "danger" | "info";
}

// Standalone hook for components that can't use provider
export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolve, setResolve] = useState<((value: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((res) => {
      setOptions(opts);
      setIsOpen(true);
      setResolve(() => res);
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    resolve?.(true);
    setResolve(null);
    setOptions(null);
  };

  const handleCancel = () => {
    setIsOpen(false);
    resolve?.(false);
    setResolve(null);
    setOptions(null);
  };

  const variantStyles = {
    default: "bg-blue-50 border-blue-200 text-blue-900",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-900",
    danger: "bg-red-50 border-red-200 text-red-900",
    info: "bg-blue-50 border-blue-200 text-blue-900",
  };

  const variantIcons = {
    default: Info,
    warning: AlertTriangle,
    danger: AlertTriangle,
    info: Info,
  };

  const variantButtonStyles = {
    default: "bg-blue-600 hover:bg-blue-700",
    warning: "bg-yellow-600 hover:bg-yellow-700",
    danger: "bg-red-600 hover:bg-red-700",
    info: "bg-blue-600 hover:bg-blue-700",
  };

  const ConfirmDialog = () => {
    if (!isOpen || !options) return null;

    const Icon = variantIcons[options.variant || "default"];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleCancel}
        />
        <div className={`relative bg-white rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200 ${variantStyles[options.variant || "default"]}`}>
          <div className="p-6">
            <div className="flex items-start gap-4">
              <Icon className="w-6 h-6 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold mb-2">{options.title}</h3>
                <p className="text-sm opacity-90">{options.message}</p>
              </div>
              <button
                onClick={handleCancel}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="px-6 py-4 bg-white/50 border-t border-current/20 flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {options.cancelText || "Avbryt"}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${variantButtonStyles[options.variant || "default"]}`}
            >
              {options.confirmText || "Bekräfta"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return { confirm, ConfirmDialog };
}
