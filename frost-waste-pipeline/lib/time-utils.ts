/**
 * Time utility functions for consistent date/time formatting
 */

/**
 * Format date as YYYY-MM-DD (avoids hydration mismatch)
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date and time as YYYY-MM-DD HH:MM
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Format relative time (e.g., "2 timmar sedan", "igår")
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just nu";
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minut' : 'minuter'} sedan`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'timme' : 'timmar'} sedan`;
  } else if (diffDays === 1) {
    return "igår";
  } else if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? 'dag' : 'dagar'} sedan`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'vecka' : 'veckor'} sedan`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'månad' : 'månader'} sedan`;
  } else {
    return formatDate(dateString);
  }
}

/**
 * Format time only (HH:MM)
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format date in Swedish locale (e.g., "15 januari 2025")
 */
export function formatDateSwedish(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december"
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

