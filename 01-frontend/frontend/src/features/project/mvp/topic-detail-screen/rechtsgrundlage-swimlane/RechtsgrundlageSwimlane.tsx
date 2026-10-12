import { useGraphPerfReadyByKey } from '@/db/nodes/hooks/useGraphPerfDiagnostics';
import type { NodePayloadByType } from '@/db/nodes/types';
import { lawChangesCollection } from '@/features/project/law-changes/data/collections/lawChanges.collection';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import { createLawChangeId } from '@/features/project/law-changes/data/lawChanges.utils';
import { getNextReviewStatus } from '@/features/project/versioning/revisionStatus';
import { skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useAction } from '@/db/nodes/hooks/useAction';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense, useCallback, useEffect } from 'react';
import { useLightweightRechtsgrundlageData } from '../screen-data/useRechtsgrundlageData';
import type {
  TopicNormEntry,
  TopicNormLawGroup,
} from '../screen-data/useRechtsgrundlageData.helpers';
import { useRemoveRechtsgrundlageNorm } from '../screen-data/useRemoveRechtsgrundlageNorm';
import { useMvpFundstellenContext } from '../screen-content/MvpFundstellenContext';
import { MvpLawChangeDialog } from '../screen-content/MvpLawChangeDialog';
import { MvpSelectionLabelsProvider } from '../screen-content/MvpSelectionLabelsContext';
import { NormCardItem } from '../screen-content/NormCardItem';
import { NormCardItemSkeleton } from '../screen-content/NormCardItemSkeleton';
import { NormTextView } from '../screen-content/NormTextView';
import { RechtsgrundlageAccordionView } from '../screen-content/RechtsgrundlageAccordionView';
import { ResolvedNormTextView } from '../screen-content/ResolvedNormTextView';
import { useResolvedTopicNormEntries } from '../screen-content/useResolvedTopicNormEntries';
import { useTopicNormAiAnalysisFailureCodes } from './useTopicNormAiAnalysisFailureCodes';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

const RechtsgrundlageLawGroupContentSkeleton = (props: {
  lawGroup: TopicNormLawGroup;
}) => {
  return (
    <div
      className="grid grid-cols-1 gap-2 p-1 pb-2 sm:grid-cols-2"
      {...skeletonListProps}
    >
      {props.lawGroup.topicNorms.map((topicNorm) => (
        <NormCardItemSkeleton key={topicNorm.id} />
      ))}
    </div>
  );
};

const RechtsgrundlageLawGroupContent = (props: {
  aiAnalysisFailureCodeByNormId: ReadonlyMap<string, WorkflowFailureCode>;
  canMutateTopic: boolean;
  lawGroup: TopicNormLawGroup;
  onSelectNorm: (normId: string) => void;
  onToggleReviewed: (topicNorm: NodePayloadByType<'topic_norm'>) => void;
  selectedNormId?: string;
  lawChanges: LawChangeRecord[];
}) => {
  const {
    aiAnalysisFailureCodeByNormId,
    canMutateTopic,
    lawGroup,
    onSelectNorm,
    onToggleReviewed,
    selectedNormId,
    lawChanges,
  } = props;
  const { normIdsWithFundstellen } = useMvpFundstellenContext();
  const { removeNorm, removingNormId } =
    useRemoveRechtsgrundlageNorm(canMutateTopic);
  const resolvedTopicNormEntries = useResolvedTopicNormEntries(
    lawGroup.topicNorms,
  );
  // eslint-disable-next-line no-restricted-syntax -- the memoized resolved card boundary needs a stable remove handler so unchanged norm cards can skip rerendering after a single review toggle.
  const handleRemove = useCallback(
    (currentTopicNormEntry: TopicNormEntry) => {
      if (!canMutateTopic) {
        return;
      }

      void removeNorm({
        gesetz: currentTopicNormEntry.gesetz,
        norm: currentTopicNormEntry.norm,
        topicNorms: [currentTopicNormEntry.topicNorm],
      });
    },
    [canMutateTopic, removeNorm],
  );

  useGraphPerfReadyByKey({
    name: 'mvp.rechtsgrundlage.openLawGroup.ready',
    enabled: true,
    key: lawGroup.id,
    detail: {
      lawGroupId: lawGroup.id,
      topicNormEntryCount: lawGroup.topicNorms.length,
    },
  });

  return (
    <div className="grid grid-cols-1 gap-2 p-1 pb-2 sm:grid-cols-2">
      {resolvedTopicNormEntries.map((topicNormEntry) => (
        <NormCardItem
          key={topicNormEntry.topicNorm.id}
          aiAnalysisFailureCode={
            topicNormEntry.norm
              ? (aiAnalysisFailureCodeByNormId.get(topicNormEntry.norm.id) ??
                null)
              : null
          }
          norm={topicNormEntry}
          normIdsWithFundstellen={normIdsWithFundstellen}
          removingNormId={removingNormId}
          lawChanges={lawChanges}
          selectedNormId={selectedNormId}
          canMutateTopic={canMutateTopic}
          onRemove={handleRemove}
          onSelectNorm={onSelectNorm}
          onToggleReviewed={onToggleReviewed}
        />
      ))}
    </div>
  );
};

type RechtsgrundlageSwimlaneProps = {
  canMutateTopic: boolean;
  selectedDocumentLabel?: string | null;
};

/**
 * Owns the Rechtsgrundlage lane state machine for accordion, detail view, and
 * law-change dialog routing while consuming only lightweight topic data.
 */
