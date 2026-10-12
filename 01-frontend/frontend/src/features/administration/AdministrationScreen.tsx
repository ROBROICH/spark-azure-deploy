import { useTranslation } from 'react-i18next';

import { ProjectTypesSection } from './project-types/ProjectTypesSection';

export function AdministrationScreen() {
  const { t } = useTranslation('Administration');

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 sm:px-8">
      <header>
        <h1 className="text-heading-2xl text-text-primary">{t('title')}</h1>
      </header>
      <ProjectTypesSection />
    </main>
  );
}
