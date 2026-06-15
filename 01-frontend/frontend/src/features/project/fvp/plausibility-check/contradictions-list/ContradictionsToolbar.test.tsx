import type React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContradictionsToolbar } from './ContradictionsToolbar';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => ({ search: '' }),
    useNavigate: () => mocks.navigateMock,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; total?: number }) => {
      const translations = {
        'ContradictionsToolbar.decreaseRating': 'Decrease sensitivity',
        'ContradictionsToolbar.documents': 'Documents',
        'ContradictionsToolbar.increaseRating': 'Increase sensitivity',
        'ContradictionsToolbar.rating': 'Sensitivity',
        'ContradictionsToolbar.ratingInfo': 'Sensitivity info',
        'ContradictionsToolbar.ratingInfoLabel': 'Sensitivity information',
        'ContradictionsToolbar.searchPlaceholder': 'Search by keyword ...',
        'ContradictionsToolbar.status': 'Status',
      } satisfies Record<string, string>;

      if (key === 'NoticeCards.countOf') {
        return `${options?.count ?? 0} von ${options?.total ?? 0}`;
      }

      if (Object.hasOwn(translations, key)) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('@/features/ui/card/Card', () => ({
  Card: (props: { children: React.ReactNode }) => {
    const { children } = props;

    return <div>{children}</div>;
  },
  CardContent: (props: React.ComponentProps<'div'>) => {
    const { children, className } = props;

    return <div className={className}>{children}</div>;
  },
}));

vi.mock('@/features/ui/info-tooltip/InfoTooltip', () => ({
  InfoTooltip: (props: { ariaLabel: string }) => {
    const { ariaLabel } = props;

    return <span>{ariaLabel}</span>;
  },
}));

vi.mock('@/features/ui/search-input/DebouncedSearchInput', () => ({
  DebouncedSearchInput: (props: { onChange: (value: string) => void }) => {
    const { onChange } = props;

    return (
      <button
        type="button"
        onClick={() => {
          onChange('wasser');
        }}
      >
        Search input
      </button>
    );
  },
}));

vi.mock('@/features/ui/filter-pill-select/FilterPillMultiSelect', () => ({
  FilterPillMultiSelect: (props: {
    label: string;
    onValueChange: (value: string[]) => void;
    value: string[];
  }) => {
    const { label, onValueChange, value } = props;

    return (
      <button
        type="button"
        onClick={() => {
          onValueChange([...value, 'next-value']);
        }}
      >
        {label}
      </button>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderToolbar(
  overrides?: Partial<React.ComponentProps<typeof ContradictionsToolbar>>,
) {
  const onRatingThresholdChange = vi.fn();

  render(
    <ContradictionsToolbar
      filteredCount={3}
      hasUsableRatings={true}
      minimumRating={0.4}
      ratingThreshold={0.7}
      onRatingThresholdChange={onRatingThresholdChange}
      totalCount={5}
      {...overrides}
    />,
  );

  return { onRatingThresholdChange };
}

describe('ContradictionsToolbar', () => {
  it('decreases and increases the threshold with the minus and plus buttons', async () => {
    const user = userEvent.setup();
    const { onRatingThresholdChange } = renderToolbar();

    await user.click(
      screen.getByRole('button', { name: 'Decrease sensitivity' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Increase sensitivity' }),
    );

    expect(onRatingThresholdChange).toHaveBeenNthCalledWith(1, 0.69);
    expect(onRatingThresholdChange).toHaveBeenNthCalledWith(2, 0.71);
  });

  it('supports "-" and "+" keyboard input on the slider', () => {
    const { onRatingThresholdChange } = renderToolbar();
    const slider = screen.getByRole('slider', { name: 'Sensitivity' });

    fireEvent.keyDown(slider, { key: '-' });
    fireEvent.keyDown(slider, { key: '+' });

    expect(onRatingThresholdChange).toHaveBeenNthCalledWith(1, 0.69);
    expect(onRatingThresholdChange).toHaveBeenNthCalledWith(2, 0.71);
  });

  it('disables the decrement button when the minimum threshold is reached', () => {
    renderToolbar({ minimumRating: 0.7, ratingThreshold: 0.7 });

    expect(
      screen.getByRole('button', { name: 'Decrease sensitivity' }),
    ).toHaveProperty('disabled', true);
  });

  it('updates the route-backed search while preserving unrelated params', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Search input' }));

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const navigateArgs = mocks.navigateMock.mock.calls[0]?.[0] as {
      replace: boolean;
      resetScroll: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(navigateArgs.replace).toBe(true);
    expect(navigateArgs.resetScroll).toBe(false);
    expect(
      navigateArgs.search({
        documentFilter: 'doc-a',
        statusFilter: 'OPEN',
      }),
    ).toEqual({
      documentFilter: 'doc-a',
      statusFilter: 'OPEN',
      search: 'wasser',
    });
  });

  it('serializes multi-select filter values while preserving unrelated params', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Status' }));

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const navigateArgs = mocks.navigateMock.mock.calls[0]?.[0] as {
      replace: boolean;
      resetScroll: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(navigateArgs.replace).toBe(true);
    expect(navigateArgs.resetScroll).toBe(false);
    expect(
      navigateArgs.search({
        documentFilter: 'doc-a',
        search: 'keep me',
        statusFilter: 'OPEN',
      }),
    ).toEqual({
      documentFilter: 'doc-a',
      search: 'keep me',
      statusFilter: 'next-value',
    });
  });
});
