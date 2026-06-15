import * as Sentry from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertAllowedHttpsUrl,
  getConfiguredAllowedHttpsOrigins,
  parseAllowedHttpsOrigins,
  resolveRuntimeConfigValue,
} from './remoteUrlSafety';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

describe('remote URL safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores empty and placeholder runtime config values', () => {
    expect(resolveRuntimeConfigValue('')).toBeUndefined();
    expect(resolveRuntimeConfigValue('  __VITE_ALLOWED_UPLOAD_ORIGINS__')).toBe(
      undefined,
    );
    expect(
      resolveRuntimeConfigValue(' https://storage.example.internal '),
    ).toBe('https://storage.example.internal');
  });

  it('parses exact HTTPS origins and rejects path, wildcard, credentials, and HTTP entries', () => {
    const origins = parseAllowedHttpsOrigins(
      [
        'https://storage.example.internal',
        'https://storage.example.internal/path',
        'https://*.example.internal',
        'https://user:pass@storage.example.internal',
        'http://storage.example.internal',
        'not-a-url',
      ].join(','),
      'VITE_ALLOWED_DOWNLOAD_ORIGINS',
    );

    expect(origins).toEqual(new Set(['https://storage.example.internal']));
    expect(Sentry.captureException).toHaveBeenCalledTimes(5);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: {
          entry: 'https://storage.example.internal [redacted:credentials]',
        },
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          entry: expect.stringContaining('user:pass'),
        }),
      }),
    );
  });

  it('allows loopback HTTP origins only when explicitly enabled', () => {
    expect(
      parseAllowedHttpsOrigins(
        'http://localhost:9000,http://127.0.0.1:9000,http://storage.example.internal',
        'VITE_ALLOWED_UPLOAD_ORIGINS',
        { allowLocalHttp: true },
      ),
    ).toEqual(new Set(['http://localhost:9000', 'http://127.0.0.1:9000']));

    expect(
      parseAllowedHttpsOrigins(
        'http://localhost:9000',
        'VITE_ALLOWED_UPLOAD_ORIGINS',
      ),
    ).toEqual(new Set());
  });

  it('reports each malformed env entry only once per env key', () => {
    const config = 'https://storage.example.internal/bad-path-once';

    parseAllowedHttpsOrigins(config, 'VITE_ALLOWED_UPLOAD_ORIGINS');
    parseAllowedHttpsOrigins(config, 'VITE_ALLOWED_UPLOAD_ORIGINS');
    parseAllowedHttpsOrigins(config, 'VITE_ALLOWED_DOWNLOAD_ORIGINS');

    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('treats runtime config as authoritative when it is present', () => {
    const origins = getConfiguredAllowedHttpsOrigins({
      envName: 'VITE_ALLOWED_UPLOAD_ORIGINS',
      runtimeValue: 'not-a-valid-origin',
      envValue: 'https://storage.example.internal',
    });

    expect(origins).toEqual(new Set());
  });

  it('falls back to build-time env when runtime config is unset or a placeholder', () => {
    const origins = getConfiguredAllowedHttpsOrigins({
      envName: 'VITE_ALLOWED_UPLOAD_ORIGINS',
      runtimeValue: '__VITE_ALLOWED_UPLOAD_ORIGINS__',
      envValue: 'https://storage.example.internal',
    });

    expect(origins).toEqual(new Set(['https://storage.example.internal']));
  });

  it('allows only absolute HTTPS URLs from configured origins', () => {
    const allowedOrigins = new Set(['https://storage.example.internal']);

    expect(
      assertAllowedHttpsUrl(
        'https://storage.example.internal/file.zip?signature=abc',
        allowedOrigins,
        {
          invalidUrl: 'invalid',
          untrustedUrl: 'untrusted',
        },
      ),
    ).toBe('https://storage.example.internal/file.zip?signature=abc');

    expect(() =>
      assertAllowedHttpsUrl('/relative/file.zip', allowedOrigins, {
        invalidUrl: 'invalid',
        untrustedUrl: 'untrusted',
      }),
    ).toThrow('invalid');
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    expect(() =>
      assertAllowedHttpsUrl(
        'http://storage.example.internal/file.zip',
        allowedOrigins,
        {
          invalidUrl: 'invalid',
          untrustedUrl: 'untrusted',
        },
      ),
    ).toThrow('untrusted');
    expect(() =>
      assertAllowedHttpsUrl(
        'https://attacker.example/file.zip',
        allowedOrigins,
        {
          invalidUrl: 'invalid',
          untrustedUrl: 'untrusted',
        },
      ),
    ).toThrow('untrusted');

    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  });

  it('allows loopback HTTP URLs only when explicitly enabled', () => {
    const allowedOrigins = new Set(['http://localhost:9000']);

    expect(
      assertAllowedHttpsUrl(
        'http://localhost:9000/file.zip?signature=abc',
        allowedOrigins,
        {
          invalidUrl: 'invalid',
          untrustedUrl: 'untrusted',
        },
        { allowLocalHttp: true },
      ),
    ).toBe('http://localhost:9000/file.zip?signature=abc');

    expect(() =>
      assertAllowedHttpsUrl('http://localhost:9000/file.zip', allowedOrigins, {
        invalidUrl: 'invalid',
        untrustedUrl: 'untrusted',
      }),
    ).toThrow('untrusted');
  });

  it('reports untrusted URLs without raw signed URL data', () => {
    const allowedOrigins = new Set([
      'https://storage.example.internal',
      'https://backup-storage.example.internal',
    ]);

    expect(() =>
      assertAllowedHttpsUrl(
        'https://attacker.example/file.zip?signature=abc',
        allowedOrigins,
        {
          invalidUrl: 'invalid',
          untrustedUrl: 'untrusted',
        },
      ),
    ).toThrow('untrusted');

    expect(consoleErrorSpy).toHaveBeenCalledWith('untrusted', {
      rejectedOrigin: 'https://attacker.example',
      acceptedUrlOrigins: [
        'https://storage.example.internal',
        'https://backup-storage.example.internal',
      ],
    });
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        url: expect.any(String),
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: {
          rejectedProtocol: 'https:',
          rejectedOrigin: 'https://attacker.example',
          acceptedUrlOrigins: [
            'https://storage.example.internal',
            'https://backup-storage.example.internal',
          ],
        },
      }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          url: expect.any(String),
        }) as Record<string, unknown>,
      }),
    );
  });
});
