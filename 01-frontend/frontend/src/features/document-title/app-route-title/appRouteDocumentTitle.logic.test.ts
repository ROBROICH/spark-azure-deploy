import { describe, expect, it } from 'vitest';
import {
  getAppRouteDocumentTitleDescriptor,
  isAdministrationDetailRouteMounted,
  isProjectRouteMounted,
} from './appRouteDocumentTitle.logic';

const routeMatches = (routeIds: ReadonlyArray<string>) =>
  routeIds.map((routeId) => ({ routeId }));

describe('getAppRouteDocumentTitleDescriptor', () => {
  it.each([
    {
      expectedDescriptor: {
        titleKey: 'pages.dashboard',
        type: 'page',
      },
      name: 'dashboard',
      routeIds: ['/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.projectsOverview',
        type: 'page',
      },
      name: 'projects overview',
      routeIds: ['/verfahren/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.accessibility',
        type: 'page',
      },
      name: 'accessibility statement',
      routeIds: ['/barrierefreiheit/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.administration',
        type: 'page',
      },
      name: 'administration',
      routeIds: ['/administration/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.changelog',
        type: 'page',
      },
      name: 'changelog',
      routeIds: ['/changelog/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.redactionAgent',
        type: 'page',
      },
      name: 'redaction agent',
      routeIds: ['/schwaerzungsagent/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'dev.designSystem',
        type: 'page',
      },
      name: 'design system',
      routeIds: ['/design-system/'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.loading',
        type: 'page',
      },
      name: 'route remount',
      routeIds: ['/route-remount'],
    },
    {
      expectedDescriptor: {
        titleKey: 'pages.notFound',
        type: 'page',
      },
      name: 'unknown route',
      routeIds: ['__root__'],
    },
  ])(
    'returns the page descriptor for $name',
    ({ expectedDescriptor, routeIds }) => {
      expect(
        getAppRouteDocumentTitleDescriptor(routeMatches(routeIds)),
      ).toEqual(expectedDescriptor);
      expect(isProjectRouteMounted(routeMatches(routeIds))).toBe(false);
      expect(isAdministrationDetailRouteMounted(routeMatches(routeIds))).toBe(
        false,
      );
    },
  );

  it('detects that the administration detail route is mounted', () => {
    const matches = routeMatches(['/administration/$projectTypeId']);

    expect(isAdministrationDetailRouteMounted(matches)).toBe(true);
    expect(isProjectRouteMounted(matches)).toBe(false);
  });

  it.each([
    {
      name: 'project overview',
      routeIds: ['/verfahren/$verfahrenId', '/verfahren/$verfahrenId/'],
    },
    {
      name: 'formal completeness check',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/fvp',
        '/verfahren/$verfahrenId/fvp/documents/',
      ],
    },
    {
      name: 'plausibility check',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/fvp',
        '/verfahren/$verfahrenId/fvp/pp/',
      ],
    },
    {
      name: 'legacy plausibility check route',
      routeIds: ['/verfahren/$verfahrenId', '/verfahren/$verfahrenId/pp/'],
    },
    {
      name: 'material completeness check overview',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/mvp',
        '/verfahren/$verfahrenId/mvp/',
      ],
    },
    {
      name: 'material completeness check topic detail',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/mvp',
        '/verfahren/$verfahrenId/mvp/$topicName/',
      ],
    },
    {
      name: 'public participation',
      routeIds: ['/verfahren/$verfahrenId', '/verfahren/$verfahrenId/ewms/'],
    },
    {
      name: 'legal review',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/rpb',
        '/verfahren/$verfahrenId/rpb/',
      ],
    },
    {
      name: 'supplementary request letter',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/nachforderungen/',
      ],
    },
    {
      name: 'nodes dev tools',
      routeIds: [
        '/verfahren/$verfahrenId',
        '/verfahren/$verfahrenId/examination-dev',
      ],
    },
  ])('detects that project route $name is mounted', ({ routeIds }) => {
    expect(isProjectRouteMounted(routeMatches(routeIds))).toBe(true);
  });
});
