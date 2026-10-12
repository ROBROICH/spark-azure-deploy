import { Type, type Static, type TLiteral, type TSchema } from "@sinclair/typebox";

import type { NodeContractSource, NodeDefinition } from "./descriptor";
import "./formats";

const closedObject = <T extends { [K in keyof T]: TSchema }>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

export const nodeTypeLiteral = <const T extends string>(value: T) =>
  Type.Literal(value, { enum: [value] });

const payloadProperties = (payload: TSchema): Record<string, TSchema> => {
  const properties = (payload as { properties?: Record<string, TSchema> }).properties;
  if (properties === undefined) {
    throw new TypeError("Node payload schema must be an object");
  }
  const { nodeType: _nodeType, ...rest } = properties;
  return rest;
};

const nodeVariant = (node: NodeDefinition, payload: TSchema) =>
  closedObject({
    nodeType: nodeTypeLiteral(node.nodeType),
    ...payloadProperties(payload),
  });

const literalUnion = <T extends TLiteral<string>>(variants: readonly T[]) => {
  if (variants.length === 0) {
    throw new TypeError("A node descriptor must contain at least one node type");
  }
  if (variants.length === 1) return variants[0]!;
  return Type.Union(variants as [T, T, ...T[]]);
};

const schemaUnion = <T extends TSchema>(variants: readonly T[]) => {
  if (variants.length === 0) {
    throw new TypeError("A node descriptor must contain at least one node type");
  }
  if (variants.length === 1) return variants[0]!;
  return Type.Union(variants as [T, T, ...T[]]);
};

const pascalIdentifier = (value: string) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");

export function nodeContractPrefix(descriptor: NodeContractSource) {
  return `V1${pascalIdentifier(descriptor.name)}`;
}

export function nodeOperationId(descriptor: NodeContractSource, operation: string) {
  const prefix = nodeContractPrefix(descriptor);
  return `${prefix.charAt(0).toLowerCase()}${prefix.slice(1)}${operation}`;
}

export function nodeResponseModelName(descriptor: NodeContractSource, nodeType: string) {
  const pascal = pascalIdentifier(nodeType);
  const name = pascal.endsWith("Node") ? `${pascal}Response` : `${pascal}NodeResponse`;
  return `${nodeContractPrefix(descriptor)}${name}`;
}

const contractModelName = (descriptor: NodeContractSource, name: string) =>
  `${nodeContractPrefix(descriptor)}${name}`;

export function buildNodeContracts(descriptor: NodeContractSource) {
  const sorted = [...descriptor.nodes].sort((left, right) =>
    left.nodeType.localeCompare(right.nodeType),
  );
  const nodeType = literalUnion(sorted.map(({ nodeType }) => nodeTypeLiteral(nodeType)));
  const nodeRef = closedObject({
    nodeType,
    id: Type.String({ format: "uuid" }),
  });
  const parentTypes = [
    ...new Set([
      ...sorted.map(({ nodeType }) => nodeType),
      ...sorted.flatMap(({ parents }) => parents.map(({ nodeType }) => nodeType)),
    ]),
  ].sort();
  const parentRef = closedObject({
    nodeType: literalUnion(parentTypes.map((value) => nodeTypeLiteral(value))),
    id: Type.String({ minLength: 1 }),
  });
  const nodeSummary = closedObject({
    id: Type.String({ format: "uuid" }),
    nodeType,
    parents: Type.Array(parentRef),
    frontendParentIds: Type.Array(Type.String()),
    isOutdated: Type.Boolean(),
  });
  const nodeModels = Object.fromEntries(
    sorted.map((node) => [
      nodeResponseModelName(descriptor, node.nodeType),
      nodeVariant(node, node.schemas.response),
    ]),
  );
  const response = schemaUnion(Object.values(nodeModels));
  const responseRef = schemaUnion(
    sorted.map((node) => Type.Ref(nodeResponseModelName(descriptor, node.nodeType))),
  );
  const insertAction = schemaUnion(
    sorted.map((node) =>
      closedObject({
        nodeType: nodeTypeLiteral(node.nodeType),
        id: Type.Optional(Type.String({ format: "uuid" })),
        payload: node.schemas.insert,
      }),
    ),
  );
  const patchAction = schemaUnion(
    sorted.map((node) =>
      closedObject({
        nodeType: nodeTypeLiteral(node.nodeType),
        id: Type.String({ format: "uuid" }),
        payload: node.schemas.patch,
      }),
    ),
  );
  const mutationRequest = closedObject({
    inserts: Type.Optional(Type.Array(insertAction, { default: [] })),
    updates: Type.Optional(Type.Array(patchAction, { default: [] })),
    deletes: Type.Optional(Type.Array(nodeRef, { default: [] })),
  });
  const mutationResponse = closedObject({
    inserted: Type.Array(responseRef),
    updated: Type.Array(responseRef),
    deleted: Type.Array(nodeRef),
  });

  const listResponse = closedObject({ nodes: Type.Array(nodeSummary) });
  const batchRequest = closedObject({ nodes: Type.Array(nodeRef) });
  const batchResponse = closedObject({ results: Type.Array(responseRef) });

  const modelNames = {
    nodeRef: contractModelName(descriptor, "NodeRef"),
    parentRef: contractModelName(descriptor, "ParentRef"),
    nodeSummary: contractModelName(descriptor, "NodeSummary"),
    listResponse: contractModelName(descriptor, "NodesListResponse"),
    batchRequest: contractModelName(descriptor, "BatchGetNodesRequest"),
    batchResponse: contractModelName(descriptor, "BatchGetNodesResponse"),
    mutationRequest: contractModelName(descriptor, "ProcessNodeChangesRequest"),
    mutationResponse: contractModelName(descriptor, "ProcessNodeChangesResponse"),
  };

  return {
    nodeType,
    nodeRef,
    parentRef,
    nodeSummary,
    nodeResponse: response,
    listResponse,
    batchRequest,
    batchResponse,
    mutationRequest,
    mutationResponse,
    modelNames,
    openApiModels: {
      [modelNames.nodeRef]: nodeRef,
      [modelNames.parentRef]: parentRef,
      [modelNames.nodeSummary]: nodeSummary,
      [modelNames.listResponse]: listResponse,
      [modelNames.batchRequest]: batchRequest,
      [modelNames.batchResponse]: batchResponse,
      [modelNames.mutationRequest]: mutationRequest,
      [modelNames.mutationResponse]: mutationResponse,
      ...nodeModels,
    },
  };
}

export type NodeRef = Static<ReturnType<typeof buildNodeContracts>["nodeRef"]>;
