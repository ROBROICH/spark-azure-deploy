import { buildDocumentTitle } from '@/features/document-title/document-title.logic';
import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { Button } from '@/features/ui/button/Button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AdministrationSectionsTabs } from '../AdministrationSectionsTabs';

const administrationDetailRoute = getRouteApi('/administration/$projectTypeId');

function ProjectTypeDetailDocumentTitle(props: { projectTypeName: string }) {
  const { projectTypeName } = props;
  const { t } = useTranslation('DocumentTitle');
  const effectiveMode = getConfiguredProductMode();
  const title = buildDocumentTitle({
    appTitle: t(effectiveMode === 'ewms' ? 'app.titleEwms' : 'app.title'),
    featureTitle: t('pages.administration'),
    detailTitle: projectTypeName,
    titleType: 'page',
  });

  // eslint-disable-next-line no-restricted-syntax -- document.title is a browser-side integration driven by the selected project type and language.
  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

export function ProjectTypeDetailScreen() {
  const { t } = useTranslation('Administration');
  const { projectTypeId } = administrationDetailRoute.useParams();
  const projectType = administrationDetailRoute.useLoaderData();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 sm:px-8">
      <ProjectTypeDetailDocumentTitle projectTypeName={projectType.name} />
      <header className="flex flex-col items-start gap-3">
        <Button asChild size="sm" variant="ghost" withIcon>
          <Link to="/administration">
            <ArrowLeft aria-hidden="true" />
            {t('projectTypes.detail.back')}
          </Link>
        </Button>
        <h1 className="text-heading-2xl text-text-primary">
          {t('projectTypes.detail.heading', { name: projectType.name })}
        </h1>
      </header>
      <AdministrationSectionsTabs projectTypeId={projectTypeId} />
    </main>
  );
}
