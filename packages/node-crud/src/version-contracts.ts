import { Type, type TSchema } from "@sinclair/typebox";

import { nodeContractPrefix, nodeTypeLiteral } from "./contracts";
import type { NodeContractSource, NodeDefinition } from "./descriptor";
import "./formats";

const closedObject = <T extends { [K in keyof T]: TSchema }>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

const schemaUnion = <T extends TSchema>(variants: readonly T[]) => {
  if (variants.length === 0) {
    throw new TypeError("A node descriptor must contain at least one node type");
  }
  if (variants.length === 1) return variants[0]!;
  return Type.Union(variants as [T, T, ...T[]]);
};

const copyOverrides = (node: NodeDefinition) =>
  closedObject(
    Object.fromEntries(
      Object.entries(node.schemas.patch.properties).filter(([field]) => field !== "isOutdated"),
    ),
  );

export function buildNodeVersionContracts(descriptor: NodeContractSource) {
  const nodes = [...descriptor.nodes].sort((left, right) =>
    left.nodeType.localeCompare(right.nodeType),
  );
  const copyNode = schemaUnion(
    nodes.map((node) =>
      closedObject({
        nodeType: nodeTypeLiteral(node.nodeType),
        id: Type.String({ format: "uuid" }),
        setOutdated: Type.Optional(Type.Boolean({ default: false })),
        overrides: Type.Optional(copyOverrides(node)),
      }),
    ),
  );
  const deleted = closedObject(
    Object.fromEntries(nodes.map(({ nodeType }) => [nodeType, Type.Integer({ minimum: 0 })])),
  );

  const copyRequest = closedObject({
    sourceVersion: Type.Integer({ minimum: 1 }),
    targetVersion: Type.Integer({ minimum: 1 }),
    lockToken: Type.String({ minLength: 1 }),
    dryRun: Type.Boolean(),
    nodes: Type.Optional(Type.Array(copyNode, { default: [] })),
  });
  const copyResponse = closedObject({
    dryRun: Type.Boolean(),
    copied: Type.Integer({ minimum: 0 }),
  });
  const undoRequest = closedObject({
    targetVersion: Type.Integer({ minimum: 1 }),
    lockToken: Type.String({ minLength: 1 }),
  });
  const undoResponse = closedObject({ deleted });

  const prefix = nodeContractPrefix(descriptor);
  const modelNames = {
    copyNode: `${prefix}CopyVersionNode`,
    copyRequest: `${prefix}CopyVersionRequest`,
    copyResponse: `${prefix}CopyVersionResponse`,
    undoRequest: `${prefix}UndoVersionRequest`,
    undoResponse: `${prefix}UndoVersionResponse`,
  };

  return {
    copyRequest,
    copyResponse,
    undoRequest,
    undoResponse,
    modelNames,
    openApiModels: {
      [modelNames.copyNode]: copyNode,
      [modelNames.copyRequest]: copyRequest,
      [modelNames.copyResponse]: copyResponse,
      [modelNames.undoRequest]: undoRequest,
      [modelNames.undoResponse]: undoResponse,
    },
  };
}
