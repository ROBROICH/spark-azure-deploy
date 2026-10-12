import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdministrationDeleteButton } from './AdministrationDeleteButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
});

describe('AdministrationDeleteButton', () => {
  it('requires two consecutive clicks and resets after losing focus', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <>
        <AdministrationDeleteButton
          aria-label="Remove topic"
          onConfirm={onConfirm}
        >
          Remove
        </AdministrationDeleteButton>
        <button type="button">Other action</button>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove topic' }));

    const confirmButton = screen.getByRole('button', {
      name: 'actions.confirmDelete',
    });
    expect(confirmButton).toHaveClass('bg-error-800');
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Other action' }));
    expect(
      screen.getByRole('button', { name: 'Remove topic' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove topic' }));
    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
