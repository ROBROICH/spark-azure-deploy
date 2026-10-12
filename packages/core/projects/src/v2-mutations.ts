import {
  batchNodes,
  executeNodeMutation,
  NodeNotFoundError,
  type NodeBase,
  type NodeJson,
  type NodeRuntime,
  type RequestAuthorization,
} from "@spark-workflow/node-crud";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { and, eq, isNull, ne, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { projectLogicSchema, topicNorms } from "./db/schema.ts";
import { projectErrors } from "./errors.ts";

type ProjectNodeRuntime = NodeRuntime<typeof projectLogicSchema>;
type ProjectNodeType = "deadline" | "topic" | "subtopic" | "topic_norm";
type Payload = Readonly<Record<string, NodeJson | undefined>>;
const StringSchema = Type.String();

export type ProjectV2Mutation =
  | { readonly action: "create"; readonly nodeType: ProjectNodeType; readonly body: Payload }
  | {
      readonly action: "update";
      readonly nodeType: ProjectNodeType;
      readonly id: string;
      readonly body: Payload;
    }
  | { readonly action: "delete"; readonly nodeType: ProjectNodeType; readonly id: string };

const value = (
  body: Payload,
  current: NodeBase | undefined,
  field: string,
): NodeJson | undefined => (body[field] === undefined ? current?.[field] : body[field]);

const stringValue = (candidate: NodeJson | undefined, field: string): string => {
  try {
    return Value.Parse(StringSchema, candidate);
  } catch {
    throw projectErrors.INVALID_REQUEST({ message: `${field} must be a string` });
  }
};

const nullableStringValue = (candidate: NodeJson | undefined, field: string): string | null => {
  if (candidate === null || candidate === undefined) return null;
  return stringValue(candidate, field);
};

async function requireNode(
  runtime: ProjectNodeRuntime,
  projectId: string,
  projectVersion: number,
  nodeType: ProjectNodeType,
  id: string,
): Promise<NodeBase> {
  const result = await batchNodes(runtime, projectId, projectVersion, [{ nodeType, id }]);
  const row = result.results[0];
  if (row === undefined) {
    throw NodeNotFoundError({ internal: { nodeType, projectId, projectVersion, id } });
  }
  return row;
}

const nullableEquals = (column: AnyPgColumn, candidate: string | null): SQL =>
  candidate === null ? isNull(column) : eq(column, candidate);

async function validateTopicNorm(
  runtime: ProjectNodeRuntime,
  projectId: string,
  projectVersion: number,
  mutation: ProjectV2Mutation,
  current: NodeBase | undefined,
): Promise<void> {
  if (mutation.action === "delete") return;
  const topicId = stringValue(value(mutation.body, current, "topicId"), "topicId");
  const jurabk = stringValue(value(mutation.body, current, "jurabk"), "jurabk");
  const paragraphNr = nullableStringValue(
    value(mutation.body, current, "paragraphNr"),
    "paragraphNr",
  );
  const satz = nullableStringValue(value(mutation.body, current, "satz"), "satz");
  const absatz = nullableStringValue(value(mutation.body, current, "absatz"), "absatz");
  const nummer = nullableStringValue(value(mutation.body, current, "nummer"), "nummer");
  const duplicate = await runtime.persistence.query((database) =>
    database
      .select({ id: topicNorms.id })
      .from(topicNorms)
      .where(
        and(
          eq(topicNorms.projectId, projectId),
          eq(topicNorms.projectVersion, projectVersion),
          eq(topicNorms.topicId, topicId),
          eq(topicNorms.jurabk, jurabk),
          nullableEquals(topicNorms.paragraphNr, paragraphNr),
          nullableEquals(topicNorms.satz, satz),
          nullableEquals(topicNorms.absatz, absatz),
          nullableEquals(topicNorms.nummer, nummer),
          eq(topicNorms.isDeleted, false),
          mutation.action === "update" ? ne(topicNorms.id, mutation.id) : undefined,
        ),
      )
      .limit(1),
  );
  if (duplicate.length > 0) {
    throw projectErrors.CONFLICT({ message: "Topic norm already exists" });
  }
}

async function validateMutation(
  runtime: ProjectNodeRuntime,
  projectId: string,
  projectVersion: number,
  mutation: ProjectV2Mutation,
): Promise<void> {
  const current =
    mutation.action === "create"
      ? undefined
      : await requireNode(runtime, projectId, projectVersion, mutation.nodeType, mutation.id);
  if (mutation.nodeType === "topic_norm") {
    await validateTopicNorm(runtime, projectId, projectVersion, mutation, current);
  }
}

export async function executeProjectV2Mutation(
  runtime: ProjectNodeRuntime,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  mutation: ProjectV2Mutation,
): Promise<NodeBase> {
  return runtime.persistence.transact(async () => {
    const admission = await runtime.versionPeer.validateWriteVersion(projectId, projectVersion);
    if (admission.isErr()) throw admission.error;
    await validateMutation(runtime, projectId, projectVersion, mutation);
    const input =
      mutation.action === "create"
        ? { inserts: [{ nodeType: mutation.nodeType, payload: mutation.body }] }
        : mutation.action === "update"
          ? { updates: [{ nodeType: mutation.nodeType, id: mutation.id, payload: mutation.body }] }
          : { deletes: [{ nodeType: mutation.nodeType, id: mutation.id }] };
    const result = await executeNodeMutation(
      runtime,
      auth,
      projectId,
      projectVersion,
      input,
    );
    if (result.isErr()) throw result.error;
    if (mutation.action === "create") {
      const row = result.value.inserted[0];
      if (row === undefined) {
        throw projectErrors.UNAVAILABLE({ message: "Project entity create returned no row" });
      }
      return row;
    }
    if (mutation.action === "delete") {
      const row = result.value.deleted[0];
      if (row === undefined) {
        throw projectErrors.UNAVAILABLE({ message: "Project entity delete returned no row" });
      }
      return row;
    }
    return (
      result.value.updated[0] ??
      requireNode(runtime, projectId, projectVersion, mutation.nodeType, mutation.id)
    );
  });
}
