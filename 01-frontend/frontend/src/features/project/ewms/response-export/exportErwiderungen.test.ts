import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerErwiderungExportDownload } from './exportErwiderungen';

afterEach(() => {
  window.__APP_CONFIG__ = undefined;
  vi.restoreAllMocks();
});

describe('triggerErwiderungExportDownload', () => {
  it('starts a browser download only for trusted HTTPS origins', () => {
    window.__APP_CONFIG__ = {
      VITE_ALLOWED_DOWNLOAD_ORIGINS: 'https://storage.example.internal',
    };
    const link = document.createElement('a');
    const clickSpy = vi
      .spyOn(link, 'click')
      .mockImplementation(() => undefined);
    vi.spyOn(document, 'createElement').mockReturnValue(link);

    triggerErwiderungExportDownload(
      'https://storage.example.internal/export.csv?signature=abc',
    );

    expect(link.href).toBe(
      'https://storage.example.internal/export.csv?signature=abc',
    );
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.referrerPolicy).toBe('no-referrer');
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('blocks untrusted download URLs before clicking the generated anchor', () => {
    window.__APP_CONFIG__ = {
      VITE_ALLOWED_DOWNLOAD_ORIGINS: 'https://storage.example.internal',
    };
    const link = document.createElement('a');
    const clickSpy = vi
      .spyOn(link, 'click')
      .mockImplementation(() => undefined);
    vi.spyOn(document, 'createElement').mockReturnValue(link);

    expect(() =>
      triggerErwiderungExportDownload('https://attacker.example/export.csv'),
    ).toThrow('Blocked untrusted download URL');
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
