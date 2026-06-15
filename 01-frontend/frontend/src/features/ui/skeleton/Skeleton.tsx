import { cn } from '@/features/ui/style/cn';

const skeletonListProps = {
  'data-skeleton-list': true,
} as const;

function Skeleton(props: React.ComponentProps<'div'>) {
  const {
    className,
    'aria-hidden': ariaHidden = true,
    ...skeletonProps
  } = props;

  return (
    <div
      data-slot="skeleton"
      aria-hidden={ariaHidden}
      className={cn(
        'skeleton-pulse rounded-md bg-current text-neutral-800',
        className,
      )}
      {...skeletonProps}
    />
  );
}

function SkeletonList(props: React.ComponentProps<'div'>) {
  const { className, ...listProps } = props;

  return (
    <div
      {...skeletonListProps}
      data-slot="skeleton-list"
      className={cn(className)}
      {...listProps}
    />
  );
}

export { Skeleton, SkeletonList, skeletonListProps };
