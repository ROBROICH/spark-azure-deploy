import { useGraph } from '@/db/nodes/ProjectGraphProvider';
import { useTopicNodes } from '@/db/nodes/hooks/useTopicNodes';
import { toast } from '@/features/ui/toast/Toast';
import { lawChangesCollection } from '@/features/project/law-changes/data/collections/lawChanges.collection';
import { useTopicWritePermission } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useAction } from '@/db/nodes/hooks/useAction';
import * as Sentry from '@sentry/react';
import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { MvpOverviewHeader } from './screen-content/MvpOverviewHeader';
import { MvpTopicCard } from './screen-content/MvpTopicCard';
import { MvpTopicsFilterBar } from './screen-content/MvpTopicsFilterBar';
import { useOverviewTopicNormsByTopicId } from './screen-data/useOverviewTopicNormsByTopicId';
import { useProjectAssignedUsers } from './screen-data/useProjectAssignedUsers';
import {
  countCompletedTopics,
  countTopicDocuments,
  filterTopicsByAssignees,
  filterTopicsByStatus,
  hasNeedsRevisionTopicNorm,
  mapInternalFundstellePresenceByTopicId,
  normalizeTopicAssigneeIds,
  sortTopics,
} from './overview.logic';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/');
const MAX_TOPIC_ASSIGNEES = 7;

/**
 * Owns the MVP overview's route-backed search/sort state and keeps the card
 * grid derived from the same topic, topic_norm, and assignment data that the
 * detail routes use.
 */
export const TopicsOverviewScreen = () => {
  const { t } = useTranslation('MaterialCompletenessCheck');
  const { transact, update } = useAction();
  const { index } = useGraph();
  const { data: topics } = useTopicNodes();
  const getTopicWritePermission = useTopicWritePermission();
  const { projectUsers } = useProjectAssignedUsers();
  const { data: lawChanges } = useLiveQuery((q) =>
    q.from({ lawChanges: lawChangesCollection }),
  );
  const {
    search = '',
    topicAssigneeIds,
    topicSort = 'titleAsc',
    topicStatus,
  } = route.useSearch({
    select: (searchParams) => ({
      search: searchParams.search,
      topicAssigneeIds: searchParams.topicAssigneeIds,
      topicSort: searchParams.topicSort,
      topicStatus: searchParams.topicStatus,
    }),
  });
  const overviewTopics = topics.filter((topic) => topic.showInMvp !== false);

  const deferredSearch = useDeferredValue(search);
  const topicNormsByTopicId = useOverviewTopicNormsByTopicId(
    overviewTopics,
    index,
  );
  const topicDocumentCounts = countTopicDocuments(overviewTopics, index);
  const internalFundstellePresenceByTopicId =
    mapInternalFundstellePresenceByTopicId(overviewTopics, index);
  const normalizedTopicAssigneeIds = normalizeTopicAssigneeIds(
    topicAssigneeIds,
    projectUsers,
  );

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const searchFilteredTopics = overviewTopics.filter((topic) => {
    const matchesSearch = !normalizedSearch
      ? true
      : topic.name.toLowerCase().includes(normalizedSearch);

    return matchesSearch;
  });
  const assigneeFilteredTopics = filterTopicsByAssignees(
    searchFilteredTopics,
    normalizedTopicAssigneeIds,
  );
  const filteredTopics = filterTopicsByStatus(
    assigneeFilteredTopics,
    topicNormsByTopicId,
    topicStatus,
  );

  const sortedTopics = sortTopics(filteredTopics, topicSort);

  const totalTopics = overviewTopics.length;
  const completedTopics = countCompletedTopics(
    overviewTopics,
    topicNormsByTopicId,
  );

  const updateAssignmentWithFeedback = async (
    topicId: string,
    assignedUserIds: string[],
  ) => {
    const topic = overviewTopics.find((candidate) => candidate.id === topicId);
    if (!topic) {
      return;
    }

    try {
      const tx = transact(() => {
        update(topic, (draft) => {
          draft.mvpAssignees = assignedUserIds.slice(0, MAX_TOPIC_ASSIGNEES);
          draft.updatedAt = new Date().toISOString();
        });
      });
      await tx.isPersisted.promise;
    } catch (error) {
      Sentry.captureException(error);
      toast.error(t('TopicWorkflow.errors.saveFailed'));
    }
  };
  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white px-4 py-8 md:px-32">
      <div className="mx-auto flex w-full max-w-container flex-col gap-4">
        <MvpOverviewHeader
          completedTopics={completedTopics}
          totalTopics={totalTopics}
        />

        <MvpTopicsFilterBar />

        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {t('TopicWorkflow.overviewFilters.searchResultsCount', {
            count: sortedTopics.length,
          })}
        </p>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 xl:grid-cols-4">
          {sortedTopics.map((topic) => {
            const topicWritePermission = getTopicWritePermission(
              topic.mvpAssignees,
            );

            return (
              <MvpTopicCard
                key={topic.id}
                topic={topic}
                canChangeAssignedUsers={topicWritePermission.canWrite}
                topicWritePermission={topicWritePermission}
                onChangeAssignedUsers={(topicId, assignedUserIds) => {
                  void updateAssignmentWithFeedback(topicId, assignedUserIds);
                }}
                documentCount={topicDocumentCounts.get(topic.id) ?? 0}
                lawChanges={lawChanges}
                hasInternalFundstelle={
                  internalFundstellePresenceByTopicId.get(topic.id) ?? false
                }
                topicNorms={topicNormsByTopicId.get(topic.id) ?? []}
                hasNeedsRevisionNorms={hasNeedsRevisionTopicNorm(
                  topicNormsByTopicId.get(topic.id) ?? [],
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
