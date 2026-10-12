import { emitSessionExpired } from '@/features/access-control/current-user/sessionExpired.ts';
import { configureProjectVersionConflictInterceptors } from '@/features/project/versioning/conflict-dialogs/projectVersionConflictInterceptors';
import { isAuthRedirectRetryEnabled } from '@/features/shared/config/authRedirectRetry.ts';
import { configureHttpStatusErrorInterceptors } from './httpErrorStatus';
import { client as apiClient } from '../../api-clients/backend/client.gen.ts';
import { v1IdentityGetCurrentIdentity as getCurrentIdentity } from '../../api-clients/backend/sdk.gen.ts';
import { client as lawChangesClient } from '../../api-clients/law-changes-module/client.gen.ts';

type VersionConflictClient = Parameters<
  typeof configureProjectVersionConflictInterceptors
>[0][number];
type HttpStatusClient = Parameters<
  typeof configureHttpStatusErrorInterceptors
>[0][number];

type SharedClientConfig = {
  credentials: RequestCredentials;
  fetch: typeof fetch;
  redirect: RequestRedirect;
};

type ConfigurableApiClient = VersionConflictClient &
  HttpStatusClient & {
    setConfig: (config: SharedClientConfig & { baseUrl: string }) => unknown;
  };

const API_CLIENTS = [
  apiClient,
  lawChangesClient,
] as const satisfies ReadonlyArray<ConfigurableApiClient>;

function getApiBaseUrl(): string {
  const runtimeBaseUrl = window.__APP_CONFIG__?.VITE_API_BASE_URL?.trim();
  const baseUrl =
    runtimeBaseUrl && !runtimeBaseUrl.startsWith('__')
      ? runtimeBaseUrl
      : import.meta.env.VITE_API_BASE_URL.trim();
  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL is required');
  }
  return baseUrl.replace(/\/$/, '');
}

function isSessionExpiredResponse(response: Response): boolean {
  return (
    response.redirected ||
    response.status === 302 ||
    response.type === 'opaqueredirect'
  );
}

export function createAuthRedirectAwareFetch(props: {
  enableAuthRedirectRetry?: boolean;
  fetch?: typeof fetch;
  refreshSession?: () => Promise<unknown>;
}): typeof fetch {
  const { enableAuthRedirectRetry = false, fetch: fetchImpl = fetch } = props;
  let refreshPromise: Promise<unknown> | undefined;

  const refreshSession =
    props.refreshSession ??
    (() =>
      getCurrentIdentity({
        credentials: 'include',
        fetch: fetchImpl,
        redirect: 'manual',
        throwOnError: false,
      }));

  const waitForSessionRefresh = async () => {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = undefined;
    });

    await refreshPromise.catch(() => undefined);
  };

  return async (input, init) => {
    let response = await fetchImpl(input, init);

    if (!isSessionExpiredResponse(response)) {
      return response;
    }

    if (!enableAuthRedirectRetry) {
      emitSessionExpired();
      return response;
    }

    await waitForSessionRefresh();
    response = await fetchImpl(input, init);

    if (!isSessionExpiredResponse(response)) {
      return response;
    }

    emitSessionExpired();
    return response;
  };
}

/**
 * API clients always use absolute service URLs derived from VITE_API_BASE_URL.
 * Auth is managed by Envoy, so frontend clients rely on cookies/session context
 * instead of attaching bearer tokens manually.
 */
export function configureClients(): void {
  const apiBaseUrl = getApiBaseUrl();
  const sharedConfig = {
    credentials: 'include',
    fetch: createAuthRedirectAwareFetch({
      enableAuthRedirectRetry: isAuthRedirectRetryEnabled(),
    }),
    // Keep redirects manual so session-expiry redirects are observable here.
    redirect: 'manual',
  } satisfies SharedClientConfig;

  configureProjectVersionConflictInterceptors(API_CLIENTS);
  configureHttpStatusErrorInterceptors(API_CLIENTS);
  apiClient.setConfig({
    baseUrl: apiBaseUrl.endsWith('/api') ? apiBaseUrl.slice(0, -4) : apiBaseUrl,
    ...sharedConfig,
  });
  lawChangesClient.setConfig({
    baseUrl: `${apiBaseUrl}/law-changes/v1`,
    ...sharedConfig,
  });
}
