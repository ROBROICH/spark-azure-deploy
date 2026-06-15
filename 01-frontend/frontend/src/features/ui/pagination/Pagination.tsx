import { buttonVariants } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from 'lucide-react';
import type * as React from 'react';

function Pagination(props: React.ComponentProps<'nav'>) {
  const { className, ...rest } = props;

  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...rest}
    />
  );
}

function PaginationContent(props: React.ComponentProps<'ul'>) {
  const { className, ...rest } = props;

  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex flex-row items-center gap-1', className)}
      {...rest}
    />
  );
}

function PaginationItem(props: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'default' | 'lg';
} & React.ComponentProps<'a'>;

function PaginationLink(props: PaginationLinkProps) {
  const { children, className, isActive, size = 'default', ...rest } = props;

  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? 'secondary' : 'ghost',
          size,
          className,
        }),
      )}
      {...rest}
    >
      {children}
    </a>
  );
}

function PaginationPrevious(
  props: React.ComponentProps<typeof PaginationLink>,
) {
  const { children, className, ...rest } = props;

  return (
    <PaginationLink
      size="default"
      className={cn('gap-1 px-2.5 sm:pl-2.5', className)}
      {...rest}
    >
      <ChevronLeftIcon aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{children}</span>
    </PaginationLink>
  );
}

function PaginationNext(props: React.ComponentProps<typeof PaginationLink>) {
  const { children, className, ...rest } = props;

  return (
    <PaginationLink
      size="default"
      className={cn('gap-1 px-2.5 sm:pr-2.5', className)}
      {...rest}
    >
      <span className="sr-only sm:not-sr-only">{children}</span>
      <ChevronRightIcon aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis(props: React.ComponentProps<'span'>) {
  const { children, className, ...rest } = props;

  return (
    <span
      data-slot="pagination-ellipsis"
      className={cn('flex size-9 items-center justify-center', className)}
      {...rest}
    >
      <MoreHorizontalIcon className="size-4" aria-hidden="true" />
      <span className="sr-only">{children}</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
