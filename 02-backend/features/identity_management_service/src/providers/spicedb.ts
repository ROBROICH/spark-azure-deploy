import { v1 } from "@authzed/authzed-node";
import { readFileSync } from "node:fs";
import { Result } from "better-result";
import { Redacted } from "effect";

import { identityErrors } from "../errors";

export type AssignmentRelation = "owner" | "member" | "auditor";

export interface RelationshipItem {
  relation: AssignmentRelation;
  userId: string;
}

export interface ProjectRelations {
  owner: string[];
  member: string[];
}

export interface SpiceDbTransport {
  readonly promises: Pick<
    v1.ZedPromiseClientInterface,
    "diffSchema" | "readRelationships" | "readSchema" | "writeRelationships" | "writeSchema"
  >;
  close(): void;
}

interface SpiceDbClientOptions {
  endpoint: string;
  token: Redacted.Redacted<string>;
  bulkChunkSize?: number;
  certPath?: string;
  insecure?: boolean;
  transport?: SpiceDbTransport;
}

const fullyConsistent = () =>
  v1.Consistency.create({
    requirement: {
      oneofKind: "fullyConsistent",
      fullyConsistent: true,
    },
  });

const relationship = (projectId: string, item: RelationshipItem) =>
  v1.Relationship.create({
    resource: v1.ObjectReference.create({ objectType: "project", objectId: projectId }),
    relation: item.relation,
    subject: v1.SubjectReference.create({
      object: v1.ObjectReference.create({ objectType: "user", objectId: item.userId }),
    }),
  });

export class SpiceDbClient {
  private readonly bulkChunkSize: number;
  private readonly client: SpiceDbTransport;
  private closed = false;

  constructor(options: SpiceDbClientOptions) {
    this.bulkChunkSize = options.bulkChunkSize ?? 1_000;
    if (!Number.isInteger(this.bulkChunkSize) || this.bulkChunkSize < 1) {
      throw new RangeError("SpiceDB bulk chunk size must be a positive integer");
    }
    this.client =
      options.transport ??
      (!options.insecure && options.certPath
        ? v1.NewClientWithCustomCert(
            Redacted.value(options.token),
            options.endpoint,
            readFileSync(options.certPath),
          )
        : v1.NewClient(
            Redacted.value(options.token),
            options.endpoint,
            options.insecure
              ? v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS
              : v1.ClientSecurity.SECURE,
          ));
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("SpiceDB client is closed");
  }

  async listProjectRelations(projectId: string) {
    this.assertOpen();
    return Result.tryPromise({
      try: async () => {
        const result: ProjectRelations = { owner: [], member: [] };
        for (const relation of ["owner", "member"] satisfies (keyof ProjectRelations)[]) {
          const responses = await this.client.promises.readRelationships(
            v1.ReadRelationshipsRequest.create({
              consistency: fullyConsistent(),
              relationshipFilter: v1.RelationshipFilter.create({
                resourceType: "project",
                optionalResourceId: projectId,
                optionalRelation: relation,
              }),
            }),
          );
          for (const response of responses) {
            const current = response.relationship;
            if (
              current?.resource?.objectId === projectId &&
              current.relation === relation &&
              current.subject?.object?.objectType === "user" &&
              current.subject.object.objectId
            ) {
              result[relation].push(current.subject.object.objectId);
            }
          }
          result[relation].sort();
        }
        return result;
      },
      catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "spicedb" } }),
    });
  }

  async updateProjectRelations(
    projectId: string,
    touch: readonly RelationshipItem[],
    remove: readonly RelationshipItem[],
  ) {
    this.assertOpen();
    const updates = [
      ...remove.map((item) =>
        v1.RelationshipUpdate.create({
          operation: v1.RelationshipUpdate_Operation.DELETE,
          relationship: relationship(projectId, item),
        }),
      ),
      ...touch.map((item) =>
        v1.RelationshipUpdate.create({
          operation: v1.RelationshipUpdate_Operation.TOUCH,
          relationship: relationship(projectId, item),
        }),
      ),
    ];
    if (updates.length === 0) return Result.ok(undefined);
    if (updates.length > this.bulkChunkSize) {
      return Result.err(identityErrors.ASSIGNMENT_REPLACEMENT_TOO_LARGE());
    }
    return Result.tryPromise({
      try: () =>
        this.client.promises.writeRelationships(v1.WriteRelationshipsRequest.create({ updates })),
      catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "spicedb" } }),
    });
  }

  writeSchema(schema: string) {
    this.assertOpen();
    return Result.tryPromise({
      try: () => this.client.promises.writeSchema(v1.WriteSchemaRequest.create({ schema })),
      catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "spicedb" } }),
    });
  }

  schemaMatches(schema: string) {
    this.assertOpen();
    return Result.tryPromise({
      try: async () => {
        const response = await this.client.promises.diffSchema(
          v1.DiffSchemaRequest.create({
            comparisonSchema: schema,
            consistency: fullyConsistent(),
          }),
        );
        return response.diffs.length === 0;
      },
      catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "spicedb" } }),
    });
  }

  ready() {
    this.assertOpen();
    return Result.tryPromise({
      try: () => this.client.promises.readSchema(v1.ReadSchemaRequest.create({})),
      catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "spicedb" } }),
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.client.close();
  }
}
