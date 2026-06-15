import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNodeSummaryRefetchOnTrackedPersistence } from '@/db/nodes/hooks/useNodeSummaryRefetchOnTrackedPersistence';
import { useNodesByType } from '@/db/nodes/hooks/useNodesByType';
import { useTopicNodes } from '@/db/nodes/hooks/useTopicNodes';
import type { SelectMenuItem } from '@/features/ui/select-menu/SelectMenu';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
} from 'react';
import { buildEwmsSubtopicOptionsByTopic } from '../data/ewmsSubtopics';

type EwmsSubtopicsContextValue = {
  getSubtopicItemsForTopic: (
    topicId: string | null | undefined,
  ) => SelectMenuItem[];
  trackPersistenceForNodeSummaryRefetch: (promise: Promise<unknown>) => void;
};

const EMPTY_SUBTOPIC_ITEMS: SelectMenuItem[] = [];

const EwmsSubtopicsContext = createContext<EwmsSubtopicsContextValue | null>(
  null,
);

export const EwmsSubtopicsProvider = (props: PropsWithChildren) => {
  const { children } = props;
  const { index } = useGraph();
  const { data: topics } = useTopicNodes();
  const { data: subtopics } = useNodesByType('subtopic');
  const { trackPersistenceForNodeSummaryRefetch } =
    useNodeSummaryRefetchOnTrackedPersistence();

  const subtopicItemsByTopicId = useMemo(
    () => buildEwmsSubtopicOptionsByTopic(index, topics, subtopics),
    [index, subtopics, topics],
  );

  const value = useMemo(
    () => ({
      getSubtopicItemsForTopic: (topicId: string | null | undefined) =>
        topicId
          ? (subtopicItemsByTopicId.get(topicId) ?? EMPTY_SUBTOPIC_ITEMS)
          : EMPTY_SUBTOPIC_ITEMS,
      trackPersistenceForNodeSummaryRefetch,
    }),
    [subtopicItemsByTopicId, trackPersistenceForNodeSummaryRefetch],
  );

  return (
    <EwmsSubtopicsContext.Provider value={value}>
      {children}
    </EwmsSubtopicsContext.Provider>
  );
};

export const useEwmsSubtopics = () => {
  const context = useContext(EwmsSubtopicsContext);

  if (!context) {
    throw new Error(
      'useEwmsSubtopics must be used inside EwmsSubtopicsProvider',
    );
  }

  return context;
};
