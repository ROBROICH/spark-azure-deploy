import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionExpiredDialog } from './SessionExpiredDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'sessionExpiredDialog.title': 'Ihre Anmeldung ist abgelaufen',
        'sessionExpiredDialog.description':
          'Ihre Sitzung ist abgelaufen. Bitte laden Sie die Seite neu und melden Sie sich erneut an.',
        'sessionExpiredDialog.reload': 'Erneut anmelden',
      };

      return translations[key] ?? key;
    },
  }),
}));

const originalLocation = window.location;

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
});

describe('SessionExpiredDialog', () => {
  it('does not render before a session expiry is reported', () => {
    render(<SessionExpiredDialog open={false} />);

    expect(
      screen.queryByRole('heading', { name: 'Ihre Anmeldung ist abgelaufen' }),
    ).toBeNull();
  });

  it('renders the non-dismissible session expiry dialog', async () => {
    render(<SessionExpiredDialog open={true} />);

    const dialog = screen.getByRole('dialog', {
      name: 'Ihre Anmeldung ist abgelaufen',
    });

    expect(dialog).toHaveAccessibleDescription(
      'Ihre Sitzung ist abgelaufen. Bitte laden Sie die Seite neu und melden Sie sich erneut an.',
    );
    expect(
      screen.getByRole('heading', { name: 'Ihre Anmeldung ist abgelaufen' }),
    ).not.toBeNull();
    const reloadButton = screen.getByRole('button', {
      name: 'Erneut anmelden',
    });

    expect(reloadButton).not.toBeNull();
    expect(reloadButton).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(
      screen.getByRole('dialog', {
        name: 'Ihre Anmeldung ist abgelaufen',
      }),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: /schließen/i })).toBeNull();
  });

  it('reloads the page from the session expiry action', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        reload: reloadMock,
      },
    });
    render(<SessionExpiredDialog open={true} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Erneut anmelden' }),
    );

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
