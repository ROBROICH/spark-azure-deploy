import { emitSessionExpired } from '@/features/access-control/current-user/sessionExpired.ts';
import { configureProjectVersionConflictInterceptors } from '@/features/project/versioning/conflict-dialogs/projectVersionConflictInterceptors';
import { isAuthRedirectRetryEnabled } from '@/features/shared/config/authRedirectRetry.ts';
import { configureHttpStatusErrorInterceptors } from './httpErrorStatus';
import { client as agentOrchestrationClient } from '../../api-clients/agent-orchestration-module/client.gen.ts';
import { client as commentsClient } from '../../api-clients/comments-module/client.gen.ts';
import { client as documentClient } from '../../api-clients/dms-module/client.gen.ts';
import { client as examinationClient } from '../../api-clients/examination-module/client.gen.ts';
import { client as feedbackClient } from '../../api-clients/feedback-module/client.gen.ts';
import { client as formalCompletnessCheckClient } from '../../api-clients/fcs-module/client.gen.ts';
import { client as identityManagementClient } from '../../api-clients/identity-management-module/client.gen.ts';
import { getIdentityMeGet } from '../../api-clients/identity-management-module/sdk.gen.ts';
import { client as lawChangesClient } from '../../api-clients/law-changes-module/client.gen.ts';
import { client as objectionsClient } from '../../api-clients/oms-module/client.gen.ts';
import { client as projectClient } from '../../api-clients/pls-module/client.gen.ts';
import { client as pnsClient } from '../../api-clients/pns-module/client.gen.ts';
import { client as protocolClient } from '../../api-clients/protocol-module/client.gen.ts';
import { client as supplementaryRequestsClient } from '../../api-clients/supplementary-requests-module/client.gen.ts';
import { client as temporalJobsClient } from '../../api-clients/temporal-jobs-module/client.gen.ts';
import { client as vaeClient } from '../../api-clients/vae-module/client.gen.ts';

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

const API_CLIENT_BASE_PATHS = [
  [agentOrchestrationClient, '/agent-orchestration/v1'],
  [commentsClient, '/comment/v1'],
  [documentClient, '/dms/v1'],
  [examinationClient, '/examination/v1'],
  [feedbackClient, '/feedback/v1'],
  [formalCompletnessCheckClient, '/fcs/v1'],
  [identityManagementClient, '/identity'],
  [lawChangesClient, '/law-changes/v1'],
  [objectionsClient, '/oms/v1'],
  [projectClient, '/pls/v1'],
  [pnsClient, '/plausibility-notes/v1'],
  [protocolClient, '/protocol/v1'],
  [supplementaryRequestsClient, '/supplementary-requests/v1'],
  [temporalJobsClient, ''],
  [vaeClient, '/vae/v1'],
] as const satisfies ReadonlyArray<readonly [ConfigurableApiClient, string]>;

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
      getIdentityMeGet({
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

const getClientBaseUrl = (apiBaseUrl: string, basePath: string): string =>
  basePath ? `${apiBaseUrl}${basePath}` : apiBaseUrl;

const configureClientBaseUrls = (
  apiBaseUrl: string,
  sharedConfig: SharedClientConfig,
): void => {
  for (const [client, basePath] of API_CLIENT_BASE_PATHS) {
    client.setConfig({
      baseUrl: getClientBaseUrl(apiBaseUrl, basePath),
      ...sharedConfig,
    });
  }
};

/**
 * API clients always use absolute service URLs derived from VITE_API_BASE_URL.
 * Auth is managed by Envoy, so frontend clients rely on cookies/session context
 * instead of attaching bearer tokens manually.
 */
export function configureClients(): void {
  const apiBaseUrl = getApiBaseUrl();
  const sharedConfig = {
    credentials: 'include' as const,
    fetch: createAuthRedirectAwareFetch({
      enableAuthRedirectRetry: isAuthRedirectRetryEnabled(),
    }),
    // Keep redirects manual so session-expiry redirects are observable here.
    redirect: 'manual' as const,
  };

  configureProjectVersionConflictInterceptors(
    API_CLIENT_BASE_PATHS.map(([client]) => client),
  );
  configureHttpStatusErrorInterceptors(
    API_CLIENT_BASE_PATHS.map(([client]) => client),
  );
  configureClientBaseUrls(apiBaseUrl, sharedConfig);
}
