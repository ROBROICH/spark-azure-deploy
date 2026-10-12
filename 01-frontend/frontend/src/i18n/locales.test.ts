import { describe, expect, it } from 'vitest';
import { resources } from './resources';

type LocaleResource = Record<string, unknown>;
type LocaleNamespace = keyof typeof resources.de;

function getAllKeys(obj: LocaleResource, prefix = ''): string[] {
  const keys: string[] = [];

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as LocaleResource, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

const getLocaleNamespaces = () => {
  const enResources = resources.en as Record<LocaleNamespace, LocaleResource>;

  return Object.entries(resources.de).map(([name, de]) => ({
    name: name as LocaleNamespace,
    de,
    en: enResources[name as LocaleNamespace],
  }));
};

describe('i18n locale registry', () => {
  it('registers the same namespaces for German and English', () => {
    expect(Object.keys(resources.de).sort()).toEqual(
      Object.keys(resources.en).sort(),
    );
  });
});

describe.each(getLocaleNamespaces())(
  'i18n locale files: $name',
  (namespace) => {
    it('has matching keys between de and en', () => {
      const deKeys = getAllKeys(namespace.de);
      const enKeys = getAllKeys(namespace.en);

      const missingInEn = deKeys.filter((key) => !enKeys.includes(key));
      const missingInDe = enKeys.filter((key) => !deKeys.includes(key));

      if (missingInEn.length > 0 || missingInDe.length > 0) {
        let errorMessage = 'Locale files have mismatched keys:\n';

        if (missingInEn.length > 0) {
          errorMessage += `\nMissing in en:\n${missingInEn.map((key) => `  - ${key}`).join('\n')}`;
        }

        if (missingInDe.length > 0) {
          errorMessage += `\nMissing in de:\n${missingInDe.map((key) => `  - ${key}`).join('\n')}`;
        }

        throw new Error(errorMessage);
      }

      expect([...deKeys].sort()).toEqual([...enKeys].sort());
    });

    it('has the same nested structure', () => {
      const deKeys = getAllKeys(namespace.de);
      const enKeys = getAllKeys(namespace.en);

      expect(deKeys.sort()).toEqual(enKeys.sort());
    });
  },
);

describe('Accessibility locale content', () => {
  it('keeps review and creation dates aligned between locales', () => {
    expect(resources.de.Accessibility.conformance.review).toContain(
      'zwischen Juni und September 2026',
    );
    expect(resources.en.Accessibility.conformance.review).toContain(
      'between June and September 2026',
    );

    expect(resources.de.Accessibility.creation.text).toContain('06.10.2026');
    expect(resources.en.Accessibility.creation.text).toContain(
      '6 October 2026',
    );
  });
});
