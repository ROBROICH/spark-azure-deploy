import { isDeepStrictEqual } from "node:util";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import { and, asc, eq, inArray } from "drizzle-orm";

import { nodeTableColumns, requireColumnBinding } from "./column-binding";
import type { NodeDatabase, NodeDefinition, NodeRuntime, NodeSchema } from "./descriptor";
import { nodeColumn } from "./descriptor";
import { InvalidNodeRequestError, NodeVersionError, UnknownNodeTypeError } from "./errors";
import {
  NodeDatabaseRowsSchema,
  NodeDatabaseValueSchema,
  type NodeDatabaseRow,
  type NodeJson,
} from "./values";

export interface CopyVersionNodeInput {
  readonly nodeType: string;
  readonly id: string;
  readonly setOutdated?: boolean;
  readonly overrides?: Readonly<{ [key: string]: NodeJson | undefined }>;
}

export interface MergedCopyVersionNode {
  readonly nodeType: string;
  readonly id: string;
  readonly setOutdated: boolean;
  readonly overrides: Readonly<{ [key: string]: NodeJson | undefined }>;
}

const COPY_INSERT_MAXIMUM_ROWS = 500;
const COPY_INSERT_MAXIMUM_PARAMETERS = 32_000;
const COPY_READ_MAXIMUM_IDS = 32_000;

export function mergeCopyVersionDirectives(nodes: readonly CopyVersionNodeInput[]) {
  const merged = new Map<string, MergedCopyVersionNode>();
  for (const node of nodes) {
    const key = `${node.nodeType}\u0000${node.id}`;
    const existing = merged.get(key);
    const overrides = { ...existing?.overrides };
    for (const [field, value] of Object.entries(node.overrides ?? {})) {
      if (field in overrides && !isDeepStrictEqual(overrides[field], value)) {
        return Result.err(
          NodeVersionError({
            internal: {
              message: `Conflicting copy-version override for ${node.nodeType}:${node.id}`,
            },
          }),
        );
      }
      overrides[field] = value;
    }
    merged.set(key, {
      nodeType: node.nodeType,
      id: node.id,
      setOutdated: Boolean(existing?.setOutdated || node.setOutdated),
      overrides,
    });
  }
  return Result.ok(
    [...merged.values()].sort(
      (left, right) =>
        left.nodeType.localeCompare(right.nodeType) || left.id.localeCompare(right.id),
    ),
  );
}

