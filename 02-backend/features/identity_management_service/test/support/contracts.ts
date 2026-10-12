import {type Static, type TSchema, Type} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

import {ProjectAssignmentsRequest} from "../../src/routes/assignments";

export { ProjectAssignmentsRequest };

const IdentityRole = Type.Union([
  Type.Literal("admin"),
  Type.Literal("user"),
  Type.Literal("service"),
  Type.Null(),
]);
export const IdentityResponse = Type.Object(
  {
    userId: Type.String({ minLength: 1 }),
    email: Type.String({ minLength: 1 }),
    firstName: Type.Union([Type.String(), Type.Null()]),
    lastName: Type.Union([Type.String(), Type.Null()]),
    role: IdentityRole,
  },
  { additionalProperties: false },
);
export const IdentityListResponse = Type.Object(
  { users: Type.Array(IdentityResponse) },
  { additionalProperties: false },
);
export const RelationshipWriteResponse = Type.Object(
  { success: Type.Boolean() },
  { additionalProperties: false },
);
export const ErrorResponse = Type.Object(
  { detail: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export function parseContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}

const TokenName = Type.Union([
  Type.Literal("completeAdmin"),
  Type.Literal("optionalNamesUser"),
  Type.Literal("completeService"),
  Type.Literal("missingEmail"),
  Type.Literal("invalidCredential"),
  Type.Literal("unsupportedRole"),
]);
export const RuntimeTokenFixture = Type.Object(
  {
    completeAdmin: Type.String({ minLength: 1 }),
    optionalNamesUser: Type.String({ minLength: 1 }),
    completeService: Type.String({ minLength: 1 }),
    missingEmail: Type.String({ minLength: 1 }),
    invalidCredential: Type.String({ minLength: 1 }),
    unsupportedRole: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
const AuthClaim = Type.Object(
  {
    sub: Type.String({ pattern: "^[0-9a-f-]{36}$" }),
    email: Type.Optional(Type.String({ minLength: 1 })),
    givenName: Type.Optional(Type.String()),
    familyName: Type.Optional(Type.String()),
    roles: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  },
  { additionalProperties: false },
);
export const IdentityReadFixture = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    authClaims: Type.Object(
      {
        completeAdmin: AuthClaim,
        optionalNamesUser: AuthClaim,
        completeService: AuthClaim,
        missingEmail: AuthClaim,
        unsupportedRole: AuthClaim,
      },
      { additionalProperties: false },
    ),
    me: Type.Object(
      {
        cases: Type.Array(
          Type.Object(
            {
              id: Type.String({ minLength: 1 }),
              profile: Type.Union([Type.Literal("focused"), Type.Literal("bulk")]),
              token: Type.Optional(TokenName),
            },
            { additionalProperties: false },
          ),
          { minItems: 1 },
        ),
      },
      { additionalProperties: false },
    ),
    users: Type.Object(
      {
        listAll: Type.Object(
          {
            expectedCount: Type.Integer({ minimum: 1 }),
            expectedWithoutRole: Type.Integer({ minimum: 0 }),
            first: IdentityResponse,
            tail: Type.Array(IdentityResponse, { minItems: 1 }),
            excludedUserIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
          },
          { additionalProperties: false },
        ),
        search: Type.Object(
          { query: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
        noMatch: Type.Object(
          { query: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
        providerError: Type.Object(
          { query: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type IdentityReadFixture = Static<typeof IdentityReadFixture>;

const ExpectedMutation = Type.Object(
  {
    status: Type.Integer({ minimum: 100, maximum: 599 }),
    body: Type.Union([RelationshipWriteResponse, ErrorResponse]),
  },
  { additionalProperties: false },
);
const ExpectedRelations = Type.Object(
  {
    owner: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    member: Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
  },
  { additionalProperties: false },
);
const AssignmentScenario = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    profile: Type.Union([
      Type.Literal("bulk-fixture"),
      Type.Literal("focused-real"),
      Type.Literal("focused-unavailable"),
    ]),
    actor: Type.Union([Type.Literal("primary"), Type.Literal("secondary")]),
    request: ProjectAssignmentsRequest,
    expected: ExpectedMutation,
    expectedRelations: Type.Optional(ExpectedRelations),
  },
  { additionalProperties: false },
);
export const IdentityMutationFixture = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    assignments: Type.Array(AssignmentScenario, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type IdentityMutationFixture = Static<typeof IdentityMutationFixture>;

const GeneratedUserPage = Type.Object(
  {
    start: Type.Integer({ minimum: 0 }),
    count: Type.Integer({ minimum: 1, maximum: 100 }),
  },
  { additionalProperties: false },
);
const ProviderResponse = Type.Union([
  Type.Object(
    { status: Type.Integer({ minimum: 100, maximum: 599 }), json: Type.Unknown() },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Integer({ minimum: 100, maximum: 599 }),
      runtimeAccessToken: Type.Literal(true),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      status: Type.Integer({ minimum: 100, maximum: 599 }),
      generatedUserPage: GeneratedUserPage,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { status: Type.Integer({ minimum: 100, maximum: 599 }) },
    { additionalProperties: false },
  ),
]);
const ProviderCall = Type.Object(
  {
    method: Type.Union([Type.Literal("GET"), Type.Literal("POST"), Type.Literal("DELETE")]),
    path: Type.String({ pattern: "^/" }),
    query: Type.Optional(Type.Record(Type.String(), Type.String())),
    form: Type.Optional(Type.Record(Type.String(), Type.String())),
    requiresAuthorization: Type.Optional(Type.Boolean()),
    json: Type.Optional(Type.Unknown()),
    response: ProviderResponse,
  },
  { additionalProperties: false },
);
const Scenario = Type.Object(
  { calls: Type.Array(ProviderCall, { minItems: 1 }) },
  { additionalProperties: false },
);
export const KeycloakAdminFixture = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    realm: Type.String({ minLength: 1 }),
    clientId: Type.String({ minLength: 1 }),
    scenarios: Type.Object(
      {
        listUsers: Scenario,
        searchUsers: Scenario,
        readUsers: Scenario,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type KeycloakAdminFixture = Static<typeof KeycloakAdminFixture>;

export const loadIdentityReadFixture = async (): Promise<IdentityReadFixture> =>
  parseContract(
    IdentityReadFixture,
    await Bun.file(new URL("../../fixtures/read-scenarios.json", import.meta.url)).json(),
  );
export const loadIdentityMutationFixture = async (): Promise<IdentityMutationFixture> =>
  parseContract(
    IdentityMutationFixture,
    await Bun.file(new URL("../../fixtures/mutation-scenarios.json", import.meta.url)).json(),
  );
export const loadKeycloakAdminFixture = async (): Promise<KeycloakAdminFixture> =>
  parseContract(
    KeycloakAdminFixture,
    await Bun.file(new URL("../../fixtures/keycloak-admin.json", import.meta.url)).json(),
  );
