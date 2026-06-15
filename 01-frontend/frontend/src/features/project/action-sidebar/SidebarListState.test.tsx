import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SidebarListState } from './SidebarListState';

afterEach(() => cleanup());

const baseProps = {
  loadingAriaLabel: 'loading',
  errorMessage: 'Could not load the list.',
  retryLabel: 'Try again',
};

describe('SidebarListState', () => {
  it('renders the children once the list has resolved', () => {
    render(
      <SidebarListState
        {...baseProps}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      >
        <p>List item</p>
      </SidebarListState>,
    );

    expect(screen.getByText('List item')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a loading status and hides children while loading', () => {
    render(
      <SidebarListState
        {...baseProps}
        isLoading
        isError={false}
        onRetry={vi.fn()}
      >
        <p>List item</p>
      </SidebarListState>,
    );

    expect(screen.getByRole('status', { name: 'loading' })).toBeInTheDocument();
    expect(screen.queryByText('List item')).not.toBeInTheDocument();
  });

  it('surfaces a retryable error instead of an empty list on load failure', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <SidebarListState
        {...baseProps}
        isLoading={false}
        isError
        onRetry={onRetry}
      >
        <p>List item</p>
      </SidebarListState>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the list.',
    );
    expect(screen.queryByText('List item')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
