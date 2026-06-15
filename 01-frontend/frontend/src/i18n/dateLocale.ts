import i18n from './config';

type SupportedLanguage = 'de' | 'en';

function getSupportedLanguage(language?: string): SupportedLanguage {
  return language?.startsWith('en') ? 'en' : 'de';
}

export function getDateLocale(language?: string): string {
  return getSupportedLanguage(language ?? i18n.resolvedLanguage) === 'en'
    ? 'en-GB'
    : 'de-DE';
}
