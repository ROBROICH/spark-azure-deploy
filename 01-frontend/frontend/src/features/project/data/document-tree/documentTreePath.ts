/**
 * Path helper utilities for S3-style path handling.
 *
 * Convention:
 * - Folders: path ends with `/` (e.g., "Vorhaben/Erläuterungsbericht/")
 * - Documents: path does NOT end with `/` (e.g., "Vorhaben/Erläuterungsbericht/doc.pdf")
 */

/**
 * Checks if a path represents a folder (ends with `/`)
 */
export const isFolderPath = (path: string): boolean => path.endsWith('/');

/**
 * Extracts the filename from a path (last segment).
 * For folders, returns the folder name without trailing slash.
 *
 * @example
 * getFilename("Vorhaben/doc.pdf") // "doc.pdf"
 * getFilename("Vorhaben/Subfolder/") // "Subfolder"
 */
export const getFilename = (path: string): string => {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? '';
};

/**
 * Extracts the parent folder path from a path.
 * Returns empty string for root-level items.
 *
 * @example
 * getParentPath("Vorhaben/doc.pdf") // "Vorhaben/"
 * getParentPath("Vorhaben/Sub/doc.pdf") // "Vorhaben/Sub/"
 * getParentPath("Vorhaben/") // ""
 * getParentPath("doc.pdf") // ""
 */
export const getParentPath = (path: string): string => {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  const lastSlashIndex = normalized.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return '';
  }

  return normalized.slice(0, lastSlashIndex + 1);
};
