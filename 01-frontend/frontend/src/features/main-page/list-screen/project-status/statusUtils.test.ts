import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { getStatusLabel } from './statusUtils';

/**
 * Builds a translation stub that mirrors how i18next resolves the
 * `FavoriteCard.<status>` keys: a known key returns its translation, an unknown
 * key returns the provided `defaultValue`.
 */
const createTranslationStub = (
  translations: Record<string, string>,
): TFunction<'Dashboard'> => {
  const t = (key: string, options?: { defaultValue?: string }) => {
    if (Object.hasOwn(translations, key)) {
      return translations[key];
    }
    return options?.defaultValue ?? key;
  };

  return t as unknown as TFunction<'Dashboard'>;
};

describe('getStatusLabel', () => {
  it('returns the translated label for a known backend status', () => {
    const t = createTranslationStub({ 'FavoriteCard.Offen': 'Open' });

    expect(getStatusLabel('Offen', t)).toBe('Open');
  });

  it('falls back to the raw backend status when no translation exists', () => {
    const t = createTranslationStub({});

    expect(getStatusLabel('Unbekannter Status', t)).toBe('Unbekannter Status');
  });
});