export const RechtsgrundlageSwimlane = (
  props: RechtsgrundlageSwimlaneProps,
) => {
  const { canMutateTopic, selectedDocumentLabel = null } = props;
  const {
    detailDocumentId,
    lawChangeId,
    rechtsgrundlageLawGroupId,
    selectedNormId,
  } = route.useSearch({
    select: (search) => ({
      detailDocumentId: search.detailDocumentId,
      lawChangeId: search.lawChangeId,
      rechtsgrundlageLawGroupId: search.rechtsgrundlageLawGroupId,
      selectedNormId: search.selectedNormId,
    }),
  });
  const navigate = route.useNavigate();
  const { transact, update } = useAction();
  const { data: lawChanges } = useLiveQuery((q) =>
    q.from({ lawChanges: lawChangesCollection }),
  );
  const { lawGroups, topicNormById } = useLightweightRechtsgrundlageData();
  const aiAnalysisFailureCodeByNormId =
    useTopicNormAiAnalysisFailureCodes(lawGroups);
  const selectedLawChangeTopicNorm = lawChangeId
    ? (lawGroups
        .flatMap((group) => group.topicNorms)
        .find((topicNorm) => {
          const paragraphNr = topicNorm.paragraphNr;

          if (!paragraphNr) {
            return false;
          }

          return lawChangeId.startsWith(
            createLawChangeId(topicNorm.jurabk, paragraphNr, ''),
          );
        }) ?? null)
    : null;
  const selectedLawChangeNorm = selectedLawChangeTopicNorm
    ? ({
        topicNorm: selectedLawChangeTopicNorm,
        gesetz: null,
        norm: null,
      } satisfies TopicNormEntry)
    : null;
  const validLawChangeId = selectedLawChangeNorm ? lawChangeId : undefined;

  // eslint-disable-next-line no-restricted-syntax -- route-backed law-change ids must be canonicalized after active-topic law groups are resolved.
  useEffect(() => {
    if (!lawChangeId || selectedLawChangeNorm) {
      return;
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        lawChangeId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [lawChangeId, navigate, selectedLawChangeNorm]);

  // eslint-disable-next-line no-restricted-syntax -- the memoized resolved card boundary needs a stable select handler so unchanged norm cards can skip rerendering after a single review toggle.
  const selectNorm = useCallback(
    (normId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          selectedNormId: prev.selectedNormId === normId ? undefined : normId,
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  // eslint-disable-next-line no-restricted-syntax -- the detail fallback and resolved detail view share this callback and should not force downstream rerenders when only a review state flips.
  const backToAccordions = useCallback(() => {
    navigate({
      search: (prev) => ({ ...prev, detailDocumentId: undefined }),
      resetScroll: false,
    });
  }, [navigate]);

  // eslint-disable-next-line no-restricted-syntax -- the accordion owner only needs a stable open-group callback so the memoized norm-card subtree does not rerender from callback identity churn.
  const setOpenLawGroup = useCallback(
    (lawGroupId: string | null) => {
      navigate({
        search: (prev) => ({
          ...prev,
          rechtsgrundlageLawGroupId: lawGroupId ?? undefined,
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  // eslint-disable-next-line no-restricted-syntax -- the memoized resolved card boundary needs a stable review toggle callback so optimistic node updates only rerender the affected card path.
  const toggleNormReviewed = useCallback(
    (topicNorm: NodePayloadByType<'topic_norm'>) => {
      if (!canMutateTopic) {
        return;
      }

      const nextStatus = getNextReviewStatus(topicNorm.mvpStatus);

      transact(() => {
        update(topicNorm, (draft) => {
          draft.mvpStatus = nextStatus;
        });
      });
    },
    [canMutateTopic, transact, update],
  );

  if (detailDocumentId) {
    const selectedTopicNorm = topicNormById.get(detailDocumentId) ?? null;
    const selectedNorm = selectedTopicNorm
      ? ({
          topicNorm: selectedTopicNorm,
          gesetz: null,
          norm: null,
        } satisfies TopicNormEntry)
      : null;

    return (
      <>
        <Suspense
          fallback={
            selectedNorm ? (
              <NormTextView
                selectedNorm={selectedNorm}
                canMutateTopic={canMutateTopic}
                lawChanges={lawChanges}
                onBack={backToAccordions}
                onToggleReviewed={toggleNormReviewed}
              />
            ) : null
          }
        >
          <ResolvedNormTextView
            detailDocumentId={detailDocumentId}
            canMutateTopic={canMutateTopic}
            lawChanges={lawChanges}
            onBack={backToAccordions}
            onToggleReviewed={toggleNormReviewed}
          />
        </Suspense>
        <MvpLawChangeDialog
          lawChangeId={validLawChangeId}
          selectedLawChangeNorm={selectedLawChangeNorm}
        />
      </>
    );
  }

  return (
    <>
      <MvpSelectionLabelsProvider selectedDocumentLabel={selectedDocumentLabel}>
        <RechtsgrundlageAccordionView
          lawGroups={lawGroups}
          lawChanges={lawChanges}
          openLawGroupId={rechtsgrundlageLawGroupId ?? null}
          renderLawGroupContent={(lawGroup) => (
            <Suspense
              fallback={
                <RechtsgrundlageLawGroupContentSkeleton lawGroup={lawGroup} />
              }
            >
              <RechtsgrundlageLawGroupContent
                aiAnalysisFailureCodeByNormId={aiAnalysisFailureCodeByNormId}
                canMutateTopic={canMutateTopic}
                lawGroup={lawGroup}
                lawChanges={lawChanges}
                onSelectNorm={selectNorm}
                selectedNormId={selectedNormId}
                onToggleReviewed={toggleNormReviewed}
              />
            </Suspense>
          )}
          onOpenLawGroupChange={setOpenLawGroup}
        />
      </MvpSelectionLabelsProvider>
      <MvpLawChangeDialog
        lawChangeId={validLawChangeId}
        selectedLawChangeNorm={selectedLawChangeNorm}
      />
    </>
  );
};
