import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalPdfPreviewUrl,
  revokeLocalPdfPreviewUrl,
  safeDownloadUrl,
  toSafeDownloadUrl,
  toSafePdfIframeSrc,
} from './downloadUrlSafety';

const originalAppConfig = window.__APP_CONFIG__;

const setAllowedOrigins = (value: string | undefined) => {
  window.__APP_CONFIG__ = {
    VITE_ALLOWED_DOWNLOAD_ORIGINS: value,
  };
};

afterEach(() => {
  window.__APP_CONFIG__ = originalAppConfig;
  vi.restoreAllMocks();
});

describe('download URL safety', () => {
  it('allows HTTPS URLs from configured exact origins', () => {
    setAllowedOrigins('https://storage.example.internal');

    expect(
      safeDownloadUrl(
        'https://storage.example.internal/file.pdf?signature=abc',
      ),
    ).toBe('https://storage.example.internal/file.pdf?signature=abc');
  });

  it('blocks remote URLs when no allowlist is configured', () => {
    setAllowedOrigins(undefined);

    expect(
      toSafeDownloadUrl('https://storage.example.internal/file.pdf'),
    ).toBeUndefined();
  });

  it('rejects non-HTTPS and unknown origins', () => {
    setAllowedOrigins('https://storage.example.internal');

    expect(
      toSafeDownloadUrl('http://storage.example.internal/file.pdf'),
    ).toBeUndefined();
    expect(
      toSafeDownloadUrl('https://attacker.example/file.pdf'),
    ).toBeUndefined();
  });

  it('ignores malformed, wildcard, placeholder, and path-based config entries', () => {
    setAllowedOrigins(
      '__VITE_ALLOWED_DOWNLOAD_ORIGINS__, https://storage.example.internal/path, https://*.example.internal, not-a-url',
    );

    expect(
      toSafeDownloadUrl('https://storage.example.internal/file.pdf'),
    ).toBeUndefined();
  });

  it('appends a sanitized PDF page hash while preserving signed query params', () => {
    setAllowedOrigins('https://storage.example.internal');

    expect(
      toSafePdfIframeSrc(
        'https://storage.example.internal/file.pdf?X-Amz-Signature=abc#old',
        7.9,
      ),
    ).toBe(
      'https://storage.example.internal/file.pdf?X-Amz-Signature=abc#page=7',
    );
    expect(
      toSafePdfIframeSrc(
        'https://storage.example.internal/file.pdf?X-Amz-Signature=abc',
        -4,
      ),
    ).toBe(
      'https://storage.example.internal/file.pdf?X-Amz-Signature=abc#page=1',
    );
  });

  it('creates and revokes app-local blob preview URLs', () => {
    const createObjectUrlMock = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:preview-url');
    const revokeObjectUrlMock = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const blob = new Blob(['pdf']);

    const previewUrl = createLocalPdfPreviewUrl(blob);
    revokeLocalPdfPreviewUrl(previewUrl);

    expect(createObjectUrlMock).toHaveBeenCalledWith(blob);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-url');
  });
});
