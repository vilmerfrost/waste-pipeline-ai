export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/Å/g, 'A')
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/é/g, 'e')
    .replace(/É/g, 'E')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9\-_.]/g, '')
    .replace(/_+/g, '_');
}

