export type PostgresDriverErrorFacts = Readonly<{
  code?: string;
  message?: string;
  constraint?: string;
}>;

const CODE_PROPERTIES = ["sqlstate", "sqlState", "errno", "code"];
const MAXIMUM_VISITED_OBJECTS = 5;

interface PropertyRead {
  readonly readable: boolean;
  readonly value?: unknown;
}

interface DriverErrorSource {
  readonly cause?: unknown;
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly errno?: unknown;
  readonly message?: unknown;
  readonly sqlState?: unknown;
  readonly sqlstate?: unknown;
}

interface MutablePostgresDriverErrorFacts {
  code?: string;
  message?: string;
  constraint?: string;
}

function driverErrorSource(cause: unknown): DriverErrorSource | undefined {
  try {
    if (cause instanceof Function) return undefined;
    const source: DriverErrorSource = Object(cause);
    return source === cause ? source : undefined;
  } catch {
    return undefined;
  }
}

function readProperty(source: DriverErrorSource, property: PropertyKey): PropertyRead {
  try {
    return { readable: true, value: Reflect.get(source, property, source) };
  } catch {
    return { readable: false };
  }
}

function nonBlankString(cause: unknown): string | undefined {
  try {
    if (cause instanceof String) return undefined;
    const value = String.prototype.valueOf.call(cause);
    return value.trim().length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function codeFrom(source: DriverErrorSource): string | undefined {
  for (const property of CODE_PROPERTIES) {
    const value = readProperty(source, property).value;
    const stringValue = nonBlankString(value);
    if (stringValue !== undefined) return stringValue;
    try {
      if (value instanceof Number) continue;
      const number = Number.prototype.valueOf.call(value);
      if (Number.isFinite(number) && Number.isSafeInteger(number)) return String(number);
    } catch {
      continue;
    }
  }
  return undefined;
}

function stringFactFrom(
  source: DriverErrorSource,
  property: "message" | "constraint",
): string | undefined {
  return nonBlankString(readProperty(source, property).value);
}

function errorChain(cause: unknown): readonly DriverErrorSource[] {
  const root = driverErrorSource(cause);
  if (root === undefined) return [];

  const chain: DriverErrorSource[] = [];
  const seen = new Set<DriverErrorSource>();
  let current = root;

  while (chain.length < MAXIMUM_VISITED_OBJECTS && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    if (chain.length === MAXIMUM_VISITED_OBJECTS) break;

    const cause = readProperty(current, "cause");
    if (!cause.readable) break;
    const nested = driverErrorSource(cause.value);
    if (nested === undefined) break;
    if (seen.has(nested)) break;
    current = nested;
  }

  return chain;
}

export function extractPostgresDriverErrorFacts(
  cause: unknown,
): PostgresDriverErrorFacts {
  const chain = errorChain(cause);
  let code: string | undefined;
  let message: string | undefined;
  let constraint: string | undefined;

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const source = chain[index]!;
    code ??= codeFrom(source);
    message ??= stringFactFrom(source, "message");
    constraint ??= stringFactFrom(source, "constraint");
  }

  const facts: MutablePostgresDriverErrorFacts = {};
  if (code !== undefined) facts.code = code;
  if (message !== undefined) facts.message = message;
  if (constraint !== undefined) facts.constraint = constraint;
  return Object.freeze(facts);
}
