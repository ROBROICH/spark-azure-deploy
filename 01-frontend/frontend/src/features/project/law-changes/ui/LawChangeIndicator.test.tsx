import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LawChangeRecord } from '../data/lawChanges.types';
import { AggregatedLawChangeIndicatorView } from './AggregatedLawChangeIndicator';
import { LawChangeIndicatorView } from './LawChangeIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      resolvedLanguage: 'de',
    },
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'rechtsaenderung.statusAria': 'Rechtsänderung vorhanden',
        'rechtsaenderung.dialogTriggerAria': 'Rechtsänderung anzeigen',
        'rechtsaenderung.loadErrorAria':
          'Rechtsänderungen konnten nicht geladen werden',
        'rechtsaenderung.loadErrorTooltip':
          'Rechtsänderungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.',
        'rechtsaenderung.popoverIntroSingular':
          'Es liegt eine Rechtsänderung vor.',
        'rechtsaenderung.popoverIntroPlural': 'Es liegen Rechtsänderungen vor.',
        'rechtsaenderung.popoverAffectedNormSingular': 'Betroffene Norm:',
        'rechtsaenderung.popoverBetroffeneNormen': 'Betroffene Normen:',
      };

      if (key === 'rechtsaenderung.aggregatedNormBullet') {
        return `${String(params?.normLabel ?? '')} (${String(params?.validFrom ?? '')})`;
      }

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

describe('LawChangeIndicatorView', () => {
  it('renders matching law changes as an action button', () => {
    render(
      <LawChangeIndicatorView
        jurabk="BNatSchG"
        paragraphNr="45"
        lawChanges={[lawChange]}
        onOpen={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Rechtsänderung anzeigen' }),
    ).toBeInTheDocument();
  });

  it('stays quiet without loaded matches and surfaces collection errors', () => {
    const emptyView = render(
      <LawChangeIndicatorView
        jurabk="BNatSchG"
        paragraphNr="45"
        lawChanges={[]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    emptyView.unmount();

    render(
      <LawChangeIndicatorView
        jurabk="BNatSchG"
        paragraphNr="45"
        isErrorLawChanges
        lawChanges={[]}
        onOpen={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Rechtsänderungen konnten nicht geladen werden',
      }),
    ).toBeInTheDocument();
  });

  it('hides silently when the law-changes backend is unavailable', () => {
    render(
      <LawChangeIndicatorView
        jurabk="BNatSchG"
        paragraphNr="45"
        isErrorLawChanges
        isServiceUnavailable
        lawChanges={[]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('AggregatedLawChangeIndicatorView', () => {
  it('renders aggregated matches as a keyboard-reachable status chip', () => {
    render(
      <AggregatedLawChangeIndicatorView
        norms={[{ jurabk: 'BNatSchG', paragraphNr: '45' }]}
        lawChanges={[lawChange]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Rechtsänderung vorhanden' }),
    ).toBeInTheDocument();
  });

  it('hides silently when the law-changes backend is unavailable', () => {
    render(
      <AggregatedLawChangeIndicatorView
        norms={[{ jurabk: 'BNatSchG', paragraphNr: '45' }]}
        isErrorLawChanges
        isServiceUnavailable
        lawChanges={[]}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
