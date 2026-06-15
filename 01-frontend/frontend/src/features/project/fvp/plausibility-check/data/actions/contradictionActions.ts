import type { PlausibilityNoteStatus } from '@/api-clients/pns-module';
import { contradictionsCollection } from '@/features/project/fvp/data/plausibility/contradictions.collection';

const updateContradictionStatus = (
  id: string,
  status: PlausibilityNoteStatus,
) => {
  return contradictionsCollection.update(id, (draft) => {
    draft.status = status;
  });
};

export const markAsIgnored = (id: string) => {
  return updateContradictionStatus(id, 'IGNORED');
};

export const resetToOpen = (id: string) => {
  return updateContradictionStatus(id, 'OPEN');
};
