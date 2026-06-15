import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import type { ReactNode } from 'react';

type SidebarListStateProps = {
  isLoading: boolean;
  isError: boolean;
  loadingAriaLabel: string;
  errorMessage: string;
  retryLabel: string;
  onRetry: () => void;
  children: ReactNode;
};

/**
 * Renders the loading, error, or ready state for a sidebar list panel so the
 * comments and request-list panels surface load failures instead of silently
 * showing an empty list.
 *
 * @param props Loading/error flags, accessible labels, a retry handler, and the
 *   ready-state children.
 * @returns A skeleton while loading, a retryable error message on failure, or
 *   the children once the list resolves.
 */
export const SidebarListState = (props: SidebarListStateProps) => {
  const {
    isLoading,
    isError,
    loadingAriaLabel,
    errorMessage,
    retryLabel,
    onRetry,
    children,
  } = props;

  if (isLoading) {
    return (
      <div
        className="flex flex-col gap-3"
        role="status"
        aria-label={loadingAriaLabel}
        {...skeletonListProps}
      >
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border-[0.5px] border-border-secondary bg-neutral-white p-3">
        <p role="alert" className="text-sm text-text-secondary">
          {errorMessage}
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    );
  }

  return children;
};
