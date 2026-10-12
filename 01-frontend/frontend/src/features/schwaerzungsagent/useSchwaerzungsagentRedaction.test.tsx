import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchwaerzungsagentSession } from './schwaerzungsagentSession';
import { useSchwaerzungsagentRedaction } from './useSchwaerzungsagentRedaction';

const mocks = vi.hoisted(() => ({
  anonymizePdf: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1AgentOrchestrationAnonymizePdf: mocks.anonymizePdf,
}));

const session = {
  version: 1,
  requestId: 'request-1',
  originalFilename: 'input.pdf',
  redactedFilename: 'input_redacted.pdf',
  fileSize: 3,
  startedAt: 1,
  estimatedDurationMs: 300_000,
} satisfies SchwaerzungsagentSession;

const createHttpError = (message: string, status: number) =>
  Object.assign(new Error(message), {
    response: new Response(null, { status }),
  });

describe('useSchwaerzungsagentRedaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.anonymizePdf.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reattaches to a completed request without uploading the file again', async () => {
    const redactedBlob = new Blob(['redacted'], { type: 'application/pdf' });
    const onSuccess = vi.fn();
    mocks.anonymizePdf.mockResolvedValueOnce({
      data: redactedBlob,
      response: new Response(),
    });

    renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: true,
        file: null,
        onSuccess,
        session,
      }),
    );

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(redactedBlob);
    });
    expect(mocks.anonymizePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { requestId: 'request-1' },
        parseAs: 'blob',
        throwOnError: true,
      }),
    );
  });

  it('retries the same redaction request after a content-length mismatch', async () => {
    const redactedBlob = new Blob(['redacted'], { type: 'application/pdf' });
    const onSuccess = vi.fn();
    const file = new File(['pdf'], 'input.pdf', { type: 'application/pdf' });
    mocks.anonymizePdf
      .mockRejectedValueOnce(
        new TypeError('net::ERR_CONTENT_LENGTH_MISMATCH 200 (OK)'),
      )
      .mockResolvedValueOnce({
        data: redactedBlob,
        response: new Response(),
      });

    renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: true,
        file,
        onSuccess,
        session,
      }),
    );

    await vi.waitFor(() => {
      expect(mocks.anonymizePdf).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await vi.waitFor(() => {
      expect(mocks.anonymizePdf).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(redactedBlob);
    });
    expect(mocks.anonymizePdf).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: expect.objectContaining({ file, requestId: 'request-1' }),
        parseAs: 'blob',
        throwOnError: true,
      }),
    );
    expect(mocks.anonymizePdf).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: { requestId: 'request-1' },
        parseAs: 'blob',
        throwOnError: true,
      }),
    );
  });

  it('reattaches to the same request id after a gateway timeout response', async () => {
    const redactedBlob = new Blob(['redacted'], { type: 'application/pdf' });
    const onSuccess = vi.fn();
    mocks.anonymizePdf
      .mockRejectedValueOnce(createHttpError('gateway timeout', 504))
      .mockResolvedValueOnce({
        data: redactedBlob,
        response: new Response(),
      });

    renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: true,
        file: null,
        onSuccess,
        session,
      }),
    );

    await vi.waitFor(() => {
      expect(mocks.anonymizePdf).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await vi.waitFor(() => {
      expect(mocks.anonymizePdf).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(redactedBlob);
    });
    expect(mocks.anonymizePdf).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: { requestId: 'request-1' },
        parseAs: 'blob',
        throwOnError: true,
      }),
    );
  });

  it('does not hang when a request error cause chain is cyclic', async () => {
    const cyclicError = new Error('network failed');
    cyclicError.cause = cyclicError;
    const onSuccess = vi.fn();
    mocks.anonymizePdf.mockRejectedValueOnce(cyclicError);

    const { result } = renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: true,
        file: null,
        onSuccess,
        session,
      }),
    );

    await vi.waitFor(() => {
      expect(result.current.error).toBe(cyclicError);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.anonymizePdf).toHaveBeenCalledTimes(1);
  });

  it('surfaces terminal backend errors without retrying or calling success', async () => {
    const terminalError = createHttpError('server failed', 500);
    const onSuccess = vi.fn();
    mocks.anonymizePdf.mockRejectedValueOnce(terminalError);

    const { result } = renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: true,
        file: null,
        onSuccess,
        session,
      }),
    );

    await vi.waitFor(() => {
      expect(result.current.error).toBe(terminalError);
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.anonymizePdf).toHaveBeenCalledTimes(1);
  });

  it('does not call the API when disabled or missing a session', () => {
    const onSuccess = vi.fn();

    renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: false,
        file: null,
        onSuccess,
        session,
      }),
    );
    renderHook(() =>
      useSchwaerzungsagentRedaction({
        enabled: true,
        file: null,
        onSuccess,
        session: null,
      }),
    );

    expect(mocks.anonymizePdf).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
