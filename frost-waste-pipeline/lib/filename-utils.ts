/**
 * Utility functions for filename handling
 */

/**
 * Truncate filename from the middle, preserving the start (identifiable part) 
 * and the end (date + extension)
 * 
 * Example: "813d83d5-8843-487b-af59-439d09486f15_1764596766239_2025-10-13.pdf"
 * Becomes: "813d83d5...2025-10-13.pdf"
 */
export function truncateFilename(filename: string, maxLength: number = 35): string {
  if (filename.length <= maxLength) {
    return filename;
  }

  // Try to find the date pattern (YYYY-MM-DD) near the end
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  const lastDot = filename.lastIndexOf('.');
  const extension = lastDot !== -1 ? filename.substring(lastDot) : '';
  
  if (dateMatch) {
    // Keep the date and extension
    const dateAndExt = `${dateMatch[1]}${extension}`;
    const availableForStart = maxLength - dateAndExt.length - 3; // 3 for "..."
    
    if (availableForStart > 8) {
      const start = filename.substring(0, availableForStart);
      return `${start}...${dateAndExt}`;
    }
  }

  // Fallback: Keep start and extension
  if (extension) {
    const maxNameLength = maxLength - extension.length - 3;
    if (maxNameLength > 8) {
      const nameWithoutExt = filename.substring(0, lastDot);
      return `${nameWithoutExt.substring(0, maxNameLength)}...${extension}`;
    }
  }

  // Last resort: simple middle truncation
  const partLength = Math.floor((maxLength - 3) / 2);
  const start = filename.substring(0, partLength);
  const end = filename.substring(filename.length - partLength);
  
  return `${start}...${end}`;
}

/**
 * Extract a readable identifier from a UUID-based filename
 * Takes the first segment of the UUID for display
 */
export function getShortId(filename: string): string {
  // Match UUID pattern at start
  const uuidMatch = filename.match(/^([a-f0-9]{8})-/i);
  if (uuidMatch) {
    return uuidMatch[1];
  }
  
  // Fallback: first 8 characters
  return filename.substring(0, 8);
}

/**
 * Extract date from filename if present
 */
export function extractDateFromFilename(filename: string): string | null {
  // Clean up duplicate markers like (1), (2)
  const cleanFilename = filename.replace(/\s*\(\d+\)/g, '');
  
  // Match YYYY-MM-DD pattern
  const match = cleanFilename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Check if file is a PDF
 */
export function isPdf(filename: string): boolean {
  return getFileExtension(filename) === 'pdf';
}

/**
 * Check if file is an Excel file
 */
export function isExcel(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ['xlsx', 'xls', 'xlsm'].includes(ext);
}

/**
 * Format filename for display with optional tooltip
 * Returns object with display name and full name for tooltip
 */
export function formatFilenameForDisplay(
  filename: string, 
  maxLength: number = 35
): { display: string; full: string; needsTooltip: boolean } {
  const display = truncateFilename(filename, maxLength);
  return {
    display,
    full: filename,
    needsTooltip: display !== filename
  };
}
