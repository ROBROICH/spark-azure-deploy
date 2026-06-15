import { cn } from '@/features/ui/style/cn';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export const RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME =
  'flex w-full items-center gap-2 rounded-lg bg-bg-secondary text-[13px] leading-[18px] tracking-[-0.13px] text-brand-950';

export const RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME =
  'flex min-w-0 flex-1 items-center gap-2 p-2';

type RpbOverviewItemRowProps = {
  children: ReactNode;
  showChevron?: boolean;
  className?: string;
  contentClassName?: string;
};

export function RpbOverviewItemRow(props: RpbOverviewItemRowProps) {
  const { children, showChevron = false, className, contentClassName } = props;

  return (
    <div className={cn(RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME, className)}>
      <div
        className={cn(
          RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME,
          contentClassName,
        )}
      >
        {children}
        {showChevron && (
          <ChevronRight
            aria-hidden="true"
            className="text-content-tertiary size-4 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
