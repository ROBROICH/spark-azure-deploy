export type DocumentTitleRouteMatch = {
  routeId: string;
};

export type AppRouteDocumentTitleDescriptor = {
  titleKey: string;
  type: 'page';
};

type DocumentTitleRouteDescriptor = AppRouteDocumentTitleDescriptor & {
  routeId: string;
};

const PAGE_ROUTE_DESCRIPTORS = [
  {
    routeId: '/',
    titleKey: 'pages.dashboard',
    type: 'page',
  },
  {
    routeId: '/verfahren/',
    titleKey: 'pages.projectsOverview',
    type: 'page',
  },
  {
    routeId: '/barrierefreiheit/',
    titleKey: 'pages.accessibility',
    type: 'page',
  },
  {
    routeId: '/administration/',
    titleKey: 'pages.administration',
    type: 'page',
  },
  {
    routeId: '/changelog/',
    titleKey: 'pages.changelog',
    type: 'page',
  },
  {
    routeId: '/schwaerzungsagent/',
    titleKey: 'pages.redactionAgent',
    type: 'page',
  },
  {
    routeId: '/design-system/',
    titleKey: 'dev.designSystem',
    type: 'page',
  },
  {
    routeId: '/route-remount',
    titleKey: 'pages.loading',
    type: 'page',
  },
] as const satisfies ReadonlyArray<
  DocumentTitleRouteDescriptor & { type: 'page' }
>;

const NOT_FOUND_DESCRIPTOR = {
  titleKey: 'pages.notFound',
  type: 'page',
} as const satisfies AppRouteDocumentTitleDescriptor;

const PROJECT_ROUTE_ID = '/verfahren/$verfahrenId';
const ADMINISTRATION_DETAIL_ROUTE_ID = '/administration/$projectTypeId';

const ROUTE_TITLE_DESCRIPTORS_BY_ID = new Map<
  string,
  DocumentTitleRouteDescriptor
>(PAGE_ROUTE_DESCRIPTORS.map((descriptor) => [descriptor.routeId, descriptor]));

function isProjectRouteMatch(routeMatch: DocumentTitleRouteMatch) {
  return (
    routeMatch.routeId === PROJECT_ROUTE_ID ||
    routeMatch.routeId.startsWith(`${PROJECT_ROUTE_ID}/`)
  );
}

export function isProjectRouteMounted(
  routeMatches: ReadonlyArray<DocumentTitleRouteMatch>,
) {
  return routeMatches.some(isProjectRouteMatch);
}

function isAdministrationDetailRouteMatch(routeMatch: DocumentTitleRouteMatch) {
  return routeMatch.routeId === ADMINISTRATION_DETAIL_ROUTE_ID;
}

export function isAdministrationDetailRouteMounted(
  routeMatches: ReadonlyArray<DocumentTitleRouteMatch>,
) {
  return routeMatches.some(isAdministrationDetailRouteMatch);
}

export function getAppRouteDocumentTitleDescriptor(
  routeMatches: ReadonlyArray<DocumentTitleRouteMatch>,
): AppRouteDocumentTitleDescriptor {
  for (let index = routeMatches.length - 1; index >= 0; index -= 1) {
    const routeMatch = routeMatches[index];
    if (!routeMatch) {
      continue;
    }

    const descriptor = ROUTE_TITLE_DESCRIPTORS_BY_ID.get(routeMatch.routeId);

    if (descriptor) {
      return {
        titleKey: descriptor.titleKey,
        type: descriptor.type,
      };
    }
  }

  return NOT_FOUND_DESCRIPTOR;
}
