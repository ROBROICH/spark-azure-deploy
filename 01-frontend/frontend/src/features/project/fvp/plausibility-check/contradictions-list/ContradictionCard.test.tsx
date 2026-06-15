import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContradictionListItem } from '../data/read-model/useContradictions';
import { ContradictionCard } from './ContradictionCard';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  expandedContradictionId: undefined as string | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: (options?: {
      select?: (searchState: { expandedContradictionId?: string }) => unknown;
    }) => {
      const searchState = {
        expandedContradictionId: mocks.expandedContradictionId,
      };

      return options?.select ? options.select(searchState) : searchState;
    },
  }),
  useNavigate: () => mocks.navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { index?: string }) => {
      if (key === 'redesign.referenceId') {
        return `WA-${options?.index}`;
      }

      if (key === 'redesign.status.open') {
        return 'Offen';
      }

      if (key === 'redesign.status.requested') {
        return 'Nachgefordert';
      }

      if (key === 'redesign.rowTitle') {
        return 'Widersprüchliche Angabe';
      }

      return key;
    },
  }),
}));

vi.mock('../contradiction-card-expanded/ContradictionCardExpanded', () => ({
  ContradictionCardExpanded: () => <div>Expanded details</div>,
}));

const makeContradiction = (): ContradictionListItem => ({
  id: 'contradiction-1',
  title: 'Widerspruchstitel',
  description: 'Die Plausibilitaets-Erklaerung beschreibt den Widerspruch.',
  status: 'OPEN',
  occurrences: [
    {
      documentId: 'document-1',
      documentName: 'Unterlage.pdf',
      contentExcerpt: 'Textstelle',
      pageNumber: 1,
    },
  ],
  isOnRequestList: false,
});

afterEach(() => {
  cleanup();
  mocks.navigateMock.mockReset();
  mocks.expandedContradictionId = undefined;
});

describe('ContradictionCard', () => {
  it('shows the title and explanation in the collapsed row', () => {
    render(<ContradictionCard contradiction={makeContradiction()} index={0} />);

    expect(screen.getByText('Widerspruchstitel')).toBeTruthy();
    expect(
      screen.getByText(
        'Die Plausibilitaets-Erklaerung beschreibt den Widerspruch.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('WA-0001')).toBeTruthy();
  });

  it('includes the visible status in the row trigger accessible name', () => {
    render(<ContradictionCard contradiction={makeContradiction()} index={0} />);

    expect(
      screen.getByRole('button', {
        name: /Widerspruchstitel WA-0001, Offen:/,
      }),
    ).toBeTruthy();
  });

  it('includes the request-list state in the row trigger accessible name', () => {
    render(
      <ContradictionCard
        contradiction={{
          ...makeContradiction(),
          isOnRequestList: true,
        }}
        index={0}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: /Widerspruchstitel WA-0001, Nachgefordert:/,
      }),
    ).toBeTruthy();
  });

  it('opens the row through route search while preserving unrelated params', () => {
    render(<ContradictionCard contradiction={makeContradiction()} index={0} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /Widerspruchstitel WA-0001, Offen:/,
      }),
    );

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
        search: 'keep me',
        leftOccurrenceIndex: 3,
        rightOccurrenceIndex: 4,
      }),
    ).toEqual({
      search: 'keep me',
      expandedContradictionId: 'contradiction-1',
      leftOccurrenceIndex: undefined,
      rightOccurrenceIndex: undefined,
    });
  });

  it('closes the row through route search when already expanded', () => {
    mocks.expandedContradictionId = 'contradiction-1';

    render(<ContradictionCard contradiction={makeContradiction()} index={0} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /Widerspruchstitel WA-0001, Offen:/,
      }),
    );

    const navigateArgs = mocks.navigateMock.mock.calls[0]?.[0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(
      navigateArgs.search({
        expandedContradictionId: 'contradiction-1',
        search: 'keep me',
      }),
    ).toEqual({
      expandedContradictionId: undefined,
      search: 'keep me',
      leftOccurrenceIndex: undefined,
      rightOccurrenceIndex: undefined,
    });
  });
});
