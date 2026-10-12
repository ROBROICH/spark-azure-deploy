import type { CatalogNorm } from '../data/usecaseApi';
import { normIdentityKey } from './catalogDraftValidation';

export const catalogNormFromSelection = (norm: CatalogNorm): CatalogNorm => ({
  jurabk: norm.jurabk,
  paragraphNr: norm.paragraphNr,
  absatz: norm.absatz,
  satz: norm.satz,
  nummer: norm.nummer,
});

/**
 * Keeps unchanged federal refs in their original list, stores newly selected
 * refs in pruefungsNorms, and drops cleared refs from both lists.
 */
export const applyFederalNormSelection = (
  pruefungsNorms: ReadonlyArray<CatalogNorm>,
  verfahrensNorms: ReadonlyArray<CatalogNorm>,
  selected: ReadonlyArray<CatalogNorm>,
): { pruefungsNorms: CatalogNorm[]; verfahrensNorms: CatalogNorm[] } => {
  const selectedByIdentity = new Map(
    selected.map((norm) => [normIdentityKey(norm), norm]),
  );
  const nextPruefungsNorms = pruefungsNorms.filter((norm) =>
    selectedByIdentity.has(normIdentityKey(norm)),
  );
  const nextVerfahrensNorms = verfahrensNorms.filter((norm) =>
    selectedByIdentity.has(normIdentityKey(norm)),
  );
  const keptIdentities = new Set([
    ...nextPruefungsNorms.map(normIdentityKey),
    ...nextVerfahrensNorms.map(normIdentityKey),
  ]);

  for (const [identity, norm] of selectedByIdentity) {
    if (keptIdentities.has(identity)) {
      continue;
    }
    nextPruefungsNorms.push(catalogNormFromSelection(norm));
    keptIdentities.add(identity);
  }

  return {
    pruefungsNorms: nextPruefungsNorms,
    verfahrensNorms: nextVerfahrensNorms,
  };
};
