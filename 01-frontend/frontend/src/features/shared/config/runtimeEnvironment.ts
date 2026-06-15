const KNOWN_RUNTIME_ENVIRONMENTS = [
  'local',
  'testing',
  'staging',
  'production',
] as const;

export type KnownRuntimeEnvironment =
  (typeof KNOWN_RUNTIME_ENVIRONMENTS)[number];

export type RuntimeEnvironment = KnownRuntimeEnvironment | 'unknown';

function resolveRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('__')) {
    return undefined;
  }

  return trimmed;
}

export function getRuntimeEnvironmentName(): string | undefined {
  const runtimeValue = window.__APP_CONFIG__?.VITE_SENTRY_ENVIRONMENT;
  const envValue = import.meta.env.VITE_SENTRY_ENVIRONMENT;

  return (
    resolveRuntimeValue(runtimeValue) ?? resolveRuntimeValue(envValue)
  )?.toLowerCase();
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  const environment = getRuntimeEnvironmentName();

  if (
    environment &&
    (KNOWN_RUNTIME_ENVIRONMENTS as ReadonlyArray<string>).includes(environment)
  ) {
    return environment as KnownRuntimeEnvironment;
  }

  return 'unknown';
}

export function isRuntimeEnvironment(
  ...allowedEnvironments: RuntimeEnvironment[]
): boolean {
  return allowedEnvironments.includes(getRuntimeEnvironment());
}
