import { cn } from '@/features/ui/style/cn';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EwmsArgumentNode, EwmsTopicNode } from '../../data/ewms.nodes';
import { isEwmsArgumentApproved } from '../../data/ewms.nodes';
import { EWMS_UNASSIGNED_SUBTOPIC_SELECTION } from '../../data/ewmsSubtopicSelection';

export type TopicSubtopicRow = {
  id: string;
  name: string | null;
  argumentsList: EwmsArgumentNode[];
};

type TopicRowProps = {
  topic: EwmsTopicNode;
  argumentsList: EwmsArgumentNode[];
  isExpandable: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  selectedTopicId: string | undefined;
  selectedSubtopicId: string | undefined;
  subtopicRows: TopicSubtopicRow[];
  onExpand: () => void;
  onSelect: (id: string) => void;
  onSelectSubtopic: (topicId: string, subtopicId: string) => void;
};

const getBadgeState = (argumentsList: EwmsArgumentNode[]) => {
  const approvedCount = argumentsList.filter(isEwmsArgumentApproved).length;
  const totalCount = argumentsList.length;

  return {
    approvedCount,
    hasApproved: approvedCount > 0,
    totalCount,
  };
};

const ArgumentCountBadge = (props: { argumentsList: EwmsArgumentNode[] }) => {
  const { argumentsList } = props;
  const { t } = useTranslation('Ewms');
  const { approvedCount, hasApproved, totalCount } =
    getBadgeState(argumentsList);

  if (hasApproved) {
    return (
      <div className="shrink-0 rounded border border-green-500 bg-green-50 px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-green-900">
        {t('topics.approvedBadge', {
          approvedCount,
          count: totalCount,
          totalCount,
        })}
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded bg-white px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-600">
      {t('topics.argumentsBadge', { count: totalCount })}
    </div>
  );
};

const SubtopicRow = (props: {
  row: TopicSubtopicRow;
  topicId: string;
  isSelected: boolean;
  onSelect: (topicId: string, subtopicId: string) => void;
}) => {
  const { row, topicId, isSelected, onSelect } = props;
  const { t } = useTranslation('Ewms');
  const name =
    row.id === EWMS_UNASSIGNED_SUBTOPIC_SELECTION
      ? t('topics.unassignedSubtopic')
      : (row.name ?? '');

  return (
    <div role="listitem" className="pl-11">
      <button
        type="button"
        onClick={() => onSelect(topicId, row.id)}
        aria-pressed={isSelected}
        aria-label={t('topics.selectSubtopicLabel', { name })}
        className={cn(
          'relative flex w-full items-center gap-2 rounded-lg py-1 pr-1 pl-3 text-left transition-colors',
          'focus-ring hover:bg-slate-100',
          isSelected
            ? 'bg-blue-50 shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6,0_2px_4px_rgba(2,6,23,0.1),0_4px_16px_rgba(2,6,23,0.1)]'
            : '',
        )}
      >
        <p
          className={cn(
            'min-w-0 flex-1 overflow-hidden text-[13px] leading-[18px] text-ellipsis whitespace-nowrap',
            isSelected
              ? 'font-medium text-brand-950'
              : 'font-normal text-slate-600',
          )}
        >
          {name}
        </p>
        <ArgumentCountBadge argumentsList={row.argumentsList} />
        {isSelected && (
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_-4px_8px_0_rgba(2,6,23,0.05)]" />
        )}
      </button>
    </div>
  );
};

export const TopicRow = (props: TopicRowProps) => {
  const {
    topic,
    argumentsList,
    isExpandable,
    isExpanded,
    isSelected,
    selectedTopicId,
    selectedSubtopicId,
    subtopicRows,
    onExpand,
    onSelect,
    onSelectSubtopic,
  } = props;
  const { id } = topic;
  const { t } = useTranslation('Ewms');

  const name = topic.name;

  return (
    <div role="listitem">
      <div className="flex items-center gap-1">
        {isExpandable ? (
          <button
            type="button"
            onClick={onExpand}
            aria-expanded={isExpanded}
            aria-label={t(
              isExpanded ? 'topics.collapseLabel' : 'topics.expandLabel',
              { name },
            )}
            className="focus-ring flex size-6 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
          >
            <ChevronRight
              aria-hidden
              className={cn(
                'size-4 transition-transform',
                isExpanded ? 'rotate-90' : '',
              )}
            />
          </button>
        ) : (
          <div aria-hidden className="size-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={isSelected}
          aria-label={t('topics.selectLabel', { name })}
          className={cn(
            'relative flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pr-1 pl-3 text-left transition-colors',
            'focus-ring hover:bg-slate-100',
            isSelected
              ? 'bg-blue-50 shadow-[0_0_0_2px_white,0_0_0_4px_#3b82f6,0_2px_4px_rgba(2,6,23,0.1),0_4px_16px_rgba(2,6,23,0.1)]'
              : '',
          )}
        >
          <p
            className={cn(
              'min-w-0 flex-1 overflow-hidden text-[13px] leading-[18px] tracking-[-0.13px] text-ellipsis whitespace-nowrap',
              isSelected
                ? 'font-medium text-brand-950'
                : 'font-normal text-slate-600',
            )}
          >
            {name}
          </p>
          <ArgumentCountBadge argumentsList={argumentsList} />
          {isSelected && (
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_-4px_8px_0_rgba(2,6,23,0.05)]" />
          )}
        </button>
      </div>
      {isExpanded && (
        <div role="list" className="mt-1 flex flex-col gap-1">
          {subtopicRows.map((row) => (
            <SubtopicRow
              key={row.id}
              row={row}
              topicId={id}
              isSelected={
                selectedTopicId === id && selectedSubtopicId === row.id
              }
              onSelect={onSelectSubtopic}
            />
          ))}
        </div>
      )}
    </div>
  );
};
