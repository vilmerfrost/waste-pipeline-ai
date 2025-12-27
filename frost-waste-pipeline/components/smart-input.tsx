import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { SmartFieldValue } from "@/lib/schemas";

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  fieldData: SmartFieldValue<string | number | null>;
  description?: string;
}

export function SmartInput({ label, fieldData, description, className, onChange, ...props }: SmartInputProps) {
  const value = fieldData?.value ?? "";
  const confidence = fieldData?.confidence ?? 0;
  
  // Use controlled mode if onChange is provided, otherwise uncontrolled
  const inputProps = onChange 
    ? { value, onChange, ...props }
    : { defaultValue: value, ...props };

  // Bestäm färg och stil baserat på confidence
  let statusColor = "bg-white border-slate-200 focus:ring-blue-100 focus:border-blue-400";
  let confidenceBadge;

  if (confidence >= 0.9) {
    confidenceBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full ring-1 ring-green-600/20">
        <CheckCircle2 className="w-3 h-3" /> Säker ({Math.round(confidence * 100)}%)
      </span>
    );
  } else if (confidence >= 0.6) {
    statusColor = "bg-amber-50/50 border-amber-300 focus:ring-amber-200 focus:border-amber-500"; // GUL VARNING
    confidenceBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full ring-1 ring-amber-600/20 animate-pulse">
        <HelpCircle className="w-3 h-3" /> Kolla noga ({Math.round(confidence * 100)}%)
      </span>
    );
  } else {
    statusColor = "bg-red-50/50 border-red-300 focus:ring-red-200 focus:border-red-500"; // RÖD VARNING
    confidenceBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-600/20">
        <AlertTriangle className="w-3 h-3" /> Osäker ({Math.round(confidence * 100)}%)
      </span>
    );
  }

  if (fieldData?.value === undefined || fieldData?.value === null || fieldData?.value === "") {
      confidenceBadge = null;
      statusColor = "bg-white border-slate-200";
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="block text-sm font-medium text-slate-800">{label}</label>
        {confidenceBadge}
      </div>
      <input
        className={`w-full p-3 rounded-xl outline-none transition-all shadow-sm ${statusColor} ${className}`}
        {...inputProps}
      />
      {description && <p className="text-xs text-slate-400 mt-1.5 font-light">{description}</p>}
    </div>
  );
}