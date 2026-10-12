import { describe, expect, test } from "bun:test";
import { v1 } from "@authzed/authzed-node";
import { EvlogError } from "evlog";
import { Redacted } from "effect";

import { SpiceDbClient, type SpiceDbTransport } from "../src/providers/spicedb.ts";

interface SpiceLedger {
  closed: number;
  diffs: v1.DiffSchemaRequest[];
  liveSchema?: string;
  reads: v1.ReadRelationshipsRequest[];
  schemas: string[];
  writes: v1.WriteRelationshipsRequest[];
}

interface FakeTransportOptions {
  failRead?: boolean;
}

const relationshipResponse = (projectId: string, relation: "owner" | "member", userId: string) =>
  v1.ReadRelationshipsResponse.create({
    relationship: v1.Relationship.create({
      resource: v1.ObjectReference.create({ objectType: "project", objectId: projectId }),
      relation,
      subject: v1.SubjectReference.create({
        object: v1.ObjectReference.create({ objectType: "user", objectId: userId }),
      }),
    }),
  });

const fakeTransport = (
  ledger: SpiceLedger,
  options: FakeTransportOptions = {},
): SpiceDbTransport => ({
    promises: {
      async readRelationships(request: v1.ReadRelationshipsRequest) {
        ledger.reads.push(request);
        if (options.failRead) throw new Error("provider response with secret-provider-detail");
        const relation = request.relationshipFilter?.optionalRelation;
        if (relation === "owner") {
          return [
            relationshipResponse("project-1", "owner", "owner-b"),
            relationshipResponse("project-1", "owner", "owner-a"),
            relationshipResponse("another-project", "owner", "ignored"),
          ];
        }
        return [relationshipResponse("project-1", "member", "member-a")];
      },
      async writeRelationships(request: v1.WriteRelationshipsRequest) {
        ledger.writes.push(request);
        return v1.WriteRelationshipsResponse.create({});
      },
      async writeSchema(request: v1.WriteSchemaRequest) {
        ledger.schemas.push(request.schema);
        ledger.liveSchema = request.schema;
        return v1.WriteSchemaResponse.create({});
      },
      async readSchema() {
        if (options.failRead) throw new Error("provider response with secret-provider-detail");
        return v1.ReadSchemaResponse.create({ schemaText: ledger.liveSchema ?? "" });
      },
      async diffSchema(request: v1.DiffSchemaRequest) {
        ledger.diffs.push(request);
        return v1.DiffSchemaResponse.create({
          diffs:
            request.comparisonSchema === ledger.liveSchema
              ? []
              : [v1.ReflectionSchemaDiff.create({})],
        });
      },
    },
    close() {
      ledger.closed += 1;
    },
  });

const createLedger = (liveSchema?: string): SpiceLedger => {
  const ledger: SpiceLedger = {
    closed: 0,
    diffs: [],
    reads: [],
    schemas: [],
    writes: [],
  };
  if (liveSchema !== undefined) ledger.liveSchema = liveSchema;
  return ledger;
};

const isFullyConsistent = (consistency: v1.Consistency | undefined): boolean =>
  consistency?.requirement.oneofKind === "fullyConsistent" &&
  consistency.requirement.fullyConsistent;

describe("SpiceDB adapter", () => {
  test("lists deterministic project relations and sends one mixed write at the request budget", async () => {
    const ledger = createLedger();
    const client = new SpiceDbClient({
      endpoint: "unused",
      token: Redacted.make("unused"),
      transport: fakeTransport(ledger),
      bulkChunkSize: 2,
    });

    expect((await client.listProjectRelations("project-1")).unwrap()).toEqual({
      owner: ["owner-a", "owner-b"],
      member: ["member-a"],
    });
    expect(ledger.reads.map((request) => request.relationshipFilter?.optionalRelation)).toEqual([
      "owner",
      "member",
    ]);

    (
      await client.updateProjectRelations(
        "project-1",
        [{ relation: "owner", userId: "owner-a" }],
        [{ relation: "member", userId: "member-stale" }],
      )
    ).unwrap();
    expect(ledger.writes).toHaveLength(1);
    expect(
      ledger.writes[0]?.updates.map((update) => ({
        operation: update.operation,
        relation: update.relationship?.relation,
        userId: update.relationship?.subject?.object?.objectId,
      })),
    ).toEqual([
      {
        operation: v1.RelationshipUpdate_Operation.DELETE,
        relation: "member",
        userId: "member-stale",
      },
      {
        operation: v1.RelationshipUpdate_Operation.TOUCH,
        relation: "owner",
        userId: "owner-a",
      },
    ]);

    (await client.writeSchema("definition user {}")).unwrap();
    expect(ledger.liveSchema).toBe("definition user {}");
    client.close();
    client.close();
    expect(ledger.closed).toBe(1);
  });

  test("compares the live schema with fully-consistent semantics", async () => {
    const knownLedger = createLedger("schema-002");
    const knownClient = new SpiceDbClient({
      endpoint: "unused",
      token: Redacted.make("unused"),
      transport: fakeTransport(knownLedger),
    });
    expect((await knownClient.schemaMatches("schema-002")).unwrap()).toBeTrue();
    expect((await knownClient.schemaMatches("schema-001")).unwrap()).toBeFalse();
    expect(knownLedger.diffs.every(({ consistency }) => isFullyConsistent(consistency))).toBeTrue();
    knownClient.close();
  });

  test("maps provider failures without exposing provider detail", async () => {
    const ledger = createLedger();
    const client = new SpiceDbClient({
      endpoint: "unused",
      token: Redacted.make("unused"),
      transport: fakeTransport(ledger, { failRead: true }),
    });

    const relationFailure = await client.listProjectRelations("project-1");
    if (relationFailure.isOk()) throw new Error("expected SpiceDB relationship failure");
    const error = relationFailure.error;

    expect(EvlogError.isEvlogError(error)).toBeTrue();
    expect(String(error)).not.toContain("secret-provider-detail");
    const readinessFailure = await client.ready();
    if (readinessFailure.isOk()) throw new Error("expected SpiceDB readiness failure");
    const readinessError = readinessFailure.error;
    expect(EvlogError.isEvlogError(readinessError)).toBeTrue();
    client.close();
  });

  test("rejects a replacement above the atomic request budget before any provider write", async () => {
    const ledger = createLedger();
    const client = new SpiceDbClient({
      endpoint: "unused",
      token: Redacted.make("unused"),
      bulkChunkSize: 2,
      transport: fakeTransport(ledger),
    });

    const result = await client.updateProjectRelations(
      "project-1",
      [{ relation: "owner", userId: "new-owner" }],
      [
        { relation: "owner", userId: "old-owner" },
        { relation: "member", userId: "old-member" },
      ],
    );

    expect(result.status).toBe("error");
    expect(result).toMatchObject({ error: { status: 413 } });
    expect(ledger.writes).toHaveLength(0);
    client.close();
  });

  test("rejects invalid bulk chunk sizes before constructing a provider client", () => {
    expect(
      () =>
        new SpiceDbClient({
          endpoint: "unused",
          token: Redacted.make("unused"),
          bulkChunkSize: 0,
          transport: fakeTransport(createLedger()),
        }),
    ).toThrow("positive integer");
  });
});
