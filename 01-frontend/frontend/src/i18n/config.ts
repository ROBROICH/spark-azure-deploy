import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

// Get saved language from localStorage, fallback to German
const getInitialLanguage = (): string => {
  const saved = localStorage.getItem('i18nextLng');
  if (saved === 'de' || saved === 'en') {
    return saved;
  }

  return 'de';
};

function getDocumentLanguage(language?: string): 'de' | 'en' {
  return language?.startsWith('en') ? 'en' : 'de';
}

function syncDocumentLanguage(language?: string) {
  document.documentElement.lang = getDocumentLanguage(language);
}

i18n
  .use(initReactI18next) // Passes i18n instance to react-i18next
  .init({
    resources,
    lng: getInitialLanguage(), // Use saved language from localStorage, or default to German
    fallbackLng: 'de', // German as fallback
    interpolation: {
      escapeValue: false, // not needed for React – React already escapes to prevent xss
    },
    react: {
      useSuspense: false,
    },
    ns: Object.keys(resources.de),
    defaultNS: 'shared',
  });

syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
