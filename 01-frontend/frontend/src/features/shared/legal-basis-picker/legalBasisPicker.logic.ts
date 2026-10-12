import type {
  LawGroupSelectionState,
  LawPickerGroup,
} from './legalBasisPicker.model';

export const parentSelectionState = (params: {
  selectedCount: number;
  totalCount: number;
  isComplete: boolean;
}): LawGroupSelectionState => {
  if (params.totalCount === 0 || params.selectedCount === 0) {
    return 'unchecked';
  }

  if (params.isComplete && params.selectedCount === params.totalCount) {
    return 'checked';
  }

  return 'indeterminate';
};

export const countSelectedGroupNorms = (
  group: LawPickerGroup,
  selectedIds: ReadonlySet<string>,
): number => group.norms.filter((norm) => selectedIds.has(norm.id)).length;
