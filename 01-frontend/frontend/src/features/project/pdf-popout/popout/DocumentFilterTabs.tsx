import { cn } from '@/features/ui/style/cn';
import { type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentFilter } from '../workspace-state/useSidebarState';

const FILTERS: DocumentFilter[] = ['all', 'topic'];

export type DocumentFilterTabsProps = {
  /** Shared ID prefix — must come from the same useId() call used to build the tabpanel IDs. */
  idPrefix: string;
  documentFilter: DocumentFilter;
  onFilterChange: (filter: DocumentFilter) => void;
  topicLabel: string;
  allCount: number;
  topicCount: number;
};

/**
 * Accessible tab list for switching between all/topic document filters.
 * Implemented natively (not via Radix) because this renders inside a
 * window.open popup — Radix's roving focus group holds a reference to the
 * main window's document and never receives keyboard events from the popup.
 */
export const DocumentFilterTabs = (props: DocumentFilterTabsProps) => {
  const {
    idPrefix,
    documentFilter,
    onFilterChange,
    topicLabel,
    allCount,
    topicCount,
  } = props;
  const { t } = useTranslation('PdfPopout');

  const labels = {
    all: t('PdfPopoutSidebar.filterAll', { count: allCount }),
    topic: t('PdfPopoutSidebar.filterTopic', {
      label: topicLabel,
      count: topicCount,
    }),
  } satisfies Record<DocumentFilter, string>;

  const handleKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
    current: DocumentFilter,
  ) => {
    const currentIndex = FILTERS.indexOf(current);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = FILTERS[(currentIndex + 1) % FILTERS.length];
      if (!next) {
        return;
      }
      onFilterChange(next);
      (
        e.currentTarget.parentElement?.querySelector(
          `[data-value="${next}"]`,
        ) as HTMLElement | null
      )?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev =
        FILTERS[(currentIndex - 1 + FILTERS.length) % FILTERS.length];
      if (!prev) {
        return;
      }
      onFilterChange(prev);
      (
        e.currentTarget.parentElement?.querySelector(
          `[data-value="${prev}"]`,
        ) as HTMLElement | null
      )?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t('PdfPopoutSidebar.filterTablistLabel')}
      className="flex border-b border-border-primary px-3"
    >
      {FILTERS.map((filter) => {
        const isActive = documentFilter === filter;
        return (
          <button
            key={filter}
            type="button"
            role="tab"
            data-value={filter}
            id={`${idPrefix}-tab-${filter}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${filter}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onFilterChange(filter)}
            onKeyDown={(e) => handleKeyDown(e, filter)}
            className={cn(
              'focus-ring rounded-none border-b border-transparent px-5 py-[15px] text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-slate-600 transition-[color,box-shadow] focus-visible:rounded-[5px]',
              isActive && 'border-brand-950 text-brand-950',
            )}
          >
            {labels[filter]}
          </button>
        );
      })}
    </div>
  );
};