export function orderedVersionNodes(
  nodes: readonly NodeDefinition[],
  operation: "copy" | "delete",
): NodeDefinition[] {
  const byType = new Map(nodes.map((node) => [node.nodeType, node]));
  const parentsByType = new Map(
    nodes.map((node) => [
      node.nodeType,
      new Set(
        node.parents.flatMap((parent) =>
          parent.kind === "persisted" &&
          parent.nodeType !== node.nodeType &&
          byType.has(parent.nodeType)
            ? [parent.nodeType]
            : [],
        ),
      ),
    ]),
  );
  const childrenByType = new Map(nodes.map((node) => [node.nodeType, new Set<string>()]));
  for (const [child, parents] of parentsByType) {
    for (const parent of parents) childrenByType.get(parent)!.add(child);
  }

  const ready = nodes
    .filter((node) => parentsByType.get(node.nodeType)!.size === 0)
    .map(({ nodeType }) => nodeType)
    .sort();
  const ordered: NodeDefinition[] = [];
  while (ready.length > 0) {
    const nodeType = ready.shift()!;
    const node = byType.get(nodeType)!;
    ordered.push(node);
    for (const child of [...childrenByType.get(nodeType)!].sort()) {
      const parents = parentsByType.get(child)!;
      parents.delete(nodeType);
      if (parents.size === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }

  const visited = new Set(ordered.map(({ nodeType }) => nodeType));
  const remaining = nodes
    .filter(({ nodeType }) => !visited.has(nodeType))
    .sort((left, right) => left.nodeType.localeCompare(right.nodeType));
  if (operation === "delete" && remaining.length > 0) {
    throw new Error(`Cycle detected in node rollback dependencies at ${remaining[0]!.nodeType}`);
  }
  ordered.push(...remaining);
  return operation === "copy" ? ordered : ordered.reverse();
}

export interface CopyProjectVersionOptions<Schema extends NodeSchema> {
  readonly descriptor: NodeRuntime<Schema>;
  readonly projectId: string;
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly lockToken: string;
  readonly nodes: readonly CopyVersionNodeInput[];
  readonly dryRun: boolean;
}

const versionScope = (
  node: NodeDefinition,
  projectId: string,
  projectVersion: number,
  activeOnly: boolean,
) =>
  and(
    eq(nodeColumn(node, "projectId"), projectId),
    eq(nodeColumn(node, "projectVersion"), projectVersion),
    ...(activeOnly ? [eq(nodeColumn(node, "isDeleted"), false)] : []),
  );

const rowsForVersion = async <Schema extends NodeSchema>(
  database: NodeDatabase<Schema>,
  node: NodeDefinition,
  projectId: string,
  projectVersion: number,
  ids: readonly string[],
  activeOnly: boolean,
): Promise<NodeDatabaseRow[]> => {
  const rows: NodeDatabaseRow[] = [];
  for (let offset = 0; offset < ids.length; offset += COPY_READ_MAXIMUM_IDS) {
    rows.push(
      ...Value.Parse(
        NodeDatabaseRowsSchema,
        await database
          .select()
          .from(node.table)
          .where(
            and(
              versionScope(node, projectId, projectVersion, activeOnly),
              inArray(nodeColumn(node, "id"), ids.slice(offset, offset + COPY_READ_MAXIMUM_IDS)),
            ),
          )
          .orderBy(asc(nodeColumn(node, "id"))),
      ),
    );
  }
  return rows;
};

const validateOverrides = (
  node: NodeDefinition,
  overrides: Readonly<{ [key: string]: NodeJson | undefined }>,
) => {
  if (!Value.Check(node.schemas.patch, overrides)) {
    return Result.err(
      InvalidNodeRequestError({
        internal: {
          message: `Invalid copy-version overrides for '${node.nodeType}'`,
        },
      }),
    );
  }
  for (const field of Object.keys(overrides)) {
    if (field === "isOutdated" || !node.fields.includes(field)) {
      return Result.err(
        InvalidNodeRequestError({
          internal: {
            message: `Unknown or server-owned copy-version override '${node.nodeType}.${field}'`,
          },
        }),
      );
    }
  }
  return Result.ok(undefined);
};

const targetValues = (
  node: NodeDefinition,
  source: NodeDatabaseRow,
  directive: MergedCopyVersionNode,
  projectId: string,
  targetVersion: number,
  now: Date,
): NodeDatabaseRow => {
  const values: NodeDatabaseRow = {};
  const specialFields = new Map(
    ["projectId", "projectVersion", "isDeleted", "createdAt", "updatedAt", "isOutdated"].map(
      (field) => [requireColumnBinding(node, field).propertyKey, field],
    ),
  );
  const overrides = new Map(
    Object.entries(directive.overrides).map(([field, value]) => [
      requireColumnBinding(node, field).propertyKey,
      { field, value },
    ]),
  );
  for (const [propertyKey, column] of Object.entries(nodeTableColumns(node))) {
    const specialField = specialFields.get(propertyKey);
    const override = overrides.get(propertyKey);
    if (specialField === "projectId") {
      values[propertyKey] = projectId;
    } else if (specialField === "projectVersion") {
      values[propertyKey] = targetVersion;
    } else if (specialField === "isDeleted") {
      values[propertyKey] = false;
    } else if (specialField === "createdAt" || specialField === "updatedAt") {
      values[propertyKey] = now;
    } else if (specialField === "isOutdated") {
      const sourceValue = source[propertyKey];
      if (sourceValue === undefined) {
        throw new Error(`Source row for '${node.nodeType}' is missing field '${column.name}'`);
      }
      values[propertyKey] = directive.setOutdated ? true : sourceValue;
    } else if (override) {
      if (override.value === undefined) {
        throw new Error(`Copy override for '${node.nodeType}.${override.field}' is undefined`);
      }
      const parsed = Value.Parse(NodeDatabaseValueSchema, override.value);
      const convert = node.fieldRules?.[override.field]?.toDatabase;
      values[propertyKey] = convert ? convert(parsed) : parsed;
    } else {
      const sourceValue = source[propertyKey];
      if (sourceValue === undefined) {
        throw new Error(`Source row for '${node.nodeType}' is missing field '${column.name}'`);
      }
      values[propertyKey] = sourceValue;
    }
  }
  return values;
};

export async function copyProjectVersionNodes<Schema extends NodeSchema>(
  options: CopyProjectVersionOptions<Schema>,
) {
  const { descriptor, projectId, sourceVersion, targetVersion, lockToken, dryRun } = options;
  if (targetVersion <= sourceVersion) {
    return Result.err(
      InvalidNodeRequestError({
        message: "targetVersion must be greater than sourceVersion",
        internal: { sourceVersion, targetVersion },
      }),
    );
  }
  const merged = mergeCopyVersionDirectives(options.nodes);
  if (merged.isErr()) return merged;
  const directives = merged.value;
  const byNodeType = new Map<string, MergedCopyVersionNode[]>();
  for (const directive of directives) {
    const node = descriptor.nodes.find(({ nodeType }) => nodeType === directive.nodeType);
    if (!node) {
      return Result.err(UnknownNodeTypeError({ internal: { nodeType: directive.nodeType } }));
    }
    const overrideValidation = validateOverrides(node, directive.overrides);
    if (overrideValidation.isErr()) return overrideValidation;
    const group = byNodeType.get(directive.nodeType) ?? [];
    group.push(directive);
    byNodeType.set(directive.nodeType, group);
  }

  return descriptor.persistence.transact(() =>
    descriptor.persistence.query(async (database) => {
      const validation = await descriptor.versionPeer.validateVersionLock({
        projectId,
        sourceVersion,
        targetVersion,
        lockToken,
      });
      if (validation.isErr()) return validation;
      const orderedNodes = orderedVersionNodes(descriptor.nodes, "copy");
      const sourceRows = new Map<string, NodeDatabaseRow>();
      for (const node of orderedNodes) {
        const group = byNodeType.get(node.nodeType) ?? [];
        const rows = await rowsForVersion(
          database,
          node,
          projectId,
          sourceVersion,
          group.map(({ id }) => id),
          true,
        );
        const idPropertyKey = requireColumnBinding(node, "id").propertyKey;
        for (const row of rows) {
          const id = Value.Parse(Type.String(), row[idPropertyKey]);
          sourceRows.set(`${node.nodeType}\u0000${id}`, row);
        }
      }
      if (sourceRows.size !== directives.length) {
        return Result.err(
          InvalidNodeRequestError({
            message: "copy-version allow-list contains missing source nodes",
            internal: { requested: directives.length, found: sourceRows.size },
          }),
        );
      }

      let targetCount = 0;
      const targets: {
        readonly node: NodeDefinition;
        readonly group: readonly MergedCopyVersionNode[];
        readonly existing: readonly NodeDatabaseRow[];
      }[] = [];
      for (const node of orderedNodes) {
        const group = byNodeType.get(node.nodeType) ?? [];
        const existing = await rowsForVersion(
          database,
          node,
          projectId,
          targetVersion,
          group.map(({ id }) => id),
          false,
        );
        targetCount += existing.length;
        if (group.length > 0) targets.push({ node, group, existing });
      }
      if (targetCount > 0 && targetCount !== directives.length) {
        const message = `${targetCount} target rows already exist for project ${projectId} at projectVersion ${targetVersion}`;
        return Result.err(
          NodeVersionError({
            message,
            internal: { projectId, targetVersion, targetCount },
          }),
        );
      }
      if (!descriptor.validateCopy && (targetCount > 0 || dryRun)) {
        return Result.ok({ copied: directives.length });
      }

      const now = new Date();
      const copies = targets.map(({ node, group, existing }) => ({
        node,
        rows:
          targetCount > 0
            ? existing
            : group.map((directive) =>
                targetValues(
                  node,
                  sourceRows.get(`${node.nodeType}\u0000${directive.id}`)!,
                  directive,
                  projectId,
                  targetVersion,
                  now,
                ),
              ),
      }));
      if (descriptor.validateCopy) {
        const validated = await descriptor.validateCopy({
          projectId,
          sourceVersion,
          targetVersion,
          dryRun: dryRun && targetCount === 0,
          nodes: copies.map(({ node, rows }) => ({ nodeType: node.nodeType, rows })),
        });
        if (validated.isErr()) return validated;
      }
      if (targetCount > 0 || dryRun) return Result.ok({ copied: directives.length });

      for (const { node, rows: values } of copies) {
        const batchSize = Math.max(
          1,
          Math.min(
            COPY_INSERT_MAXIMUM_ROWS,
            Math.floor(COPY_INSERT_MAXIMUM_PARAMETERS / Object.keys(values[0]!).length),
          ),
        );
        const idColumn = requireColumnBinding(node, "id").column;
        let insertedCount = 0;
        for (let offset = 0; offset < values.length; offset += batchSize) {
          const inserted = await database
            .insert(node.table)
            .values(values.slice(offset, offset + batchSize))
            .returning({ id: idColumn });
          insertedCount += inserted.length;
        }
        if (insertedCount !== values.length) {
          throw new Error("Copy-version batch affected fewer rows than expected");
        }
      }
      return Result.ok({ copied: directives.length });
    }),
  );
}

export interface UndoProjectVersionOptions<Schema extends NodeSchema> {
  readonly descriptor: NodeRuntime<Schema>;
  readonly projectId: string;
  readonly targetVersion: number;
  readonly lockToken: string;
}

export async function undoProjectVersionNodes<Schema extends NodeSchema>({
  descriptor,
  projectId,
  targetVersion,
  lockToken,
}: UndoProjectVersionOptions<Schema>): Promise<{ deleted: Record<string, number> }> {
  return descriptor.persistence.transact(() =>
    descriptor.persistence.query(async (database) => {
      const latest = await descriptor.versionPeer.resolveLatestVersion(projectId);
      if (latest.isErr()) throw latest.error;
      const validation = await descriptor.versionPeer.validateVersionLock({
        projectId,
        sourceVersion: latest.value,
        targetVersion,
        lockToken,
      });
      if (validation.isErr()) throw validation.error;
      if (latest.value >= targetVersion) {
        const message = "undo-version requires latest version to be lower than targetVersion";
        throw NodeVersionError({ message, internal: { message } });
      }
      const deleted = Object.fromEntries(
        [...descriptor.nodes]
          .sort((left, right) => left.nodeType.localeCompare(right.nodeType))
          .map(({ nodeType }) => [nodeType, 0]),
      );
      for (const node of orderedVersionNodes(descriptor.nodes, "delete")) {
        const rows = await database
          .delete(node.table)
          .where(versionScope(node, projectId, targetVersion, false))
          .returning();
        deleted[node.nodeType] = rows.length;
      }
      return { deleted };
    }),
  );
}
