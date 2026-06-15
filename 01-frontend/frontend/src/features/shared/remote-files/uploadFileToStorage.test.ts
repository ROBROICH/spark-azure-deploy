import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadFileToStorage } from './uploadFileToStorage';

const originalAppConfig = window.__APP_CONFIG__;

describe('uploadFileToStorage', () => {
  afterEach(() => {
    window.__APP_CONFIG__ = originalAppConfig;
    vi.unstubAllGlobals();
  });

  const allowStorageOrigin = () => {
    window.__APP_CONFIG__ = {
      VITE_ALLOWED_UPLOAD_ORIGINS: 'https://storage.example',
    };
  };

  it('uploads the file with the provided MIME type', async () => {
    allowStorageOrigin();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['zip'], 'ewms.zip', { type: 'application/zip' });

    await expect(
      uploadFileToStorage({
        file,
        mimeType: 'application/zip',
        uploadUrl: 'https://storage.example/upload',
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('https://storage.example/upload', {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/zip' },
    });
  });

  it('throws a sanitized error without reading storage failure bodies', async () => {
    allowStorageOrigin();
    const failureResponse = new Response(
      '<Error><Code>AccessDenied</Code><RequestId>req-123</RequestId><BucketName>private-bucket</BucketName><Key>projects/p-1/ewms.zip</Key></Error>',
      {
        status: 403,
        statusText: 'Forbidden with storage diagnostics',
      },
    );
    const responseTextSpy = vi.spyOn(failureResponse, 'text');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(failureResponse);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadFileToStorage({
        file: new File(['zip'], 'ewms.zip', { type: 'application/zip' }),
        mimeType: 'application/zip',
        uploadUrl: 'https://storage.example/upload/private-bucket',
      }),
    ).rejects.toMatchObject({
      message: 'Upload failed during storage-put: HTTP 403',
      name: 'StorageUploadError',
    });

    await expect(
      uploadFileToStorage({
        file: new File(['zip'], 'ewms.zip', { type: 'application/zip' }),
        mimeType: 'application/zip',
        uploadUrl: 'https://storage.example/upload/private-bucket',
      }),
    ).rejects.not.toThrow(
      /req-123|private-bucket|projects\/p-1\/ewms\.zip|Forbidden with storage diagnostics|storage\.example/,
    );
    expect(responseTextSpy).not.toHaveBeenCalled();
  });

  it('blocks unsafe upload URLs before sending the file body', async () => {
    allowStorageOrigin();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadFileToStorage({
        file: new File(['zip'], 'ewms.zip', { type: 'application/zip' }),
        mimeType: 'application/zip',
        uploadUrl: 'https://attacker.example/upload/private-bucket',
      }),
    ).rejects.toThrow('Blocked untrusted upload URL');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
