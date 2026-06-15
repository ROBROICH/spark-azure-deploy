import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from './ActionMenu';

afterEach(() => cleanup());

describe('ActionMenu', () => {
  it('closes an action item even when onSelect prevents the default close', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn((event: Event) => event.preventDefault());

    render(
      <ActionMenu>
        <ActionMenuTrigger>Open menu</ActionMenuTrigger>
        <ActionMenuContent>
          <ActionMenuItem onSelect={onSelect}>Run action</ActionMenuItem>
        </ActionMenuContent>
      </ActionMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Run action' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: 'Run action' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps a checkbox item open when onSelect prevents the default close', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn((event: Event) => event.preventDefault());

    render(
      <ActionMenu>
        <ActionMenuTrigger>Open menu</ActionMenuTrigger>
        <ActionMenuContent>
          <ActionMenuCheckboxItem checked={false} onSelect={onSelect}>
            Keep open
          </ActionMenuCheckboxItem>
        </ActionMenuContent>
      </ActionMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'Keep open' }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Keep open' }),
    ).toBeInTheDocument();
  });
});
