import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PaginationEllipsis,
  PaginationNext,
  PaginationPrevious,
} from './Pagination';

afterEach(() => cleanup());

describe('Pagination', () => {
  it('keeps previous and next links named at small breakpoints', () => {
    render(
      <>
        <PaginationPrevious href="#previous">Previous</PaginationPrevious>
        <PaginationNext href="#next">Next</PaginationNext>
      </>,
    );

    expect(screen.getByRole('link', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('Previous')).toHaveClass(
      'sr-only',
      'sm:not-sr-only',
    );
    expect(screen.getByText('Next')).toHaveClass('sr-only', 'sm:not-sr-only');
  });

  it('keeps ellipsis text available to assistive technology', () => {
    render(<PaginationEllipsis>More pages</PaginationEllipsis>);

    expect(screen.getByText('More pages')).toHaveClass('sr-only');
    expect(screen.getByText('More pages').parentElement).not.toHaveAttribute(
      'aria-hidden',
    );
  });
});
