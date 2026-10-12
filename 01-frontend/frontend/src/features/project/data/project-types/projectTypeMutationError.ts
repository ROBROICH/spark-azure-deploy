import { getHttpErrorStatus } from '@/integrations/api-clients/httpErrorStatus';
import { isMutationToastHandledError } from '@/integrations/api-clients/mutationErrorToast';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

const readMessage = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.message === 'string' && value.message.trim().length > 0) {
    return value.message;
  }

  if (typeof value.detail === 'string' && value.detail.trim().length > 0) {
    return value.detail;
  }

  if (
    isRecord(value.detail) &&
    typeof value.detail.message === 'string' &&
    value.detail.message.trim().length > 0
  ) {
    return value.detail.message;
  }

  return null;
};

const getCause = (value: object): unknown =>
  'cause' in value ? value.cause : undefined;

export const isProjectTypeConflictError = (error: unknown): boolean =>
  getHttpErrorStatus(error) === 409;

/**
 * Walks wrapped fetch/collection errors to the backend payload so create and
 * rename dialogs can show the server uniqueness or conflict text on the field.
 *
 * @param error Unknown rejection from a collection persist or generated client call.
 * @returns The first concrete API `message`/`detail` in the cause chain, or null.
 */
export const getProjectTypeApiErrorMessage = (
  error: unknown,
): string | null => {
  let current = error;
  const seen = new Set<unknown>();

  while (isRecord(current) && !seen.has(current)) {
    seen.add(current);
    const cause = getCause(current);
    const unwrapWrapper =
      isMutationToastHandledError(current) ||
      (current instanceof Error && cause !== undefined && cause !== null);

    if (unwrapWrapper) {
      current = cause;
      continue;
    }

    const message = readMessage(current);
    if (message) {
      return message;
    }

    current = cause;
  }

  return readMessage(current);
};
