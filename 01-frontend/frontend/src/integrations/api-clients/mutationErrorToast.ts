import { toast } from '@/features/ui/toast/Toast';
import i18n from 'i18next';
import { getHttpErrorStatus } from './httpErrorStatus';

type MutationErrorToastOptions = {
  error: unknown;
  fallbackMessage: string;
  statusMessages?: Partial<Record<number, string>>;
};

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

const getCause = (error: object): unknown =>
  'cause' in error ? (error as { cause?: unknown }).cause : undefined;

export class MutationToastHandledError extends Error {
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'MutationToastHandledError';
    Object.assign(this, { cause });
  }
}

export function isMutationToastHandledError(error: unknown): boolean {
  let current = error;
  const seen = new Set<unknown>();

  while (isObject(current) && !seen.has(current)) {
    seen.add(current);

    if (current instanceof MutationToastHandledError) {
      return true;
    }

    current = getCause(current);
  }

  return false;
}

const getMutationErrorToastMessage = (
  options: MutationErrorToastOptions,
): string => {
  const status = getHttpErrorStatus(options.error);

  if (status === 403) {
    return i18n.t('mutationError.forbidden', { ns: 'shared' });
  }

  if (status !== null) {
    return options.statusMessages?.[status] ?? options.fallbackMessage;
  }

  return options.fallbackMessage;
};

export function showMutationErrorToast(
  options: MutationErrorToastOptions,
): boolean {
  if (isMutationToastHandledError(options.error)) {
    return false;
  }

  toast.error(getMutationErrorToastMessage(options));

  return true;
}

export function createHandledMutationError(
  message: string,
  cause: unknown,
): MutationToastHandledError {
  return new MutationToastHandledError(message, cause);
}
