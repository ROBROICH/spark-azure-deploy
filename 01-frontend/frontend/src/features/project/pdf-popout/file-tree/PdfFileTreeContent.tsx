import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import type { ReactNode } from 'react';

type PdfFileTreeContentProps = {
  isLoading: boolean;
  isError: boolean;
  loadingAriaLabel: string;
  errorMessage: string;
  theme?: 'light' | 'dark';
  children: ReactNode;
};

/**
 * Renders a loading, error, or ready state for a file tree panel.
 * Used by both the dark dropdown and the light popover to avoid
 * duplicating the same loading/error/content branching.
 *
 * @param props Loading state, error state, theme, and the ready-state children.
 * @returns The appropriate UI for the current data state.
 */
export const PdfFileTreeContent = (props: PdfFileTreeContentProps) => {
  const {
    isLoading,
    isError,
    loadingAriaLabel,
    errorMessage,
    theme = 'light',
    children,
  } = props;
  const isDark = theme === 'dark';

  if (isLoading) {
    const skeletonClassName = isDark
      ? 'h-7 w-full rounded-md text-neutral-white'
      : 'h-7 w-full rounded-md';

    return (
      <div
        className="flex flex-col gap-1 p-1"
        role="status"
        aria-label={loadingAriaLabel}
        {...skeletonListProps}
      >
        <Skeleton className={skeletonClassName} />
        <Skeleton className={skeletonClassName} />
        <Skeleton className={skeletonClassName} />
      </div>
    );
  }

  if (isError) {
    return (
      <p
        role="alert"
        className={
          isDark
            ? 'px-1 py-2 text-[13px] text-red-400'
            : 'px-1 py-2 text-[13px] text-red-600'
        }
      >
        {errorMessage}
      </p>
    );
  }

  return children;
};
