import { describe, expect, it, vi } from 'vitest';
import {
  attachHttpStatusToError,
  configureHttpStatusErrorInterceptors,
  getHttpErrorStatus,
} from './httpErrorStatus';

const createResponse = (status: number) => new Response(null, { status });

describe('httpErrorStatus', () => {
  it('attaches response status to object errors', () => {
    const error = { detail: 'Forbidden' };
    const response = createResponse(403);

    const result = attachHttpStatusToError(error, response);

    expect(result).toBe(error);
    expect(getHttpErrorStatus(result)).toBe(403);
  });

  it('wraps primitive errors while preserving status through cause chains', () => {
    const result = attachHttpStatusToError('Forbidden', createResponse(403));
    const wrappedError = new Error('outer');

    Object.defineProperty(wrappedError, 'cause', {
      value: result,
    });

    expect(result).toBeInstanceOf(Error);
    expect(getHttpErrorStatus(wrappedError)).toBe(403);
  });

  it('reads nested response status fields', () => {
    const error = { response: createResponse(400) };

    expect(getHttpErrorStatus(error)).toBe(400);
  });

  it('returns null when no response status is available', () => {
    expect(getHttpErrorStatus(new Error('network failed'))).toBeNull();
  });

  it('registers each client once', async () => {
    const interceptor = vi.fn();
    const client = {
      interceptors: {
        error: {
          use: interceptor,
        },
      },
    };

    configureHttpStatusErrorInterceptors([client]);
    configureHttpStatusErrorInterceptors([client]);

    expect(interceptor).toHaveBeenCalledOnce();

    const handler = interceptor.mock.calls[0]?.[0];
    expect(
      await handler?.(
        { detail: 'Bad request' },
        createResponse(400),
        new Request('https://example.test'),
        {},
      ),
    ).toHaveProperty('status', 400);
  });
});
