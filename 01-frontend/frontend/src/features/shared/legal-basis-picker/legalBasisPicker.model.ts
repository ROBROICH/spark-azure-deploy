export type LawPickerNorm = {
  id: string;
  label: string;
  unavailable?: boolean;
};

export type LawPickerGroup = {
  id: string;
  label: string;
  norms: LawPickerNorm[];
  isComplete: boolean;
  isLoadingComplete: boolean;
};

export type LawPickerStatus = 'loading' | 'empty' | 'error' | 'ready';

export type LawGroupSelectionState = 'checked' | 'unchecked' | 'indeterminate';
