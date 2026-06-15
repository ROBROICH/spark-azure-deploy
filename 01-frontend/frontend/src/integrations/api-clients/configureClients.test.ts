import { client as agentOrchestrationClient } from '../../api-clients/agent-orchestration-module/client.gen';
import { client as commentsClient } from '../../api-clients/comments-module/client.gen';
import { client as documentClient } from '../../api-clients/dms-module/client.gen';
import { client as examinationClient } from '../../api-clients/examination-module/client.gen';
import { client as feedbackClient } from '../../api-clients/feedback-module/client.gen';
import { client as formalCompletnessCheckClient } from '../../api-clients/fcs-module/client.gen';
import { client as identityManagementClient } from '../../api-clients/identity-management-module/client.gen';
import { client as lawChangesClient } from '../../api-clients/law-changes-module/client.gen';
import { client as objectionsClient } from '../../api-clients/oms-module/client.gen';
import { client as projectClient } from '../../api-clients/pls-module/client.gen';
import { client as pnsClient } from '../../api-clients/pns-module/client.gen';
import { client as protocolClient } from '../../api-clients/protocol-module/client.gen';
import { client as supplementaryRequestsClient } from '../../api-clients/supplementary-requests-module/client.gen';
import { client as temporalJobsClient } from '../../api-clients/temporal-jobs-module/client.gen';
import { client as vaeClient } from '../../api-clients/vae-module/client.gen';
import { describe, expect, it, vi } from 'vitest';
import { subscribeSessionExpired } from '@/features/access-control/current-user/sessionExpired';
import {
  configureClients,
  createAuthRedirectAwareFetch,
} from './configureClients';

describe('createAuthRedirectAwareFetch', () => {
  const expiredResponse = () => new Response(null, { status: 302 });

  it('returns non-expired responses unchanged', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('reports session expiry and returns the original 302 response', async () => {
    const response = expiredResponse();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('reports session expiry and returns the original redirected response', async () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, 'redirected', { value: true });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('refreshes the session and retries a session-expired response', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(expiredResponse())
      .mockResolvedValueOnce(response);
    const refreshSession = vi.fn().mockResolvedValue(undefined);
    const wrappedFetch = createAuthRedirectAwareFetch({
      enableAuthRedirectRetry: true,
      fetch: fetchImpl,
      refreshSession,
    });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('shares one refresh promise across concurrent session-expired responses', async () => {
    const firstResponse = new Response('first', { status: 200 });
    const secondResponse = new Response('second', { status: 200 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(expiredResponse())
      .mockResolvedValueOnce(expiredResponse())
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    let resolveRefresh: () => void = () => {
      throw new Error('Expected refresh promise to be pending');
    };
    const refreshSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const wrappedFetch = createAuthRedirectAwareFetch({
      enableAuthRedirectRetry: true,
      fetch: fetchImpl,
      refreshSession,
    });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const firstResultPromise = wrappedFetch('/api/first');
    const secondResultPromise = wrappedFetch('/api/second');

    await Promise.resolve();
    await Promise.resolve();
    expect(refreshSession).toHaveBeenCalledOnce();

    resolveRefresh();

    const [firstResult, secondResult] = await Promise.all([
      firstResultPromise,
      secondResultPromise,
    ]);

    unsubscribe();
    expect(firstResult).toBe(firstResponse);
    expect(secondResult).toBe(secondResponse);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('reports session expiry when the retry is still expired', async () => {
    const response = expiredResponse();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const refreshSession = vi.fn().mockResolvedValue(undefined);
    const wrappedFetch = createAuthRedirectAwareFetch({
      enableAuthRedirectRetry: true,
      fetch: fetchImpl,
      refreshSession,
    });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('reports session expiry for manual browser redirects when retry is disabled', async () => {
    const response = Response.redirect('https://auth.example.test/login', 302);
    Object.defineProperty(response, 'status', { value: 0 });
    Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('reports session expiry without retrying when auth redirect retry is disabled', async () => {
    const response = expiredResponse();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const refreshSession = vi.fn().mockResolvedValue(undefined);
    const wrappedFetch = createAuthRedirectAwareFetch({
      fetch: fetchImpl,
      refreshSession,
    });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('does not mutate request URLs with project version query params', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });

    await wrappedFetch('/api/project-1/nodes');

    const calledUrl = fetchImpl.mock.calls[0]?.[0];
    expect(calledUrl).toBe('/api/project-1/nodes');
  });

  it('does not treat project version conflicts as a global transport concern', async () => {
    const response = new Response(
      JSON.stringify({ detail: 'Project version is not latest' }),
      { status: 409 },
    );
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const wrappedFetch = createAuthRedirectAwareFetch({ fetch: fetchImpl });
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    const result = await wrappedFetch('/api/test');

    unsubscribe();
    expect(result).toBe(response);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});

describe('configureClients', () => {
  it('configures generated clients with shared transport settings and base URLs', () => {
    window.__APP_CONFIG__ = {
      VITE_API_BASE_URL: 'https://api.example.test',
    };

    configureClients();

    const clientsWithBasePaths = [
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
    ] as const;

    for (const [client, basePath] of clientsWithBasePaths) {
      const config = client.getConfig();

      expect(config.baseUrl).toBe(`https://api.example.test${basePath}`);
      expect(config.credentials).toBe('include');
      expect(config.redirect).toBe('manual');
      expect(config.fetch).toEqual(expect.any(Function));
    }
  });
});
