import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { SmartFieldValue } from "@/lib/schemas";

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  fieldData: SmartFieldValue<string | number | null>; // Tar emot { value, confidence }
  description?: string;
}

export function SmartInput({ label, fieldData, description, className, ...props }: SmartInputProps) {
  // Hämta värde och confidence, hantera om det är undefined (gamla dokument)
  const value = fieldData?.value ?? "";
  const confidence = fieldData?.confidence ?? 0;

  // Bestäm färg och ikon baserat på confidence
  let confidenceBadge;
  if (confidence >= 0.9) {
    confidenceBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full ring-1 ring-green-600/20">
        <CheckCircle2 className="w-3 h-3" /> AI-säkerhet: Hög ({Math.round(confidence * 100)}%)
      </span>
    );
  } else if (confidence >= 0.7) {
    confidenceBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full ring-1 ring-amber-600/20">
        <HelpCircle className="w-3 h-3" /> AI-säkerhet: Osäker ({Math.round(confidence * 100)}%)
      </span>
    );
  } else {
    confidenceBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-600/20">
        <AlertTriangle className="w-3 h-3" /> Kolla noga ({Math.round(confidence * 100)}%)
      </span>
    );
  }

  // Om vi inte har någon data alls (t.ex. nytt fält), visa inget badge
  if (fieldData?.value === undefined || fieldData?.value === null || fieldData?.value === "") {
      confidenceBadge = null;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <label className="block text-sm font-medium text-slate-800">{label}</label>
        {confidenceBadge}
      </div>
      <input
        defaultValue={value}
        className={`
          w-full p-3 bg-white border rounded-xl outline-none transition-all shadow-sm
          ${confidence < 0.7 && value ? "border-red-300 focus:ring-red-200" : "border-slate-200 focus:ring-blue-100 focus:border-blue-400"}
          ${className}
        `}
        {...props}
      />
      {description && <p className="text-xs text-slate-400 mt-1.5 font-light">{description}</p>}
    </div>
  );
}

