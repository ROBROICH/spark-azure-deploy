import { describe, expect, it } from 'vitest';
import { getProjectRouteDocumentTitleDescriptor } from './projectRouteDocumentTitle.logic';

const routeMatches = (routeIds: ReadonlyArray<string>) =>
  routeIds.map((routeId) => ({ routeId }));

describe('getProjectRouteDocumentTitleDescriptor', () => {
  it.each([
    {
      expectedTitleKey: 'projectFeatures.projectOverview',
      name: 'project overview',
      routeIds: ['/verfahren/$verfahrenId', '/verfahren/$verfahrenId/'],
    },
    {
      expectedTitleKey: 'projectFeatures.formalCompletenessCheck',
      name: 'formal completeness check',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/fvp',
        '/verfahren/$verfahrenId/fvp/documents/',
      ],
    },
    {
      expectedTitleKey: 'projectFeatures.plausibilityCheck',
      name: 'plausibility check',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/fvp',
        '/verfahren/$verfahrenId/fvp/pp/',
      ],
    },
    {
      expectedTitleKey: 'projectFeatures.plausibilityCheck',
      name: 'legacy plausibility check route',
      routeIds: ['/verfahren/$verfahrenId', '/verfahren/$verfahrenId/pp/'],
    },
    {
      expectedTitleKey: 'projectFeatures.materialCompletenessCheck',
      name: 'material completeness check overview',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/mvp',
        '/verfahren/$verfahrenId/mvp/',
      ],
    },
    {
      expectedTitleKey: 'projectFeatures.materialCompletenessCheck',
      name: 'material completeness check topic detail',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/mvp',
        '/verfahren/$verfahrenId/mvp/$topicName/',
      ],
    },
    {
      expectedTitleKey: 'projectFeatures.ewms',
      name: 'public participation',
      routeIds: ['/verfahren/$verfahrenId', '/verfahren/$verfahrenId/ewms/'],
    },
    {
      expectedTitleKey: 'projectFeatures.rpb',
      name: 'legal review',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/rpb',
        '/verfahren/$verfahrenId/rpb/',
      ],
    },
    {
      expectedTitleKey: 'projectFeatures.supplementaryRequests',
      name: 'supplementary request letter',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/nachforderungen/',
      ],
    },
    {
      expectedTitleKey: 'dev.nodes',
      name: 'nodes dev tools',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/examination-dev',
      ],
    },
  ])(
    'returns the project descriptor for $name',
    ({ expectedTitleKey, routeIds }) => {
      expect(
        getProjectRouteDocumentTitleDescriptor(routeMatches(routeIds)),
      ).toEqual(
        expect.objectContaining({
          titleKey: expectedTitleKey,
          type: 'project',
        }),
      );
    },
  );

  it('falls back to the project overview descriptor', () => {
    expect(
      getProjectRouteDocumentTitleDescriptor(routeMatches(['__root__'])),
    ).toEqual(
      expect.objectContaining({
        titleKey: 'projectFeatures.projectOverview',
        type: 'project',
      }),
    );
  });
});
