import type { NodeRefByType } from '@/db/nodes/types';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNode } from '@/db/nodes/hooks/useNodes';
import {
  areAllSatzStatusesChecked,
  getSparseSatzStatus,
  hasAnySatzStatusNeedsRevision,
  isSparseSatzChecked,
  resolveBulkSatzStatuses,
  toggleSparseSatzStatus,
} from '@/features/project/versioning/revisionStatus';
import { createContext, useContext, useMemo } from 'react';

type AiTopicNormProviderProps = {
  topicNormRef: NodeRefByType<'topic_norm'>;
  children: React.ReactNode;
};

/**
 * Owns the topic-norm sentence completion mutations and exposes one stable
 * provider value for both per-sentence and bulk toggle interactions.
 */
const useKiTopicNormContextLogic = (
  topicNormRef: NodeRefByType<'topic_norm'>,
) => {
  const { data: topicNorm } = useNode(topicNormRef);
  const { transact, update } = useAction();
  const satzRefs = useDescendants('satz', topicNormRef);
  const satzIds = satzRefs.map((satzRef) => satzRef.id);
  const satzIdSet = useMemo(() => new Set(satzIds), [satzIds]);
  const satzStatuses = topicNorm?.satz_statuses ?? {};
  const allSaetzeChecked = areAllSatzStatusesChecked(satzStatuses, satzIds);
  const hasAnySatzNeedsRevision = hasAnySatzStatusNeedsRevision(
    satzStatuses,
    satzIds,
  );
  const hasTopicMutationRights = useHasTopicMutationRights();
  const canMutateTopic = hasTopicMutationRights(topicNorm?.topic_id);

  const value = useMemo(() => {
    const toggleSatzChecked = (satzId: string) => {
      if (topicNorm === null || !canMutateTopic || !satzIdSet.has(satzId)) {
        return;
      }

      transact(() => {
        update(topicNorm, (draft) => {
          draft.satz_statuses = toggleSparseSatzStatus(
            draft.satz_statuses,
            satzId,
          );
        });
      });
    };

    const toggleAllSaetzeChecked = () => {
      if (topicNorm === null || !canMutateTopic) {
        return;
      }

      transact(() => {
        update(topicNorm, (draft) => {
          draft.satz_statuses = resolveBulkSatzStatuses(
            draft.satz_statuses,
            satzIds,
          );
        });
      });
    };

    return {
      topicNorm,
      allSaetzeChecked,
      hasAnySatzNeedsRevision,
      canMutateTopic,
      getSatzReviewStatus: (satzId: string) =>
        getSparseSatzStatus(topicNorm?.satz_statuses ?? {}, satzId),
      isSatzChecked: (satzId: string) =>
        isSparseSatzChecked(topicNorm?.satz_statuses ?? {}, satzId),
      hasAnySaetze: satzIds.length > 0,
      toggleSatzChecked,
      toggleAllSaetzeChecked,
    };
  }, [
    allSaetzeChecked,
    canMutateTopic,
    hasAnySatzNeedsRevision,
    satzIds,
    satzIdSet,
    topicNorm,
    transact,
    update,
  ]);

  return value;
};

type AiTopicNormState = ReturnType<typeof useKiTopicNormContextLogic>;

const AiTopicNormContext = createContext<AiTopicNormState | null>(null);

export const AiTopicNormProvider = (props: AiTopicNormProviderProps) => {
  const { topicNormRef, children } = props;
  const value = useKiTopicNormContextLogic(topicNormRef);

  return (
    <AiTopicNormContext.Provider value={value}>
      {children}
    </AiTopicNormContext.Provider>
  );
};

export const useKiTopicNormState = () => {
  const context = useContext(AiTopicNormContext);

  if (context === null) {
    throw new Error(
      'useKiTopicNormState must be used within AiTopicNormProvider',
    );
  }

  return context;
};
