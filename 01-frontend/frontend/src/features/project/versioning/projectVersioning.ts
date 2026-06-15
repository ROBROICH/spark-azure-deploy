import { getRegisteredRouter } from '@/integrations/router/registeredRouter';
import { getRouteApi } from '@tanstack/react-router';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

/**
 * Resolves the authoritative latest version for a project at the version
 * boundary.
 *
 * This enforces the invariant that a project version is always a finite,
 * non-negative integer. Failing closed here prevents a malformed snapshot from
 * propagating into freshness checks, route loaders, or version-conflict
 * comparisons where a bogus value could silently mask or fabricate a conflict.
 */
export const getProjectLatestVersion = (project: {
  latestVersion: number;
}): number => {
  const { latestVersion } = project;

  if (!Number.isInteger(latestVersion) || latestVersion < 0) {
    throw new Error(
      `Invalid project version: expected a non-negative integer, received ${String(
        latestVersion,
      )}.`,
    );
  }

  return latestVersion;
};

export const useProjectRouteVersion = () => {
  return projectRoute.useLoaderData({
    select: (loaderData) => loaderData.projectVersion,
  });
};

/**
 * Returns the project ids that are part of the currently mounted route.
 *
 * Used to validate security-sensitive version-conflict events against the
 * project the user is actually viewing, so foreign or stale projectIds cannot
 * trigger a blocking dialog or route remount for the active route.
 */
export const getMountedProjectIds = (): ReadonlySet<string> => {
  const mountedProjectIds = new Set<string>();

  // Read the router via the registry so this module does not statically import
  // the router (and the route tree it pulls in). Before the router is registered
  // there is no mounted project, so an empty set fails closed.
  const router = getRegisteredRouter();
  if (!router) {
    return mountedProjectIds;
  }

  for (const match of router.state.matches) {
    const verfahrenId = (match.params as { verfahrenId?: unknown }).verfahrenId;
    if (typeof verfahrenId === 'string' && verfahrenId.length > 0) {
      mountedProjectIds.add(verfahrenId);
    }
  }

  return mountedProjectIds;
};
