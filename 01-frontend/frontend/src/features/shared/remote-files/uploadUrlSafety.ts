import {
  assertAllowedHttpsUrl,
  getConfiguredAllowedHttpsOrigins,
} from '@/features/shared/remote-files/remoteUrlSafety';

export type SafeUploadUrlString = string & {
  readonly __safeUploadUrl: unique symbol;
};

const ALLOWED_UPLOAD_ORIGINS_ENV = 'VITE_ALLOWED_UPLOAD_ORIGINS';

const getAllowedUploadOrigins = () =>
  getConfiguredAllowedHttpsOrigins(
    {
      envName: ALLOWED_UPLOAD_ORIGINS_ENV,
      runtimeValue: window.__APP_CONFIG__?.VITE_ALLOWED_UPLOAD_ORIGINS,
      envValue: import.meta.env.VITE_ALLOWED_UPLOAD_ORIGINS,
    },
    {
      allowLocalHttp: import.meta.env.DEV,
    },
  );

export const safeUploadUrl = (rawUrl: string): SafeUploadUrlString =>
  assertAllowedHttpsUrl(
    rawUrl,
    getAllowedUploadOrigins(),
    {
      invalidUrl: 'Blocked invalid upload URL',
      untrustedUrl: 'Blocked untrusted upload URL',
    },
    {
      allowLocalHttp: import.meta.env.DEV,
    },
  ) as SafeUploadUrlString;
