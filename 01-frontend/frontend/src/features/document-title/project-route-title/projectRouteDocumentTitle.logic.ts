export type ProjectRouteDocumentTitleDescriptor = {
  routeId: string;
  titleKey: string;
  type: 'project';
};

export const PROJECT_ROUTE_DOCUMENT_TITLE_DESCRIPTORS = [
  {
    routeId: '/verfahren/$verfahrenId/examination-dev',
    titleKey: 'dev.nodes',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/nachforderungen/',
    titleKey: 'projectFeatures.supplementaryRequests',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/fvp/pp/',
    titleKey: 'projectFeatures.plausibilityCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/pp/',
    titleKey: 'projectFeatures.plausibilityCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/fvp/documents/',
    titleKey: 'projectFeatures.formalCompletenessCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/fvp/',
    titleKey: 'projectFeatures.formalCompletenessCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/fvp',
    titleKey: 'projectFeatures.formalCompletenessCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/mvp/$topicName/',
    titleKey: 'projectFeatures.materialCompletenessCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/mvp/',
    titleKey: 'projectFeatures.materialCompletenessCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/mvp',
    titleKey: 'projectFeatures.materialCompletenessCheck',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/ewms/',
    titleKey: 'projectFeatures.ewms',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/rpb/',
    titleKey: 'projectFeatures.rpb',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/rpb',
    titleKey: 'projectFeatures.rpb',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId/',
    titleKey: 'projectFeatures.projectOverview',
    type: 'project',
  },
  {
    routeId: '/verfahren/$verfahrenId',
    titleKey: 'projectFeatures.projectOverview',
    type: 'project',
  },
] as const satisfies ReadonlyArray<ProjectRouteDocumentTitleDescriptor>;

const PROJECT_OVERVIEW_DESCRIPTOR = {
  routeId: '/verfahren/$verfahrenId',
  titleKey: 'projectFeatures.projectOverview',
  type: 'project',
} as const satisfies ProjectRouteDocumentTitleDescriptor;

const PROJECT_ROUTE_DOCUMENT_TITLE_DESCRIPTORS_BY_ID = new Map<
  string,
  ProjectRouteDocumentTitleDescriptor
>(
  PROJECT_ROUTE_DOCUMENT_TITLE_DESCRIPTORS.map((descriptor) => [
    descriptor.routeId,
    descriptor,
  ]),
);

export function getProjectRouteDocumentTitleDescriptor(
  routeMatches: ReadonlyArray<{ routeId: string }>,
) {
  for (let index = routeMatches.length - 1; index >= 0; index -= 1) {
    const routeMatch = routeMatches[index];
    if (!routeMatch) {
      continue;
    }

    const descriptor = PROJECT_ROUTE_DOCUMENT_TITLE_DESCRIPTORS_BY_ID.get(
      routeMatch.routeId,
    );

    if (descriptor) {
      return descriptor;
    }
  }

  return PROJECT_OVERVIEW_DESCRIPTOR;
}
