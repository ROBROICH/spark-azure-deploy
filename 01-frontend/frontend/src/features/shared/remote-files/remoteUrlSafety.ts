import * as Sentry from '@sentry/react';

const CONFIG_PLACEHOLDER_PREFIX = '__';

const reportedMalformedEntries = new Set<string>();

type AllowedOriginsConfig = {
  envName: string;
  envValue?: string;
  runtimeValue?: string;
};

type AllowedOriginOptions = {
  allowLocalHttp?: boolean;
};

type UrlAssertionMessages = {
  invalidUrl: string;
  untrustedUrl: string;
};

const redactMalformedAllowedOriginEntry = (rawEntry: string): string => {
  const trimmed = rawEntry.trim();

  if (trimmed.includes('*')) {
    return '[redacted:wildcard]';
  }

  try {
    const url = new URL(trimmed);
    const redactionReasons = [
      url.protocol !== 'https:' ? 'protocol' : undefined,
      url.username || url.password ? 'credentials' : undefined,
      url.pathname !== '/' ? 'path' : undefined,
      url.search ? 'query' : undefined,
      url.hash ? 'fragment' : undefined,
    ].filter((reason): reason is string => reason !== undefined);

    if (redactionReasons.length === 0) {
      return `${url.origin} [redacted:malformed]`;
    }

    return `${url.origin} [redacted:${redactionReasons.join(',')}]`;
  } catch {
    return '[redacted:invalid-url]';
  }
};

export const resolveRuntimeConfigValue = (
  value?: string,
): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith(CONFIG_PLACEHOLDER_PREFIX)) {
    return undefined;
  }

  return trimmed;
};

const reportMalformedAllowedOrigin = (envName: string, rawEntry: string) => {
  const redactedEntry = redactMalformedAllowedOriginEntry(rawEntry);
  const reportKey = `${envName}:${redactedEntry}:${rawEntry.length}`;
  if (reportedMalformedEntries.has(reportKey)) {
    return;
  }

  reportedMalformedEntries.add(reportKey);

  const error = new Error('Malformed signed URL origin allowlist entry');
  Sentry.captureException(error, {
    tags: { configKey: envName },
    extra: { entry: redactedEntry },
  });
};

const reportUntrustedUrl = (
  url: URL,
  allowedOrigins: ReadonlySet<string>,
  message: string,
) => {
  const acceptedUrlOrigins = Array.from(allowedOrigins);
  const error = new Error(message);

  // eslint-disable-next-line no-console -- local diagnostics should show the rejected origin and allowlist without exposing signed URL query data.
  console.error(message, {
    rejectedOrigin: url.origin,
    acceptedUrlOrigins,
  });
  Sentry.captureException(error, {
    tags: { rejectedOrigin: url.origin },
    extra: {
      rejectedProtocol: url.protocol,
      rejectedOrigin: url.origin,
      acceptedUrlOrigins,
    },
  });
};

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '::1' ||
  hostname === '[::1]';

const isAllowedLocalHttpUrl = (url: URL) =>
  url.protocol === 'http:' && isLocalHostname(url.hostname);

const parseAllowedHttpsOrigin = (
  rawOrigin: string,
  envName: string,
  options: AllowedOriginOptions = {},
): string | undefined => {
  const trimmed = rawOrigin.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.includes('*')) {
    reportMalformedAllowedOrigin(envName, trimmed);
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    const isBareOrigin =
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === '';

    const isAllowedProtocol =
      url.protocol === 'https:' ||
      (options.allowLocalHttp && isAllowedLocalHttpUrl(url));

    if (!isAllowedProtocol || !isBareOrigin) {
      reportMalformedAllowedOrigin(envName, trimmed);
      return undefined;
    }

    return url.origin;
  } catch {
    reportMalformedAllowedOrigin(envName, trimmed);
    return undefined;
  }
};

export const parseAllowedHttpsOrigins = (
  config: string | undefined,
  envName: string,
  options: AllowedOriginOptions = {},
): ReadonlySet<string> => {
  if (!config) {
    return new Set<string>();
  }

  return new Set(
    config
      .split(',')
      .map((entry) => parseAllowedHttpsOrigin(entry, envName, options))
      .filter((origin): origin is string => origin !== undefined),
  );
};

export const getConfiguredAllowedHttpsOrigins = (
  config: AllowedOriginsConfig,
  options: AllowedOriginOptions = {},
): ReadonlySet<string> => {
  const runtimeConfig = resolveRuntimeConfigValue(config.runtimeValue);
  const selectedConfig =
    runtimeConfig ?? resolveRuntimeConfigValue(config.envValue);

  return parseAllowedHttpsOrigins(selectedConfig, config.envName, options);
};

export const assertAllowedHttpsUrl = (
  rawUrl: string,
  allowedOrigins: ReadonlySet<string>,
  messages: UrlAssertionMessages,
  options: AllowedOriginOptions = {},
): string => {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(messages.invalidUrl);
  }

  const isAllowedProtocol =
    url.protocol === 'https:' ||
    (options.allowLocalHttp && isAllowedLocalHttpUrl(url));

  if (!isAllowedProtocol || !allowedOrigins.has(url.origin)) {
    reportUntrustedUrl(url, allowedOrigins, messages.untrustedUrl);
    throw new Error(messages.untrustedUrl);
  }

  return url.toString();
};
