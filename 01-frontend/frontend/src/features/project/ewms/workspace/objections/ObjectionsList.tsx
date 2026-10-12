import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import type {
  EwmsArgumentNode,
  EwmsObjectionListItem,
  EwmsObjectionSort,
  ObjectionsFilter,
} from '../../data/ewms.nodes';
import {
  groupArgumentsByBeteiligungsEingangId,
  matchesEwmsObjectionFilenameSearch,
  matchesEwmsObjectionItemFilter,
  sortEwmsObjectionItems,
} from '../../data/ewms.nodes';
import { ObjectionRow } from './ObjectionRow';

type ObjectionsListProps = {
  objections: EwmsObjectionListItem[];
  argumentsList: EwmsArgumentNode[];
  filter: ObjectionsFilter;
  search: string | undefined;
  sort: EwmsObjectionSort;
  selectedObjectionId: string | undefined;
  onSelectObjection: (id: string) => void;
};

const OBJECTION_ITEM_ESTIMATED_HEIGHT = 40;
const OBJECTION_ITEM_OVERSCAN = 8;

export const ObjectionsList = (props: ObjectionsListProps) => {
  const {
    objections,
    argumentsList,
    filter,
    search,
    sort,
    selectedObjectionId,
    onSelectObjection,
  } = props;

  const filtered = sortEwmsObjectionItems(
    objections.filter(
      (objection) =>
        matchesEwmsObjectionItemFilter(objection, filter) &&
        matchesEwmsObjectionFilenameSearch(objection, search),
    ),
    sort,
  );
  const argumentsByEntryId =
    groupArgumentsByBeteiligungsEingangId(argumentsList);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    estimateSize: () => OBJECTION_ITEM_ESTIMATED_HEIGHT,
    getItemKey: (index) => filtered[index]?.entry.id ?? index,
    getScrollElement: () => scrollContainerRef.current,
    overscan: OBJECTION_ITEM_OVERSCAN,
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
          const objection = filtered[virtualItem.index];
          if (!objection) {
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
              <ObjectionRow
                objection={objection}
                argumentsList={argumentsByEntryId.get(objection.entry.id) ?? []}
                isSelected={
                  selectedObjectionId === objection.entry.fileId ||
                  selectedObjectionId === objection.entry.id
                }
                onSelect={onSelectObjection}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
