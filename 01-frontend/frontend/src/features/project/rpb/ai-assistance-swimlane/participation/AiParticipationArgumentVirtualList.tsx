import { useAction } from '@/db/nodes/hooks/useAction';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AiParticipationArgumentCard } from './AiParticipationArgumentCard';
import type { RpbArgumentNode } from './rpbParticipationArguments';

type AiParticipationArgumentVirtualListProps = {
  argumentsList: RpbArgumentNode[];
  canMutate: boolean;
};

export const AiParticipationArgumentVirtualList = (
  props: AiParticipationArgumentVirtualListProps,
) => {
  const { argumentsList, canMutate } = props;
  const { t } = useTranslation('Rpb');
  const { transact, update } = useAction();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: argumentsList.length,
    estimateSize: () => 160,
    getScrollElement: () => scrollContainerRef.current,
    overscan: 5,
  });

  const toggleInBeschluss = (argument: RpbArgumentNode) => {
    if (!canMutate || !argument.is_valid_argument) {
      return;
    }

    transact(() => {
      update(argument, (draft) => {
        draft.in_vae = !argument.in_vae;
      });
    });
  };

  if (argumentsList.length === 0) {
    return (
      <p className="text-content-secondary text-[13px] leading-[18px]">
        {t('aiAssistance.participationNoArgumentsForSubtopic')}
      </p>
    );
  }

  return (
    <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto">
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
              role="listitem"
              className="absolute top-0 left-0 w-full pb-2"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <AiParticipationArgumentCard
                argument={argument}
                canMutate={canMutate}
                onToggleInBeschluss={toggleInBeschluss}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
