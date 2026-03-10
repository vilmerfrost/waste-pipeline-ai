/**
 * File type routing for processDocument.
 * Matches logic in app/actions.ts processDocument() and reVerifyDocument().
 */

export type FileTypeRoute = "excel" | "image" | "pdf";

export function getFileTypeRoute(filename: string): FileTypeRoute {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    return "excel";
  }
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image";
  }
  return "pdf";
}
