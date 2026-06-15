import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LawChangeRecord } from '../data/lawChanges.types';
import { LawChangeDialog } from './LawChangeDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: 'de',
    },
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'rechtsaenderung.gueltigAb') {
        return `Gültig ab: ${String(params?.date ?? '')}`;
      }

      if (key === 'rechtsaenderung.position') {
        return `${String(params?.current ?? '')} / ${String(params?.total ?? '')}`;
      }

      const translations: Record<string, string> = {
        'rechtsaenderung.title': 'Rechtsänderung',
        'rechtsaenderung.bisherigNormtext': 'Bisheriger Normtext',
        'rechtsaenderung.aenderung': 'Änderung',
        'rechtsaenderung.transitionNotesTitle': 'Übergangshinweise',
        'rechtsaenderung.previous': 'Vorherige Rechtsänderung anzeigen',
        'rechtsaenderung.next': 'Nächste Rechtsänderung anzeigen',
      };

      return translations[key] ?? key;
    },
  }),
}));

afterEach(cleanup);

const LAW_CHANGE_WITH_TRANSITION_NOTES: LawChangeRecord = {
  id: 'law-change-1',
  jurabk: 'BNatSchG',
  paragraphNr: '45',
  currentText: 'Bisheriger Normtext',
  changeText: 'Neuer Normtext',
  newText: 'Neuer Normtext',
  transitionalNote: 'Hinweis zum Übergangsrecht',
  validFrom: '2026-05-23',
};

describe('LawChangeDialog', () => {
  it('keeps transition notes collapsed by default and expands them on demand', async () => {
    const user = userEvent.setup();

    render(
      <LawChangeDialog
        activeLawChange={LAW_CHANGE_WITH_TRANSITION_NOTES}
        canGoNext={false}
        canGoPrevious={false}
        currentIndex={0}
        normLabel="§ 45 BNatSchG"
        onGoNext={vi.fn()}
        onGoPrevious={vi.fn()}
        open
        onOpenChange={vi.fn()}
        totalCount={1}
      />,
    );

    const transitionNotesTrigger = screen.getByRole('button', {
      name: 'Übergangshinweise',
    });

    expect(screen.getByText('1 / 1')).not.toBeNull();
    expect(screen.getByText(/Gültig ab:/)).not.toBeNull();
    expect(transitionNotesTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Hinweis zum Übergangsrecht')).toBeNull();

    await user.click(transitionNotesTrigger);

    expect(transitionNotesTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Hinweis zum Übergangsrecht')).not.toBeNull();
  });

  it('shows navigation controls and calls the corresponding handlers', async () => {
    const user = userEvent.setup();
    const handleGoPrevious = vi.fn();
    const handleGoNext = vi.fn();

    render(
      <LawChangeDialog
        activeLawChange={LAW_CHANGE_WITH_TRANSITION_NOTES}
        canGoNext
        canGoPrevious
        currentIndex={1}
        normLabel="§ 45 BNatSchG"
        onGoNext={handleGoNext}
        onGoPrevious={handleGoPrevious}
        open
        onOpenChange={vi.fn()}
        totalCount={3}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Vorherige Rechtsänderung anzeigen',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Nächste Rechtsänderung anzeigen',
      }),
    );

    expect(screen.getByText('2 / 3')).not.toBeNull();
    expect(handleGoPrevious).toHaveBeenCalledTimes(1);
    expect(handleGoNext).toHaveBeenCalledTimes(1);
  });
});
