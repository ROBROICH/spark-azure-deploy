import { useTranslation } from 'react-i18next';
import { AccessibilityContentSections } from './content-sections/AccessibilityContentSections';

export const Accessibility = () => {
  const { t } = useTranslation('Accessibility');

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 sm:px-8">
      <h1 className="text-3xl leading-tight font-semibold text-text-primary">
        {t('title')}
      </h1>
      <AccessibilityContentSections />
    </main>
  );
};
