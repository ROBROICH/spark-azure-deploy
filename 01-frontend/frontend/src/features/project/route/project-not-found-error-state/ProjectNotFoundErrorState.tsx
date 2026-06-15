import { NotFoundPage } from '@/features/shared/error-states/NotFoundPage';
import { useTranslation } from 'react-i18next';

export function ProjectNotFoundErrorState() {
  const { t } = useTranslation('Project');

  return (
    <NotFoundPage
      dashboardLabel={t('ProjectRouteError.dashboardCta')}
      description={t('ProjectRouteError.notFound')}
    />
  );
}
