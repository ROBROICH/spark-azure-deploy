import type { QueryClient } from '@tanstack/react-query';
import type { AnyRouter } from '@tanstack/react-router';

const ROUTE_REMOUNT_PATH = '/route-remount';

type RouteRemountDependencies = {
  queryClient: QueryClient;
  refetchProjectNodeTreeAndPayloads: (
    projectId: string,
    projectVersion: number,
  ) => Promise<unknown>;
  router: AnyRouter;
};

let dependencies: RouteRemountDependencies | undefined;

export function configureExperimentalRouteRemount(
  nextDependencies: RouteRemountDependencies,
) {
  dependencies = nextDependencies;
}

function getDependencies() {
  if (!dependencies) {
    throw new Error('experimentalRouteRemount was called before router setup.');
  }

  return dependencies;
}

function stripRouterBasepath(pathname: string, basepath: string | undefined) {
  if (!basepath || basepath === '/') {
    return pathname;
  }

  if (pathname === basepath) {
    return '/';
  }

  if (pathname.startsWith(`${basepath}/`)) {
    return pathname.slice(basepath.length);
  }

  return pathname;
}

function getActiveProjectVersion(
  router: AnyRouter,
  projectId: string,
): number | undefined {
  const matches = router.state.matches as ReadonlyArray<{
    loaderData?: unknown;
    params: Record<string, unknown>;
  }>;

  for (const match of matches) {
    if (match.params.verfahrenId !== projectId) {
      continue;
    }

    const loaderData = match.loaderData;
    const projectVersion =
      loaderData &&
      typeof loaderData === 'object' &&
      'projectVersion' in loaderData
        ? loaderData.projectVersion
        : undefined;

    if (
      typeof projectVersion === 'number' &&
      Number.isInteger(projectVersion)
    ) {
      return projectVersion;
    }
  }

  return undefined;
}

/**
 * Forces the current project route subtree to remount after a version-changing
 * workflow. Cache invalidation alone is not enough here: project-scoped loaders
 * and providers hold versioned graph, workflow, and PDF state. The temporary
 * `/route-remount` navigation unmounts that subtree, clears project-owned route
 * and query caches, yields one tick, then replaces back to the previous URL.
 */
export async function experimentalRouteRemount(projectId: string) {
  const { queryClient, refetchProjectNodeTreeAndPayloads, router } =
    getDependencies();
  const projectVersion = getActiveProjectVersion(router, projectId);
  const previousLocation = {
    pathname: stripRouterBasepath(
      router.state.location.pathname,
      router.options.basepath,
    ),
    search: router.state.location.search,
    hash: router.state.location.hash,
  };

  await router.navigate({
    to: ROUTE_REMOUNT_PATH,
    replace: true,
    resetScroll: false,
  });

  router.clearCache({
    filter: (match) =>
      'verfahrenId' in match.params && match.params.verfahrenId === projectId,
  });

  await Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: ['projects', projectId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['projects'],
    }),
    projectVersion === undefined
      ? Promise.resolve()
      : refetchProjectNodeTreeAndPayloads(projectId, projectVersion),
    queryClient.invalidateQueries({
      queryKey: ['project-temporal-workflows', projectId],
    }),
  ]);

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

  await router.navigate({
    to: previousLocation.pathname,
    search: previousLocation.search as never,
    hash: previousLocation.hash,
    replace: true,
    resetScroll: false,
  });
}
