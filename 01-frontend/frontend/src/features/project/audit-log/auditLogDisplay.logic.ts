import { parseISO, isValid, format } from 'date-fns';
import { stableJsonStringify } from './stableJsonStringify';

/**
 * Normalizes backend cell values for audit display while preserving structured
 * objects as readable JSON and formatting ISO-like dates for users.
 *
 * @param value Backend value from an audit row or nested row snapshot.
 * @returns Display text for a table cell.
 */
export const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '-';
  }

  const stringValue = String(value).trim();
  if (stringValue === '' || stringValue === '-') {
    return '-';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return stringValue;
    }
  }
  const lowerValue = stringValue.toLowerCase();
  if (lowerValue === 'true') {
    return 'true';
  }
  if (lowerValue === 'false') {
    return 'false';
  }
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}/;

  if (isoDateRegex.test(stringValue)) {
    const parsedDate = parseISO(stringValue);
    if (isValid(parsedDate)) {
      return format(parsedDate, 'dd.MM.yyyy HH:mm');
    }
  }
  return stringValue;
};

const isTraversableObject = (val: unknown): val is Record<string, unknown> => {
  return (
    typeof val === 'object' &&
    val !== null &&
    !Array.isArray(val) &&
    !(val instanceof Date)
  );
};

const FORMATTED_CONTENT_PATH = 'content';

export type AuditLogDiffRow =
  | { kind: 'value'; path: string; oldValue: unknown; newValue: unknown }
  | { kind: 'formattedContent'; path: typeof FORMATTED_CONTENT_PATH };

// Only decision sections store formatted content as JSON; other entities keep string `content` diffs.
const isFormattedContentPath = (entityType: string, path: string) =>
  entityType === 'vae_node' &&
  (path === FORMATTED_CONTENT_PATH ||
    path.startsWith(`${FORMATTED_CONTENT_PATH}.`) ||
    path.startsWith(`${FORMATTED_CONTENT_PATH}[`));

const recordEmptyContainer = (
  path: string,
  value: unknown[] | Record<string, unknown>,
  rows: Map<string, unknown>,
) => {
  if (path) {
    rows.set(path, value);
  }
};

/**
 * Flattens nested JSON into path-addressable audit rows. Empty containers are
 * recorded only below the root so `{}` does not create a blank diff path.
 *
 * @param value Current JSON subtree being flattened.
 * @param path Dot/bracket path for the current subtree.
 * @param rows Mutable destination map keyed by flattened JSON path.
 * @returns Nothing; rows are written into the destination map.
 */
const flattenJsonValue = (
  value: unknown,
  path: string,
  rows: Map<string, unknown>,
) => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      recordEmptyContainer(path, value, rows);
      return;
    }

    value.forEach((entry, index) => {
      flattenJsonValue(entry, `${path}[${index}]`, rows);
    });
    return;
  }

  if (isTraversableObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      recordEmptyContainer(path, value, rows);
      return;
    }

    entries.forEach(([key, entry]) => {
      flattenJsonValue(entry, path ? `${path}.${key}` : key, rows);
    });
    return;
  }

  if (path) {
    rows.set(path, value);
  }
};

const flattenJsonRecord = (
  value: Record<string, unknown> | null | undefined,
) => {
  const rows = new Map<string, unknown>();

  if (!value) {
    return rows;
  }

  flattenJsonValue(value, '', rows);
  return rows;
};

const toAuditLogDiffRow = (
  entityType: string,
  path: string,
  oldValues: Map<string, unknown>,
  newValues: Map<string, unknown>,
): AuditLogDiffRow =>
  isFormattedContentPath(entityType, path)
    ? { kind: 'formattedContent', path: FORMATTED_CONTENT_PATH }
    : {
        kind: 'value',
        path,
        oldValue: oldValues.get(path),
        newValue: newValues.get(path),
      };

export const getAuditLogDiffRows = (params: {
  entityType: string;
  oldRow: Record<string, unknown> | null | undefined;
  newRow: Record<string, unknown> | null | undefined;
}) => {
  const oldValues = flattenJsonRecord(params.oldRow);
  const newValues = flattenJsonRecord(params.newRow);
  const paths = Array.from(
    new Set([...oldValues.keys(), ...newValues.keys()]),
  ).sort((left, right) => left.localeCompare(right));

  const rows = paths
    .filter(
      (path) =>
        stableJsonStringify(oldValues.get(path)) !==
        stableJsonStringify(newValues.get(path)),
    )
    .map((path) =>
      toAuditLogDiffRow(params.entityType, path, oldValues, newValues),
    );

  // Keep one folded row, at the sorted position of the first content path.
  return rows.filter(
    (row, index) =>
      row.kind === 'value' ||
      rows.findIndex((candidate) => candidate.kind === 'formattedContent') ===
        index,
  );
};
