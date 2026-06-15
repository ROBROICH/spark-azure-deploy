import { useTranslation } from 'react-i18next';
import { NotFoundPage } from './NotFoundPage';

export function NotFound() {
  const { t } = useTranslation('shared');

  return (
    <NotFoundPage
      dashboardLabel={t('notFound.dashboard')}
      description={t('notFound.description')}
    />
  );
}
