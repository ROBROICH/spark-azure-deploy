import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsTopicNode,
} from '../../data/ewms.nodes';
import { ArgumentListItem, getTopicItems } from './ArgumentListItem';

type ArgumentItemsListProps = {
  argumentsList: EwmsArgumentNode[];
  entriesById: Map<string, EwmsBeteiligungsEingang>;
  topics: EwmsTopicNode[];
  onDeleteArgument: (argument: EwmsArgumentNode) => void;
  onToggleArgument: (argument: EwmsArgumentNode) => void;
  onUpdateArgumentTopic: (argument: EwmsArgumentNode, topicId: string) => void;
  onUpdateArgumentSubtopic: (
    argument: EwmsArgumentNode,
    subtopicId: string,
  ) => void;
  onReviewArgumentClassification: (
    argument: EwmsArgumentNode,
    isAccepted: boolean,
  ) => void;
  onSelectArgument?: (argumentId: string, trigger: HTMLElement) => void;
};

const ARGUMENT_ITEM_ESTIMATED_HEIGHT = 192;
const ARGUMENT_ITEM_OVERSCAN = 6;

export const ArgumentItemsList = (props: ArgumentItemsListProps) => {
  const {
    argumentsList,
    entriesById,
    topics,
    onDeleteArgument,
    onToggleArgument,
    onUpdateArgumentTopic,
    onUpdateArgumentSubtopic,
    onReviewArgumentClassification,
    onSelectArgument,
  } = props;

  const topicItems = getTopicItems(topics);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: argumentsList.length,
    estimateSize: () => ARGUMENT_ITEM_ESTIMATED_HEIGHT,
    getItemKey: (index) => argumentsList[index]?.id ?? index,
    getScrollElement: () => scrollContainerRef.current,
    overscan: ARGUMENT_ITEM_OVERSCAN,
  });

  return (
    <div
      ref={scrollContainerRef}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
    >
      <div
        role="list"
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const argument = argumentsList[virtualItem.index];
          if (!argument) {
            return null;
          }

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute top-0 left-0 w-full pb-2"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ArgumentListItem
                argument={argument}
                entry={entriesById.get(argument.beteiligungsEingangId)}
                topicItems={topicItems}
                onDeleteArgument={onDeleteArgument}
                onReviewArgumentClassification={onReviewArgumentClassification}
                onSelectArgument={onSelectArgument}
                onToggleArgument={onToggleArgument}
                onUpdateArgumentSubtopic={onUpdateArgumentSubtopic}
                onUpdateArgumentTopic={onUpdateArgumentTopic}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
