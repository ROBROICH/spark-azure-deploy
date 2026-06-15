import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/features/ui/sidebar/Sidebar';
import { LanguageSwitcher } from './LanguageSwitcher';

const mocks = vi.hoisted(() => ({
  changeLanguage: vi.fn(),
  i18n: {
    language: 'de',
    changeLanguage: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: mocks.i18n,
    t: (key: string, values?: { language?: string }) => {
      if (key === 'languageSwitcher.currentLanguage') {
        return `Current language: ${values?.language}`;
      }
      if (key === 'languageSwitcher.selectedLanguage') {
        return `${values?.language}, currently selected`;
      }
      return key;
    },
  }),
}));

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  mocks.i18n.language = 'de';
  mocks.i18n.changeLanguage.mockReset();
});

describe('LanguageSwitcher', () => {
  it('changes the language through the action menu', async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider defaultOpen={false}>
        <div data-slot="sidebar" data-side="left">
          <LanguageSwitcher showLabel />
        </div>
      </SidebarProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Current language: Deutsch' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'English' }));

    expect(mocks.i18n.changeLanguage).toHaveBeenCalledWith('en');
  });
});
