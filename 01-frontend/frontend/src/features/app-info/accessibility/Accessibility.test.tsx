import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import deAccessibility from './de-accessibility.json';
import { Accessibility } from './Accessibility';

const getTranslationValue = (key: string) => {
  return key.split('.').reduce<unknown>((value, keyPart) => {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    return (value as Record<string, unknown>)[keyPart];
  }, deAccessibility);
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => getTranslationValue(key) ?? key,
  }),
}));

afterEach(() => {
  cleanup();
  delete window.__APP_CONFIG__;
});

describe('Accessibility', () => {
  it('renders the accessibility statement contacts and public links', () => {
    const applicationUrl = `${window.location.origin}/`;

    render(<Accessibility />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Erklärung zur Barrierefreiheit',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: applicationUrl })).toHaveAttribute(
      'href',
      applicationUrl,
    );
    expect(
      screen.getByRole('link', { name: 'spark@bmds.bund.de' }),
    ).toHaveAttribute('href', 'mailto:spark@bmds.bund.de');
    expect(
      screen.getByRole('link', { name: 'info@schlichtungsstelle-bgg.de' }),
    ).toHaveAttribute('href', 'mailto:info@schlichtungsstelle-bgg.de');

    const arbitrationLink = screen.getByRole('link', {
      name: 'www.schlichtungsstelle-bgg.de',
    });
    expect(arbitrationLink).toHaveAttribute(
      'href',
      'https://www.schlichtungsstelle-bgg.de/',
    );
    expect(arbitrationLink).toHaveAttribute('target', '_blank');
    expect(arbitrationLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
