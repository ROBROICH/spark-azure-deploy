import { isNeedsRevision } from '@/features/project/versioning/revisionStatus';
import type { RevisionStatus } from '@/features/project/versioning/revisionStatus';
import type { AiNormCardVariant } from '@/features/ui/cards/ai-norm-card/AiNormCard';

export const getNormCardVariant = (params: {
  hasMatchHighlight: boolean;
  reviewStatus: RevisionStatus;
}): AiNormCardVariant => {
  if (params.reviewStatus === 'checked') {
    return 'success';
  }

  if (isNeedsRevision(params.reviewStatus)) {
    return 'default';
  }

  if (params.hasMatchHighlight) {
    return 'match';
  }

  return 'default';
};
