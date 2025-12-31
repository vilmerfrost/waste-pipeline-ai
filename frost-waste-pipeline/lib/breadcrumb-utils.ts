export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Server-side breadcrumb helpers
 * These can be called from server components
 */

export function getDashboardBreadcrumbs(): BreadcrumbItem[] {
  return [
    { label: "Collecct Review", href: "/collecct" },
  ];
}

export function getReviewBreadcrumbs(documentId: string, filename?: string): BreadcrumbItem[] {
  return [
    { label: "Collecct Review", href: "/collecct" },
    { label: filename || `Dokument ${documentId.slice(0, 8)}` },
  ];
}

