import type {
  LawPickerGroup,
  LawPickerNorm,
} from '@/features/shared/legal-basis-picker/legalBasisPicker.model';

import type { CatalogNorm } from '../data/usecaseApi';
import { normIdentityKey } from './catalogDraftValidation';
import type { LegalBasisNormItem } from './legalBasisNormQuery';

export const legalBasisItemToCatalogNorm = (
  item: LegalBasisNormItem,
): CatalogNorm => ({
  jurabk: item.jurabk,
  paragraphNr: item.paragraphNr,
  absatz: null,
  satz: null,
  nummer: null,
});

export const formatLegalBasisNormLabel = (item: LegalBasisNormItem): string => {
  const paragraphRef = item.paragraphNr ? `§ ${item.paragraphNr}` : '§';
  if (!item.paragraphTitel) {
    return paragraphRef;
  }
  return `${paragraphRef} ${item.paragraphTitel}`;
};

export const formatCatalogNormLabel = (norm: CatalogNorm): string => {
  const parts = [norm.paragraphNr ? `§ ${norm.paragraphNr}` : '§'];
  if (norm.absatz) {
    parts.push(`Abs. ${norm.absatz}`);
  }
  if (norm.satz) {
    parts.push(`Satz ${norm.satz}`);
  }
  if (norm.nummer) {
    parts.push(`Nr. ${norm.nummer}`);
  }
  return parts.join(' ');
};

export const catalogNormsByIdentity = (
  norms: ReadonlyArray<CatalogNorm>,
): Map<string, CatalogNorm> =>
  new Map(norms.map((norm) => [normIdentityKey(norm), norm]));

export const toPickerGroups = (
  items: ReadonlyArray<LegalBasisNormItem>,
  loadingLawId: string | null,
): { groups: LawPickerGroup[]; normsById: Map<string, CatalogNorm> } => {
  const normsById = new Map<string, CatalogNorm>();
  const byLaw = new Map<string, { label: string; norms: LawPickerNorm[] }>();

  for (const item of items) {
    const catalogNorm = legalBasisItemToCatalogNorm(item);
    const id = normIdentityKey(catalogNorm);
    normsById.set(id, catalogNorm);
    const lawId = item.gesetz.id;
    const current = byLaw.get(lawId) ?? {
      label: item.gesetz.jurabk,
      norms: [],
    };
    if (!current.norms.some((norm) => norm.id === id)) {
      current.norms.push({
        id,
        label: formatLegalBasisNormLabel(item),
      });
    }
    byLaw.set(lawId, current);
  }

  const groups = [...byLaw.entries()].map(([id, group]) => ({
    id,
    label: group.label,
    norms: group.norms,
    isComplete: true,
    isLoadingComplete: loadingLawId === id,
  }));

  return { groups, normsById };
};

export const withUnavailablePersistedNorms = (
  groups: LawPickerGroup[],
  normsById: Map<string, CatalogNorm>,
  persisted: ReadonlyArray<CatalogNorm>,
): { groups: LawPickerGroup[]; normsById: Map<string, CatalogNorm> } => {
  const nextGroups = groups.map((group) => ({
    ...group,
    norms: [...group.norms],
  }));
  const nextNormsById = new Map(normsById);
  const presentIds = new Set(
    nextGroups.flatMap((group) => group.norms.map((norm) => norm.id)),
  );

  for (const norm of persisted) {
    const id = normIdentityKey(norm);
    if (presentIds.has(id)) {
      continue;
    }
    presentIds.add(id);
    nextNormsById.set(id, norm);
    const pickerNorm: LawPickerNorm = {
      id,
      label: formatCatalogNormLabel(norm),
      unavailable: true,
    };
    const existing = nextGroups.find((group) => group.label === norm.jurabk);
    if (existing) {
      existing.norms.push(pickerNorm);
      continue;
    }
    nextGroups.push({
      id: `unavailable:${norm.jurabk}`,
      label: norm.jurabk,
      norms: [pickerNorm],
      isComplete: true,
      isLoadingComplete: false,
    });
  }

  return { groups: nextGroups, normsById: nextNormsById };
};

export const selectedCatalogNorms = (
  selectedIds: ReadonlySet<string>,
  normsById: ReadonlyMap<string, CatalogNorm>,
): CatalogNorm[] => {
  const selected: CatalogNorm[] = [];
  for (const id of selectedIds) {
    const norm = normsById.get(id);
    if (norm) {
      selected.push(norm);
    }
  }
  return selected;
};

export const toggleGroupSelection = (
  selectedIds: ReadonlySet<string>,
  groupNormIds: ReadonlyArray<string>,
  selectableNormIds: ReadonlyArray<string> = groupNormIds,
): Set<string> => {
  const hasSelectedGroupNorm = groupNormIds.some((id) => selectedIds.has(id));
  const allSelectableSelected =
    selectableNormIds.length > 0 &&
    selectableNormIds.every((id) => selectedIds.has(id));
  const shouldClear =
    allSelectableSelected ||
    (selectableNormIds.length === 0 && hasSelectedGroupNorm);
  const next = new Set(selectedIds);

  if (shouldClear) {
    for (const id of groupNormIds) {
      next.delete(id);
    }
    return next;
  }

  for (const id of selectableNormIds) {
    next.add(id);
  }

  return next;
};
