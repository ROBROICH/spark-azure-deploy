const YAML_INDENT = '  ';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isComplex = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : isRecord(value) && Object.keys(value).length > 0;

const needsQuotedString = (value: string): boolean => {
  if (value.length === 0) {
    return true;
  }

  if (/^[\s]|[\s]$/.test(value)) {
    return true;
  }

  if (/[\n\r\t]/.test(value)) {
    return true;
  }

  if (/^(true|false|null|~|y|n|yes|no|on|off)$/i.test(value)) {
    return true;
  }

  if (/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)) {
    return true;
  }

  if (/^[&*!|>'"%@`?[\]{}]/.test(value)) {
    return true;
  }

  return /:\s|\s#/.test(value);
};

const quoteYamlString = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t')}"`;

const serializeString = (value: string): string =>
  needsQuotedString(value) ? quoteYamlString(value) : value;

const serializeKey = (key: string): string => {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return key;
  }

  return quoteYamlString(key);
};

const serializeNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new Error('YAML serializer cannot emit non-finite numbers');
  }

  return Number.isInteger(value) ? String(value) : String(value);
};

const serializeScalar = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return serializeNumber(value);
  }

  if (typeof value === 'string') {
    return serializeString(value);
  }

  throw new Error(`YAML serializer cannot emit ${typeof value}`);
};

const pad = (indent: number): string => YAML_INDENT.repeat(indent);

function serializeObject(
  value: Record<string, unknown>,
  indent: number,
): string {
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return '{}';
  }

  return keys
    .map((key) => {
      const nested = value[key];
      const renderedKey = `${pad(indent)}${serializeKey(key)}:`;
      if (!isComplex(nested)) {
        return `${renderedKey} ${serializeValue(nested, indent + 1)}`;
      }

      return `${renderedKey}\n${serializeValue(nested, indent + 1)}`;
    })
    .join('\n');
}

function serializeArray(value: unknown[], indent: number): string {
  if (value.length === 0) {
    return '[]';
  }

  return value
    .map((item) => {
      const marker = `${pad(indent)}- `;
      if (isRecord(item) && Object.keys(item).length > 0) {
        const body = serializeObject(item, indent + 1);
        const lines = body.split('\n');
        const first = lines[0]?.trimStart() ?? '';
        const rest = lines.slice(1).join('\n');
        return rest.length > 0
          ? `${marker}${first}\n${rest}`
          : `${marker}${first}`;
      }

      if (Array.isArray(item) && item.length > 0) {
        return `${pad(indent)}-\n${serializeArray(item, indent + 1)}`;
      }

      return `${marker}${serializeScalar(item)}`;
    })
    .join('\n');
}

function serializeValue(value: unknown, indent: number): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return serializeArray(value, indent);
  }

  if (isRecord(value)) {
    if (Object.keys(value).length === 0) {
      return '{}';
    }

    return serializeObject(value, indent);
  }

  return serializeScalar(value);
}

/**
 * Emits a deterministic YAML document for catalog-shaped JSON values.
 * Key order follows object insertion order. Empty objects/arrays become `{}` / `[]`.
 *
 * @param value JSON-compatible value (objects, arrays, strings, numbers, booleans, null).
 * @returns YAML text ending with a newline.
 */
export const serializeYaml = (value: unknown): string =>
  `${serializeValue(value, 0)}\n`;
