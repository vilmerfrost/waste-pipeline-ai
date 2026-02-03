"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingLogProps {
  logs: string[];
  className?: string;
  defaultExpanded?: boolean;
}

const LOG_PATTERNS: Record<string, { color: string; icon: string }> = {
  "🚀": { color: "text-blue-600", icon: "🚀" },
  "📄": { color: "text-gray-600", icon: "📄" },
  "📦": { color: "text-gray-600", icon: "📦" },
  "📊": { color: "text-indigo-600", icon: "📊" },
  "✅": { color: "text-green-600", icon: "✅" },
  "❌": { color: "text-red-600", icon: "❌" },
  "⚠️": { color: "text-yellow-600", icon: "⚠️" },
  "🔷": { color: "text-orange-600", icon: "🔷" },
  "🟢": { color: "text-emerald-600", icon: "🟢" },
  "🧠": { color: "text-purple-600", icon: "🧠" },
  "🔍": { color: "text-cyan-600", icon: "🔍" },
  "📤": { color: "text-blue-500", icon: "📤" },
  "📥": { color: "text-blue-500", icon: "📥" },
  "🌍": { color: "text-green-500", icon: "🌍" },
  "🏁": { color: "text-gray-800 font-semibold", icon: "🏁" },
  "🔧": { color: "text-amber-600", icon: "🔧" },
  "🚨": { color: "text-red-600 font-semibold", icon: "🚨" },
};

function getLogStyle(log: string): string {
  for (const [emoji, style] of Object.entries(LOG_PATTERNS)) {
    if (log.includes(emoji)) {
      return style.color;
    }
  }
  return "text-gray-500";
}

function isStepHeader(log: string): boolean {
  return log.includes("Step 1:") || 
         log.includes("Step 2:") || 
         log.includes("Step 3:") || 
         log.includes("Step 4:") ||
         log.includes("PROCESSING COMPLETE") ||
         log.includes("MISTRAL OCR") ||
         log.includes("GEMINI") ||
         log.includes("SONNET RECONCILIATION") ||
         log.includes("HAIKU VERIFICATION");
}

export function ProcessingLog({ logs, className, defaultExpanded = false }: ProcessingLogProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!logs || logs.length === 0) {
    return null;
  }

  // Get summary info from logs
  const modelPath = logs.find((l) => l.includes("Model path:"))?.split("Model path:")[1]?.trim() || "Unknown";
  const confidence = logs.find((l) => l.includes("Confidence:") && l.includes("%"))?.match(/(\d+)%/)?.[1] || "?";
  const itemCount = logs.find((l) => l.includes("Items:"))?.match(/Items:\s*(\d+)/)?.[1] || "?";
  const status = logs.find((l) => l.includes("Status:"))?.split("Status:")[1]?.trim() || "Unknown";

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Processing Log
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 text-xs mt-2">
          <span className="bg-gray-100 px-2 py-1 rounded">
            📊 {confidence}% confidence
          </span>
          <span className="bg-gray-100 px-2 py-1 rounded">
            📝 {itemCount} items
          </span>
          <span
            className={cn(
              "px-2 py-1 rounded",
              status === "approved"
                ? "bg-green-100 text-green-700"
                : status === "needs_review"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-700"
            )}
          >
            {status === "approved" ? "✅" : status === "needs_review" ? "⚠️" : "❌"} {status}
          </span>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
            {logs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  "py-0.5",
                  getLogStyle(log),
                  isStepHeader(log) && "mt-2 mb-1"
                )}
              >
                <span className="text-gray-500 select-none mr-2">
                  {String(index + 1).padStart(3, " ")}
                </span>
                <span className={isStepHeader(log) ? "font-semibold" : ""}>
                  {log.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, "")}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
