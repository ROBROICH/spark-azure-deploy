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

type HttpStatusClient = {
  interceptors: {
    error: {
      use: (fn: ErrorInterceptor) => number;
    };
  };
};

const configuredClients = new WeakSet<object>();

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

const isStatusCode = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

const getRecordStatus = (
  value: Record<PropertyKey, unknown>,
): number | null => {
  if (isStatusCode(value.status)) {
    return value.status;
  }

  const response = value.response;
  if (isRecord(response) && isStatusCode(response.status)) {
    return response.status;
  }

  return null;
};

const defineHiddenProperty = (
  target: object,
  key: PropertyKey,
  value: unknown,
): boolean => {
  if (!Object.isExtensible(target)) {
    return false;
  }

  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: false,
    value,
  });

  return true;
};

const tagErrorWithStatus = (
  target: unknown,
  status: number,
  response: Response,
): boolean => {
  if (!isRecord(target)) {
    return false;
  }

  const hasStatus = isStatusCode(target.status);
  const hasResponse = isRecord(target.response);

  if (!hasStatus && !defineHiddenProperty(target, 'status', status)) {
    return false;
  }

  if (!hasResponse && !defineHiddenProperty(target, 'response', response)) {
    return false;
  }

  return true;
};

const createWrappedHttpError = (
  error: unknown,
  status: number,
  response: Response,
) => {
  const message =
    typeof error === 'string' && error.length > 0
      ? error
      : `Request failed with status ${status}`;
  const wrappedError = new Error(message);

  defineHiddenProperty(wrappedError, 'cause', error);
  tagErrorWithStatus(wrappedError, status, response);

  return wrappedError;
};

export function attachHttpStatusToError(
  error: unknown,
  response: Response | undefined,
): unknown {
  if (!response) {
    return error;
  }

  const status = response.status;
  if (!isStatusCode(status)) {
    return error;
  }

  if (tagErrorWithStatus(error, status, response)) {
    return error;
  }

  return createWrappedHttpError(error, status, response);
}

export function getHttpErrorStatus(error: unknown): number | null {
  let current = error;
  const seen = new Set<unknown>();

  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);

    const status = getRecordStatus(current);
    if (status !== null) {
      return status;
    }

    current = current.cause;
  }

  return null;
}

export function configureHttpStatusErrorInterceptors(
  clients: ReadonlyArray<HttpStatusClient>,
): void {
  for (const client of clients) {
    if (configuredClients.has(client)) {
      continue;
    }

    client.interceptors.error.use((error, response) =>
      attachHttpStatusToError(error, response),
    );
    configuredClients.add(client);
  }
}
