import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTriggerCard } from './AiTriggerCard';

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...(actual as object),
    CircleCheck: () => <svg data-testid="circle-check-icon" />,
    LoaderCircle: (props: { className?: string }) => (
      <svg className={props.className} data-testid="loader-circle-icon" />
    ),
    Sparkles: () => <svg data-testid="sparkles-icon" />,
  };
});

describe('AiTriggerCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the success icon for collapsed success cards', () => {
    render(
      <AiTriggerCard
        body="Completed body"
        name="success-card"
        status="success"
        title="Completed"
      />,
    );

    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByTestId('circle-check-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sparkles-icon')).not.toBeInTheDocument();
  });

  it('uses a loading spinner in the collapsed progress header', () => {
    render(
      <AiTriggerCard
        body="Progress body"
        initialCollapsed
        name="progress-card"
        progressActionLabel="Running"
        status="progress"
        title="Progress"
      />,
    );

    expect(screen.getByRole('button', { name: 'Progress' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByTestId('loader-circle-icon')).toHaveClass(
      'animate-spin',
    );
    expect(screen.queryByTestId('sparkles-icon')).not.toBeInTheDocument();
  });
});
