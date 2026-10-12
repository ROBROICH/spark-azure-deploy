import {
  v1AgentOrchestrationAnonymizePdf as anonymizePdf,
  type V1AgentOrchestrationAnonymizePdfData as AnonymizePdfData,
} from '@/api-clients/backend';
import { getHttpErrorStatus } from '@/integrations/api-clients/httpErrorStatus';
import { useEffect, useRef, useState } from 'react';
import type { SchwaerzungsagentSession } from './schwaerzungsagentSession';

type BodyAnonymizePdfWorkflowsAnonymisierungPost = AnonymizePdfData['body'];

const REQUEST_TIMEOUT_MS = 4 * 60 * 1000;
const RETRY_DELAY_MS = 1000;
const CONTENT_LENGTH_MISMATCH_ERROR = 'ERR_CONTENT_LENGTH_MISMATCH';

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms);

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

const isContentLengthMismatchError = (error: unknown): boolean => {
  let currentError = error;
  const seenErrors = new Set<Error>();

  while (currentError) {
    if (typeof currentError === 'string') {
      return currentError.includes(CONTENT_LENGTH_MISMATCH_ERROR);
    }

    if (!(currentError instanceof Error)) {
      return false;
    }

    if (seenErrors.has(currentError)) {
      return false;
    }
    seenErrors.add(currentError);

    if (currentError.message.includes(CONTENT_LENGTH_MISMATCH_ERROR)) {
      return true;
    }

    currentError = currentError.cause;
  }

  return false;
};

const isRetriableRequestError = (error: unknown) =>
  isAbortError(error) || isContentLengthMismatchError(error);

const isGatewayTimeoutError = (error: unknown) =>
  getHttpErrorStatus(error) === 504;

type SuccessCallbackRef = {
  current: (blob: Blob) => void;
};

type RedactionAttemptDecision = {
  action: 'retry' | 'stop';
  shouldUploadFile: boolean;
};

type RedactionAttemptResult = Awaited<ReturnType<typeof anonymizePdf<true>>>;

type UseSchwaerzungsagentRedactionProps = {
  enabled: boolean;
  file: File | null;
  onSuccess: (blob: Blob) => void;
  retryKey?: number;
  session: SchwaerzungsagentSession | null;
};

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error();

const createRedactionRequestBody = (
  requestId: string,
  file: File | null,
  shouldUploadFile: boolean,
) =>
  ({
    requestId,
    ...(shouldUploadFile && file ? { file } : {}),
  }) satisfies BodyAnonymizePdfWorkflowsAnonymisierungPost;

const handleRedactionResult = (
  result: RedactionAttemptResult,
  onSuccessRef: SuccessCallbackRef,
): RedactionAttemptDecision => {
  onSuccessRef.current(result.data);
  return { action: 'stop', shouldUploadFile: false };
};

const handleRedactionException = (
  caughtError: unknown,
  signal: AbortSignal,
  setError: (error: Error | null) => void,
): RedactionAttemptDecision => {
  if (signal.reason !== undefined) {
    return { action: 'stop', shouldUploadFile: false };
  }

  if (
    isGatewayTimeoutError(caughtError) ||
    isRetriableRequestError(caughtError)
  ) {
    return { action: 'retry', shouldUploadFile: false };
  }

  setError(toError(caughtError));

  return { action: 'stop', shouldUploadFile: false };
};

const runRedactionAttempt = async (params: {
  file: File | null;
  onSuccessRef: SuccessCallbackRef;
  requestController: AbortController;
  requestId: string;
  setError: (error: Error | null) => void;
  shouldUploadFile: boolean;
  signal: AbortSignal;
}): Promise<RedactionAttemptDecision> => {
  const {
    file,
    onSuccessRef,
    requestController,
    requestId,
    setError,
    shouldUploadFile,
    signal,
  } = params;

  try {
    const result = await anonymizePdf({
      body: createRedactionRequestBody(requestId, file, shouldUploadFile),
      parseAs: 'blob',
      signal: requestController.signal,
      throwOnError: true,
    });

    return handleRedactionResult(result, onSuccessRef);
  } catch (caughtError) {
    return handleRedactionException(caughtError, signal, setError);
  }
};

const waitForRetry = async (signal: AbortSignal) => {
  try {
    await delay(RETRY_DELAY_MS, signal);
  } catch (delayError) {
    if (signal.reason !== undefined) {
      return false;
    }

    throw delayError;
  }

  return true;
};

const runRedactionRequest = async (params: {
  file: File | null;
  onSuccessRef: SuccessCallbackRef;
  requestId: string;
  setError: (error: Error | null) => void;
  signal: AbortSignal;
}) => {
  const { file, onSuccessRef, requestId, setError, signal } = params;

  setError(null);
  let shouldUploadFile = Boolean(file);

  while (!signal.aborted) {
    const requestController = new AbortController();
    const timeout = window.setTimeout(
      () => requestController.abort(),
      REQUEST_TIMEOUT_MS,
    );
    const abortRequest = () => requestController.abort();
    signal.addEventListener('abort', abortRequest, { once: true });

    let attemptDecision: RedactionAttemptDecision;

    try {
      // eslint-disable-next-line no-await-in-loop -- retries must be sequential for one request id.
      attemptDecision = await runRedactionAttempt({
        file,
        onSuccessRef,
        requestController,
        requestId,
        setError,
        shouldUploadFile,
        signal,
      });
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abortRequest);
    }

    shouldUploadFile = attemptDecision.shouldUploadFile;

    if (attemptDecision.action === 'stop') {
      return;
    }

    // eslint-disable-next-line no-await-in-loop -- timeout recovery waits before reattaching to the same workflow.
    if (!(await waitForRetry(signal))) {
      return;
    }
  }
};

/**
 * Runs the anonymization request for the current stored request id and retries
 * with the same id when the browser request fails in a resumable way.
 *
 * @param props File, session, and success callback for the active upload.
 * @returns Request status for rendering the progress surface.
 */
export const useSchwaerzungsagentRedaction = (
  props: UseSchwaerzungsagentRedactionProps,
) => {
  const { enabled, file, onSuccess, retryKey, session } = props;
  const requestId = session?.requestId;
  // eslint-disable-next-line no-restricted-syntax -- local request error belongs to this one upload runner.
  const [error, setError] = useState<Error | null>(null);
  const onSuccessRef = useRef(onSuccess);

  // eslint-disable-next-line no-restricted-syntax -- the long-running request loop calls the latest success handler without restarting the upload.
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // eslint-disable-next-line no-restricted-syntax -- this effect owns the network request lifecycle for the selected File.
  useEffect(() => {
    if (!enabled || !requestId) {
      return;
    }

    const lifecycleController = new AbortController();

    void runRedactionRequest({
      file,
      onSuccessRef,
      requestId,
      setError,
      signal: lifecycleController.signal,
    });

    return () => {
      lifecycleController.abort();
    };
  }, [enabled, file, requestId, retryKey]);

  return { error };
};
