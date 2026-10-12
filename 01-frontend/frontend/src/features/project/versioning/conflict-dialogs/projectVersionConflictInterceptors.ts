import {
  classifyProjectVersionConflict,
  emitProjectVersionConflict,
} from './projectVersionConflict';
import { createHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';

type ErrorInterceptorOptions = {
  body?: unknown;
  path?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

type ErrorInterceptor = (
  error: unknown,
  response: Response | undefined,
  request: Request | undefined,
  options: ErrorInterceptorOptions,
) => unknown | Promise<unknown>;

type VersionConflictClient = {
  interceptors: {
    error: {
      use: (fn: ErrorInterceptor) => number;
    };
  };
};

// Backend version-conflict responses use the standard HTTP conflict status.
const PROJECT_VERSION_CONFLICT_STATUS = 409;

const configuredClients = new WeakSet<object>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getStringField = (
  value: unknown,
  fieldNames: ReadonlyArray<string>,
): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const fieldValue = value[fieldName];
    if (typeof fieldValue === 'string' && fieldValue.length > 0) {
      return fieldValue;
    }
  }

  return null;
};

const getProjectIdFromUnknown = (value: unknown): string | null => {
  const direct = getStringField(value, ['projectId']);
  if (direct) {
    return direct;
  }

  if (!isRecord(value)) {
    return null;
  }

  const detail = value.detail;
  if (isRecord(detail)) {
    return getStringField(detail, ['projectId']);
  }

  return null;
};

const getProjectIdFromRequestUrl = (
  request: Request | undefined,
): string | null => {
  if (!request) {
    return null;
  }

  try {
    const { pathname } = new URL(request.url);
    const match = pathname.match(/\/verfahren\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

/**
 * Derives the project id this conflict belongs to from trusted request context.
 *
 * Request-scoped sources (generated path/query/body options, then the request
 * URL) are authoritative and take precedence. The error payload is only used as
 * a fallback, and any payload id that disagrees with the request-context id is
 * treated as untrusted: the function fails closed and returns `null` so the
 * caller surfaces the original error instead of acting on a mismatched project.
 */
const getProjectIdForConflict = (
  error: unknown,
  request: Request | undefined,
  options: ErrorInterceptorOptions,
): string | null => {
  const requestContextProjectId =
    getProjectIdFromUnknown(options.path) ??
    getProjectIdFromUnknown(options.query) ??
    getProjectIdFromUnknown(options.body) ??
    getProjectIdFromRequestUrl(request);

  const errorPayloadProjectId = getProjectIdFromUnknown(error);

  if (requestContextProjectId) {
    // Fail closed when the error payload names a different project than the
    // request that actually triggered it.
    if (
      errorPayloadProjectId &&
      errorPayloadProjectId !== requestContextProjectId
    ) {
      return null;
    }

    return requestContextProjectId;
  }

  return errorPayloadProjectId;
};

const isConflictStatus = (response: Response | undefined): boolean =>
  response?.status === PROJECT_VERSION_CONFLICT_STATUS;

const handleProjectVersionConflict: ErrorInterceptor = (
  error,
  response,
  request,
  options,
) => {
  // Only HTTP conflict responses may be reinterpreted as version conflicts, so
  // unrelated errors and user/backend free-text never get swallowed.
  if (!isConflictStatus(response)) {
    return error;
  }

  const conflictKind = classifyProjectVersionConflict(error);
  if (!conflictKind) {
    return error;
  }

  const projectId = getProjectIdForConflict(error, request, options);
  if (!projectId) {
    return error;
  }

  emitProjectVersionConflict({ kind: conflictKind, projectId });

  // Returning (not throwing) lets the generated client honor `throwOnError`:
  // throwing here would bypass that branch and break non-throwing callers that
  // expect `{ error, response }`.
  return createHandledProjectVersionConflictError();
};

export function configureProjectVersionConflictInterceptors(
  clients: ReadonlyArray<VersionConflictClient>,
): void {
  for (const client of clients) {
    if (configuredClients.has(client)) {
      continue;
    }

    client.interceptors.error.use(handleProjectVersionConflict);
    configuredClients.add(client);
  }
}
