import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiOutdatedTriggerCard } from './AiOutdatedTriggerCard';

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...(actual as object),
    CircleAlert: () => <svg data-testid="circle-alert-icon" />,
    LoaderCircle: (props: { className?: string }) => (
      <svg className={props.className} data-testid="loader-circle-icon" />
    ),
  };
});

describe('AiOutdatedTriggerCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the warning icon in the collapsed header when not loading', () => {
    render(
      <AiOutdatedTriggerCard
        body="Outdated body"
        initialCollapsed
        name="outdated-card"
        title="Outdated"
      />,
    );

    expect(screen.getByRole('button', { name: 'Outdated' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByTestId('circle-alert-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('loader-circle-icon')).not.toBeInTheDocument();
  });

  it('uses a loading spinner in the collapsed header while refreshing', () => {
    render(
      <AiOutdatedTriggerCard
        body="Outdated body"
        initialCollapsed
        name="refreshing-outdated-card"
        refreshAction={{
          isLoading: true,
          label: 'Refresh',
          loadingLabel: 'Refreshing',
          onClick: () => undefined,
        }}
        title="Outdated"
      />,
    );

    expect(screen.getByRole('button', { name: 'Outdated' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByTestId('loader-circle-icon')).toHaveClass(
      'animate-spin',
    );
    expect(screen.queryByTestId('circle-alert-icon')).not.toBeInTheDocument();
  });
});
