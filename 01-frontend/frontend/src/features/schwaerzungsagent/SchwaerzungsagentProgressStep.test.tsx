import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchwaerzungsagentSession } from './schwaerzungsagentSession';
import { SchwaerzungsagentProgressStep } from './SchwaerzungsagentProgressStep';

const mocks = vi.hoisted(() => ({
  loadPercentage: undefined as number | undefined,
}));

vi.mock('@/features/workflow-runtime/system-load/useSystemLoad', () => ({
  useSystemLoad: () => ({
    data:
      mocks.loadPercentage === undefined
        ? undefined
        : { load_percentage: mocks.loadPercentage },
    isError: false,
    isFetching: false,
    isLoading: false,
    isSystemLoadHigh: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'de',
      resolvedLanguage: 'de-DE',
    },
    t: (key: string, params?: Record<string, string | number>) => {
      const values: Record<string, string> = {
        'processing.heading': 'Schwärzung läuft ...',
        'processing.description': '{{filename}} wird verarbeitet.',
        'processing.progressLabel': 'Schwärzungsfortschritt',
        'processing.remainingTime': 'Verbleibende Zeit: ca. {{count}} Min.',
        'processing.almostDone': 'Die Schwärzung dauert länger als erwartet.',
        'processing.highLoadLabel': 'Systemauslastung {{load}}',
        'processing.highLoadTooltip':
          'Bei hoher Systemauslastung kann die Verarbeitung länger dauern, weil mehrere KI-Workflows parallel laufen.',
        'processing.highLoadTooltipAriaLabel': 'Hinweis zur Systemauslastung',
        'processing.error': 'Die Schwärzung konnte nicht abgeschlossen werden.',
        'processing.cancel': 'Abbrechen',
      };

      return (values[key] ?? key)
        .replace('{{filename}}', String(params?.filename ?? ''))
        .replace('{{count}}', String(params?.count ?? ''))
        .replace('{{load}}', String(params?.load ?? ''));
    },
  }),
}));

const session = {
  version: 1,
  requestId: 'request-1',
  originalFilename: 'input.pdf',
  redactedFilename: 'input_geschwärzt.pdf',
  fileSize: 3,
  startedAt: 1_000,
  estimatedDurationMs: 300_000,
} satisfies SchwaerzungsagentSession;

function renderProgress() {
  render(
    <SchwaerzungsagentProgressStep
      error={null}
      onCancel={vi.fn()}
      session={session}
    />,
  );
}

describe('SchwaerzungsagentProgressStep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    mocks.loadPercentage = undefined;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the system load info next to the remaining-time line above 80 percent load', () => {
    mocks.loadPercentage = 81.5;

    renderProgress();

    expect(
      screen.getByText('Verbleibende Zeit: ca. 5 Min.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Systemauslastung 81,5%')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hinweis zur Systemauslastung' }),
    ).toBeInTheDocument();
  });

  it('shows the system load info next to the longer-than-expected line above 80 percent load', () => {
    mocks.loadPercentage = 81;
    vi.setSystemTime(271_000);

    renderProgress();

    expect(
      screen.getByText('Die Schwärzung dauert länger als erwartet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Systemauslastung 81%')).toBeInTheDocument();
  });

  it('does not show the high-load caveat when load is unavailable', () => {
    renderProgress();

    expect(
      screen.getByText('Verbleibende Zeit: ca. 5 Min.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Systemauslastung/)).not.toBeInTheDocument();
  });

  it('does not show the high-load caveat at the threshold', () => {
    mocks.loadPercentage = 80;

    renderProgress();

    expect(
      screen.getByText('Verbleibende Zeit: ca. 5 Min.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Systemauslastung/)).not.toBeInTheDocument();
  });
});
