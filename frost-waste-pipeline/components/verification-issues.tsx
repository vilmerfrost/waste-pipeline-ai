import { AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerificationIssue {
  rowIndex: number;
  field: string;
  issue: string;
  severity: "warning" | "error";
  suggestion?: string;
}

interface VerificationIssuesProps {
  issues: VerificationIssue[];
  className?: string;
}

export function VerificationIssues({ issues, className }: VerificationIssuesProps) {
  if (!issues || issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className={cn("space-y-2", className)}>
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-red-800 flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4" />
            {errors.length} fel upptäckta
          </h4>
          <ul className="space-y-1">
            {errors.map((issue, idx) => (
              <li key={idx} className="text-sm text-red-700">
                <strong>Rad {issue.rowIndex + 1}:</strong> {issue.issue}
                {issue.suggestion && (
                  <span className="block text-red-600 text-xs mt-0.5">
                    💡 {issue.suggestion}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-yellow-800 flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4" />
            {warnings.length} varningar
          </h4>
          <ul className="space-y-1">
            {warnings.map((issue, idx) => (
              <li key={idx} className="text-sm text-yellow-700">
                <strong>Rad {issue.rowIndex + 1}:</strong> {issue.issue}
                {issue.suggestion && (
                  <span className="block text-yellow-600 text-xs mt-0.5">
                    💡 {issue.suggestion}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
