import { getRuntimeEnvironmentName } from '@/features/shared/config/runtimeEnvironment';
import * as Sentry from '@sentry/react';

function resolveRuntimeValue(value?: string): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue || trimmedValue.startsWith('__')) {
    return undefined;
  }

  return trimmedValue;
}

export function initSentry(): void {
  const dsn =
    resolveRuntimeValue(window.__APP_CONFIG__?.VITE_SENTRY_DSN) ??
    resolveRuntimeValue(import.meta.env.VITE_SENTRY_DSN);

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: getRuntimeEnvironmentName(),
    tracesSampleRate: 0,
    beforeSend: (event) => {
      // Sentry usage review:
      // - ErrorBoundary captures render/runtime errors without custom payload.
      // - TanStack Query captures generated operation ids, HTTP status, and
      //   error shape metadata from allowlisted fields only.
      // - Node transactions, feedback, comments, supplementary requests, topic
      //   assignment, norm edits, and AI workflow starts capture mutation
      //   failures without form values, document contents, or user details.
      // - Document-upload approval/cancel flows attach project ids, zip-file
      //   ids, flow, and stage so support can correlate failed backend writes.
      // - EWMS import/export flows attach project ids and flow tags for failed
      //   upload, import, and export handshakes.
      // - Plausibility checks attach contradiction ids and rating diagnostics
      //   for out-of-range backend data.
      // - Remote URL safety attaches config keys, URL origins, and malformed
      //   allowlist entries; the malformed value is the defect to diagnose.
      // The call sites do not attach user names, emails, tokens,
      // selected File objects, filenames, document text, or signed URL query
      // strings. Project/file/domain ids are required debugging context and are
      // not PII by themselves. Because PII is excluded at the call sites, no
      // additional PII scrubbing is necessary in beforeSend.
      return event;
    },
  });
}
