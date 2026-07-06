import { useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDocumentTitle } from '../document-title.logic';
import { getProjectRouteDocumentTitleDescriptor } from './projectRouteDocumentTitle.logic';

type ProjectRouteDocumentTitleProps = {
  projectName: string;
};

function selectProjectRouteMatches(state: {
  matches: ReadonlyArray<{ routeId: string }>;
}) {
  return state.matches.map((match) => ({
    routeId: match.routeId,
  }));
}

export function ProjectRouteDocumentTitle(
  props: ProjectRouteDocumentTitleProps,
) {
  const { projectName } = props;
  const routeMatches = useRouterState({ select: selectProjectRouteMatches });
  const descriptor = getProjectRouteDocumentTitleDescriptor(routeMatches);
  const { t } = useTranslation('DocumentTitle');
  const title = buildDocumentTitle({
    appTitle: t('app.title'),
    featureTitle: t(descriptor.titleKey),
    projectTitle: projectName,
    titleType: 'project',
  });

  // eslint-disable-next-line no-restricted-syntax -- document.title is a browser-side integration driven by project route loader data and active route state.
  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}
