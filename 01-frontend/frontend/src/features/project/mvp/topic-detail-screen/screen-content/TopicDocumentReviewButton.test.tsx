import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TopicDocumentReviewButton } from './TopicDocumentReviewButton';

// Stub `matchMedia` for `useBelowLg`; tests target the compact code path.
beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

const translations: Record<string, string> = {
  'DocumentItem.sichten': 'Sichten',
  'DocumentItem.sichtenEntfernen': 'Sichtung entfernen',
  'DocumentItem.actionsMenuAriaLabel': 'Aktionen für {{file}}',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const template = translations[key] ?? key;
      if (!options) {
        return template;
      }
      return Object.entries(options).reduce(
        (acc, [name, value]) => acc.replaceAll(`{{${name}}}`, value),
        template,
      );
    },
  }),
}));

describe('TopicDocumentReviewButton', () => {
  afterEach(cleanup);

  it('opens the menu and toggles review on for an unreviewed document', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <TopicDocumentReviewButton
        checked={false}
        fileName="Antrag.pdf"
        onCheckedChange={onCheckedChange}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Aktionen für Antrag.pdf — Sichten',
    });
    expect(trigger).toBeEnabled();
    expect(
      screen.queryByTestId('document-reviewed-indicator'),
    ).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Sichten' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('opens the menu and toggles review off for a reviewed document', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <TopicDocumentReviewButton
        checked
        fileName="Antrag.pdf"
        onCheckedChange={onCheckedChange}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Aktionen für Antrag.pdf — Sichtung entfernen',
    });
    expect(
      screen.getByTestId('document-reviewed-indicator'),
    ).toBeInTheDocument();

    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'Sichtung entfernen' }),
    );

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('does not open a menu when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();

    render(
      <TopicDocumentReviewButton
        checked={false}
        disabled
        fileName="Antrag.pdf"
        onCheckedChange={onCheckedChange}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Aktionen für Antrag.pdf — Sichten',
    });
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('still shows the reviewed check indicator when disabled and reviewed', () => {
    render(
      <TopicDocumentReviewButton
        checked
        disabled
        fileName="Antrag.pdf"
        onCheckedChange={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId('document-reviewed-indicator'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Aktionen für Antrag.pdf — Sichtung entfernen',
      }),
    ).toBeDisabled();
  });
});
