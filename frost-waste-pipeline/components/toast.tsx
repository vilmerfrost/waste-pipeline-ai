"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  description?: string;
  type: ToastType;
}

interface ToastContextType {
  toasts: Toast[];
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType, description?: string) => {
    const id = Math.random().toString(36).substring(7);
    const toast: Toast = { id, message, description, type };
    
    setToasts(prev => [...prev, toast]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const success = useCallback((message: string, description?: string) => {
    showToast(message, "success", description);
  }, [showToast]);

  const error = useCallback((message: string, description?: string) => {
    showToast(message, "error", description);
  }, [showToast]);

  const info = useCallback((message: string, description?: string) => {
    showToast(message, "info", description);
  }, [showToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, success, error, info }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ 
  toasts, 
  onRemove 
}: { 
  toasts: Toast[]; 
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[300px] max-w-md animate-in slide-in-from-bottom pointer-events-auto ${
            toast.type === "success" ? "bg-green-600 text-white" :
            toast.type === "error" ? "bg-red-600 text-white" :
            "bg-blue-600 text-white"
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">
            {toast.type === "success" && <CheckCircle className="w-5 h-5" />}
            {toast.type === "error" && <XCircle className="w-5 h-5" />}
            {toast.type === "info" && <Info className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{toast.message}</p>
            {toast.description && (
              <p className="text-xs opacity-90 mt-1">{toast.description}</p>
            )}
          </div>
          <button
            onClick={() => onRemove(toast.id)}
            className="flex-shrink-0 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
