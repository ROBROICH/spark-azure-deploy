import { afterEach, describe, expect, it, vi } from 'vitest';

async function importFreshI18nConfig() {
  vi.resetModules();
  return import('./config');
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'de';
});

describe('i18n document language sync', () => {
  it('sets the document language from the persisted initial language', async () => {
    localStorage.setItem('i18nextLng', 'en');

    await importFreshI18nConfig();

    expect(document.documentElement.lang).toBe('en');
  });

  it('updates the document language when the active language changes', async () => {
    const { default: i18n } = await importFreshI18nConfig();

    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');

    await i18n.changeLanguage('de');
    expect(document.documentElement.lang).toBe('de');
  });
});
