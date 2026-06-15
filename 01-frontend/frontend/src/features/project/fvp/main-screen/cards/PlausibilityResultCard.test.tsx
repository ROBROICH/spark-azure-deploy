import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlausibilityResultCard } from './PlausibilityResultCard';

const { useSummaryMock } = vi.hoisted(() => ({ useSummaryMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock(
  '@/features/project/fvp/data/plausibility/usePlausibilityContradictionsSummary',
  () => ({ usePlausibilityContradictionsSummary: useSummaryMock }),
);

vi.mock('@/features/ui/info-tooltip/InfoTooltip', () => ({
  InfoTooltip: () => null,
}));

describe('PlausibilityResultCard', () => {
  beforeEach(() => useSummaryMock.mockReset());

  it('renders a retryable error alert instead of empty counts when the read fails', () => {
    useSummaryMock.mockReturnValue({
      summary: { total: 0, open: 0, onRequestList: 0, ignored: 0, resolved: 0 },
      isLoading: false,
      isError: true,
    });

    render(<PlausibilityResultCard projectId="p1" />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'common.errors.collection.retry' }),
    ).toBeTruthy();
    // The misleading "0 contradictions" counters must not render on failure.
    expect(
      screen.queryByText('redesign.plausibilityCard.counters.open'),
    ).toBeNull();
  });

  it('disables the contradictions link when the completed result has zero findings', () => {
    useSummaryMock.mockReturnValue({
      summary: { total: 0, open: 0, onRequestList: 0, ignored: 0, resolved: 0 },
      isLoading: false,
      isError: false,
    });

    render(<PlausibilityResultCard projectId="p1" />);

    const viewButton = screen.getByRole('button', {
      name: 'redesign.plausibilityCard.viewContradictions',
    });

    expect(viewButton).toHaveProperty('disabled', true);
    expect(
      screen.queryByRole('link', {
        name: 'redesign.plausibilityCard.viewContradictions',
      }),
    ).toBeNull();
  });
});
