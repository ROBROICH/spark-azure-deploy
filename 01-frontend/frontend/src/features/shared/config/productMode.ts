export type ProductMode = 'spark' | 'ewms';

// Only the exact unreplaced template value counts as absent; any other
// nonempty value must reach validation and fail closed.
const UNREPLACED_TEMPLATE_VALUE = '__VITE_PRODUCT_MODE__';

function resolveRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === UNREPLACED_TEMPLATE_VALUE) {
    return undefined;
  }

  return trimmed;
}

/**
 * Resolves the deployment-level product mode. Runtime container configuration
 * wins over the build-time development value; absent values fall back to
 * 'spark'. Any other nonempty value is a configuration error and fails closed.
 */
export function getConfiguredProductMode(): ProductMode {
  const runtimeValue = window.__APP_CONFIG__?.VITE_PRODUCT_MODE;
  const envValue = import.meta.env.VITE_PRODUCT_MODE;
  const resolved =
    resolveRuntimeValue(runtimeValue) ?? resolveRuntimeValue(envValue);

  if (resolved === undefined) {
    return 'spark';
  }

  if (resolved === 'spark' || resolved === 'ewms') {
    return resolved;
  }

  throw new Error(
    `Invalid VITE_PRODUCT_MODE "${resolved}". Expected "spark" or "ewms".`,
  );
}
