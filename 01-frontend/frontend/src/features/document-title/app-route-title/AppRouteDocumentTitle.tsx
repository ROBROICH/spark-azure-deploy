import { useRouterState } from '@tanstack/react-router';
import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDocumentTitle } from '../document-title.logic';
import {
  getAppRouteDocumentTitleDescriptor,
  isAdministrationDetailRouteMounted,
  isProjectRouteMounted,
  type DocumentTitleRouteMatch,
} from './appRouteDocumentTitle.logic';

type RouterTitleMatch = {
  routeId: string;
};

function selectRouteTitleState(state: {
  matches: ReadonlyArray<RouterTitleMatch>;
}) {
  return {
    routeMatches: state.matches.map((match) => ({
      routeId: match.routeId,
    })),
  };
}

function AppPageDocumentTitle(props: {
  routeMatches: ReadonlyArray<DocumentTitleRouteMatch>;
}) {
  const { routeMatches } = props;
  const descriptor = getAppRouteDocumentTitleDescriptor(routeMatches);
  const { t } = useTranslation('DocumentTitle');
  const effectiveMode = getConfiguredProductMode();
  const title = buildDocumentTitle({
    appTitle: t(effectiveMode === 'ewms' ? 'app.titleEwms' : 'app.title'),
    featureTitle: t(descriptor.titleKey),
    titleType: descriptor.type,
  });

  // eslint-disable-next-line no-restricted-syntax -- document.title is a browser-side integration driven by route, project, and language state.
  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

export function AppRouteDocumentTitle() {
  const routeTitleState = useRouterState({ select: selectRouteTitleState });

  if (
    isProjectRouteMounted(routeTitleState.routeMatches) ||
    isAdministrationDetailRouteMounted(routeTitleState.routeMatches)
  ) {
    return null;
  }

  return <AppPageDocumentTitle routeMatches={routeTitleState.routeMatches} />;
}
