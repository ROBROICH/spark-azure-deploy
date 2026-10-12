import type { CatalogNorm } from '../data/usecaseApi';

const normalizeName = (value: string): string => value.trim();

export const normalizeNormText = (
  value: string | null | undefined,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normIdentityKey = (norm: CatalogNorm): string =>
  [
    normalizeName(norm.jurabk),
    normalizeNormText(norm.paragraphNr) ?? '',
    normalizeNormText(norm.absatz) ?? '',
    normalizeNormText(norm.satz) ?? '',
    normalizeNormText(norm.nummer) ?? '',
  ].join('\u0000');

export const countUniqueNorms = (
  lists: ReadonlyArray<ReadonlyArray<CatalogNorm>>,
): number => {
  const identities = new Set<string>();
  for (const list of lists) {
    for (const norm of list) {
      identities.add(normIdentityKey(norm));
    }
  }
  return identities.size;
};

export const dedupeNormsByIdentity = (
  norms: ReadonlyArray<CatalogNorm>,
): CatalogNorm[] => {
  const seen = new Set<string>();
  const unique: CatalogNorm[] = [];
  for (const norm of norms) {
    const identity = normIdentityKey(norm);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    unique.push(norm);
  }
  return unique;
};
