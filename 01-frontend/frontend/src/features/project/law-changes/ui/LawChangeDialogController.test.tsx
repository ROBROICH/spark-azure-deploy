import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LawChangeRecord } from '../data/lawChanges.types';
import { LawChangeDialogController } from './LawChangeDialogController';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  liveQueryResult: {
    data: [] as unknown[],
    isError: false,
    isLoading: false,
  },
}));

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => mocks.liveQueryResult,
}));

vi.mock('../data/collections/lawChanges.collection', () => ({
  lawChangesCollection: {},
  retryLawChangesRead: () => {
    void mocks.invalidateQueries({ queryKey: ['law-changes'] });
  },
}));

vi.mock('@/features/ui/dialog/Dialog', () => ({
  Dialog: (props: { children: ReactNode; open?: boolean }) =>
    props.open ? <div>{props.children}</div> : null,
  DialogBody: (props: ComponentProps<'div'>) => <div {...props} />,
  DialogContent: (props: ComponentProps<'div'>) => (
    <div role="dialog" {...props} />
  ),
  DialogDescription: (props: ComponentProps<'p'>) => <p {...props} />,
  DialogHeader: (props: ComponentProps<'div'>) => <div {...props} />,
  DialogTitle: (props: ComponentProps<'h2'>) => {
    const { children, ...rest } = props;

    return <h2 {...rest}>{children}</h2>;
  },
}));

type MockLawChangeDialogProps = {
  activeLawChange: LawChangeRecord;
  canGoNext: boolean;
  canGoPrevious: boolean;
  currentIndex: number;
  onGoNext: () => void;
  onGoPrevious: () => void;
  totalCount: number;
};

vi.mock('./LawChangeDialog', () => ({
  LawChangeDialog: (props: MockLawChangeDialogProps) => {
    const {
      activeLawChange,
      canGoNext,
      canGoPrevious,
      currentIndex,
      onGoNext,
      onGoPrevious,
      totalCount,
    } = props;

    return (
      <div role="dialog">
        <p>Resolved {activeLawChange.id}</p>
        <p>
          Position {currentIndex + 1} / {totalCount}
        </p>
        <button type="button" disabled={!canGoPrevious} onClick={onGoPrevious}>
          Previous
        </button>
        <button type="button" disabled={!canGoNext} onClick={onGoNext}>
          Next
        </button>
      </div>
    );
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'rechtsaenderung.title': 'Rechtsänderung',
        'rechtsaenderung.dialog.error':
          'Rechtsänderungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.',
        'rechtsaenderung.dialog.notFound':
          'Die ausgewählte Rechtsänderung konnte nicht gefunden werden.',
        'rechtsaenderung.dialog.retry': 'Erneut versuchen',
      };

      return translations[key] ?? key;
    },
  }),
}));

afterEach(cleanup);

const lawChange = {
  id: 'law-change-1',
  jurabk: 'BNatSchG',
  paragraphNr: '45',
  currentText: 'Bisheriger Normtext',
  changeText: 'Neuer Normtext',
  newText: 'Neuer Normtext',
  transitionalNote: '',
  validFrom: '2026-05-23',
} satisfies LawChangeRecord;

const setLiveQueryResult = (result: {
  data: LawChangeRecord[];
  isError: boolean;
  isLoading: boolean;
}) => {
  mocks.liveQueryResult = result;
};

describe('LawChangeDialogController', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset();
    setLiveQueryResult({ data: [], isError: false, isLoading: false });
  });

  it('keeps a deep-linked dialog quiet while law changes are loading', () => {
    setLiveQueryResult({ data: [], isError: false, isLoading: true });

    render(
      <LawChangeDialogController
        lawChangeId="law-change-1"
        onOpenChange={vi.fn()}
        onSelectLawChangeId={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('surfaces collection failures with a retry action', async () => {
    const user = userEvent.setup();
    setLiveQueryResult({ data: [], isError: true, isLoading: false });

    render(
      <LawChangeDialogController
        lawChangeId="law-change-1"
        onOpenChange={vi.fn()}
        onSelectLawChangeId={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Rechtsänderungen konnten nicht geladen werden.',
    );

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['law-changes'],
    });
  });

  it('distinguishes an unknown law-change id from a failed request', () => {
    setLiveQueryResult({ data: [lawChange], isError: false, isLoading: false });

    render(
      <LawChangeDialogController
        lawChangeId="missing-law-change"
        onOpenChange={vi.fn()}
        onSelectLawChangeId={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Die ausgewählte Rechtsänderung konnte nicht gefunden werden.',
    );
  });

  it('renders the law-change dialog once the selected record is available', () => {
    setLiveQueryResult({ data: [lawChange], isError: false, isLoading: false });

    render(
      <LawChangeDialogController
        lawChangeId="law-change-1"
        onOpenChange={vi.fn()}
        onSelectLawChangeId={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Resolved law-change-1',
    );
  });

  it('passes sorted same-norm navigation state and emits neighboring law-change ids', async () => {
    const user = userEvent.setup();
    const onSelectLawChangeId = vi.fn();
    const earlierLawChange = {
      ...lawChange,
      id: 'law-change-earlier',
      validFrom: '2026-01-01',
    } satisfies LawChangeRecord;
    const selectedLawChange = {
      ...lawChange,
      id: 'law-change-selected',
      validFrom: '2026-05-23',
    } satisfies LawChangeRecord;
    const laterLawChange = {
      ...lawChange,
      id: 'law-change-later',
      validFrom: '2026-12-31',
    } satisfies LawChangeRecord;
    const unrelatedLawChange = {
      ...lawChange,
      id: 'law-change-unrelated',
      paragraphNr: '46',
      validFrom: '2026-04-01',
    } satisfies LawChangeRecord;
    setLiveQueryResult({
      data: [
        laterLawChange,
        unrelatedLawChange,
        selectedLawChange,
        earlierLawChange,
      ],
      isError: false,
      isLoading: false,
    });

    render(
      <LawChangeDialogController
        lawChangeId="law-change-selected"
        onOpenChange={vi.fn()}
        onSelectLawChangeId={onSelectLawChangeId}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Position 2 / 3');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSelectLawChangeId).toHaveBeenNthCalledWith(
      1,
      'law-change-earlier',
    );
    expect(onSelectLawChangeId).toHaveBeenNthCalledWith(2, 'law-change-later');
  });
});
