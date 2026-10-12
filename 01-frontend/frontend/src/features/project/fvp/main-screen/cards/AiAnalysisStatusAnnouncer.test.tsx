import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiAnalysisStatusAnnouncer } from './AiAnalysisStatusAnnouncer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const STARTED_KEY = 'redesign.aiAnalysis.announcer.started';
const COMPLETED_KEY = 'redesign.aiAnalysis.announcer.completed';

describe('AiAnalysisStatusAnnouncer', () => {
  afterEach(cleanup);

  it('announces nothing on initial mount', () => {
    render(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={false} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('announces the start when the run transitions to running', () => {
    const { rerender } = render(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={false} />,
    );

    rerender(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={true} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(STARTED_KEY);
  });

  it('announces completion when the run transitions to finished', () => {
    const { rerender } = render(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={true} />,
    );

    rerender(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={false} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(COMPLETED_KEY);
  });

  it('does not re-announce when isRunning is unchanged across rerenders', () => {
    const { rerender } = render(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={false} />,
    );

    rerender(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={true} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(STARTED_KEY);

    // An unrelated rerender with the same running state must keep the prior
    // announcement and not re-fire it.
    rerender(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={true} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(STARTED_KEY);
  });

  it('announces an incomplete run, also when the failure arrives after the run stops', () => {
    const { rerender } = render(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={true} />,
    );

    rerender(
      <AiAnalysisStatusAnnouncer isIncomplete={false} isRunning={false} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(COMPLETED_KEY);

    rerender(
      <AiAnalysisStatusAnnouncer isIncomplete={true} isRunning={false} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'redesign.aiAnalysis.announcer.incomplete',
    );
  });
});
