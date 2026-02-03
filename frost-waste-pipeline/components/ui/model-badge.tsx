import { cn } from "@/lib/utils";

interface ModelBadgeProps {
  modelPath: string;
  className?: string;
}

const MODEL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "mistral-ocr-3": {
    bg: "bg-orange-100",
    text: "text-orange-700",
    label: "Mistral OCR",
  },
  "gemini-3-flash-agentic": {
    bg: "bg-blue-100",
    text: "text-blue-700",
    label: "Gemini Flash",
  },
  "sonnet-reconciliation": {
    bg: "bg-purple-100",
    text: "text-purple-700",
    label: "Sonnet",
  },
  "haiku-verification": {
    bg: "bg-green-100",
    text: "text-green-700",
    label: "Verified",
  },
  "legacy": {
    bg: "bg-gray-100",
    text: "text-gray-700",
    label: "Legacy",
  },
};

export function ModelBadge({ modelPath, className }: ModelBadgeProps) {
  // Parse model path like "mistral-ocr-3 → haiku-verification"
  const models = modelPath?.split("→").map((m) => m.trim()) || [];
  
  // Get primary model (first in chain)
  const primaryModel = models[0] || "legacy";
  const wasVerified = modelPath?.includes("haiku-verification");
  const wasReconciled = modelPath?.includes("sonnet-reconciliation");

  const primary = MODEL_COLORS[primaryModel] || MODEL_COLORS["legacy"];

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {/* Primary model badge */}
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
          primary.bg,
          primary.text
        )}
      >
        {primary.label}
      </span>

      {/* Reconciliation indicator */}
      {wasReconciled && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          + Sonnet
        </span>
      )}

      {/* Verification indicator */}
      {wasVerified && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
          ✓
        </span>
      )}
    </div>
  );
}
