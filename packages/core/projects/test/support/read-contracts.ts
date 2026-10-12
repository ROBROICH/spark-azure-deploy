import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

const UUID_SOURCE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
export const UuidSchema = T.String({ pattern: UUID_SOURCE });
const DateSchema = T.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" });
const DateTimeSchema = T.String({ minLength: 1 });
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const NullableBooleanSchema = T.Union([T.Boolean(), T.Null()]);

const ValidationErrorItemSchema = T.Object(
  {
    type: T.String(),
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String(),
  },
  { additionalProperties: true },
);

export const ErrorResponseSchema = T.Object(
  { detail: T.Union([T.String(), T.Array(ValidationErrorItemSchema)]) },
  { additionalProperties: false },
);

export function parseErrorContract(value: HttpJson): Static<typeof ErrorResponseSchema> {
  const parsed = parseReadContract(ErrorResponseSchema, value);
  if (Array.isArray(parsed.detail)) return parsed;
  const [meaningfulDetail] = parsed.detail.split('\n\n  File "', 1);
  return { detail: (meaningfulDetail ?? parsed.detail).replaceAll("\n", "\\n") };
}

export const ProbeSchema = T.Object({ status: T.Literal("ok") }, { additionalProperties: false });

export const TopicSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    parentTopicId: NullableUuidSchema,
    name: T.String(),
    description: NullableStringSchema,
    showInMvp: T.Boolean(),
    showInEwm: T.Boolean(),
    showInBeschluss: T.Boolean(),
    isDeleted: T.Boolean(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export const TopicsSchema = T.Array(TopicSchema);

const TopicNormStatusSchema = T.Union([
  T.Literal("unchecked"),
  T.Literal("checked"),
  T.Literal("needs_revision"),
]);
export const TopicNormSchema = T.Object(
  {
    id: UuidSchema,
    topicId: UuidSchema,
    type: T.Union([T.Literal("pruefung"), T.Literal("verfahren")]),
    projectId: UuidSchema,
    projectVersion: T.Integer({ minimum: 1 }),
    jurabk: T.String(),
    paragraphNr: T.String(),
    absatz: NullableStringSchema,
    satz: NullableStringSchema,
    nummer: NullableStringSchema,
    mvpStatus: TopicNormStatusSchema,
    satzStatuses: T.Record(T.String(), TopicNormStatusSchema),
  },
  { additionalProperties: false },
);
export const TopicNormsSchema = T.Array(TopicNormSchema);

export const DeadlineSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    startAt: DateSchema,
    endAt: DateSchema,
    deadlineType: T.String(),
    legalBasis: NullableStringSchema,
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export const DeadlinesSchema = T.Array(DeadlineSchema);

export const ProjectStatusSchema = T.Object(
  { id: UuidSchema, name: T.String(), internalName: T.String() },
  { additionalProperties: false },
);
export const ProjectStatusesSchema = T.Array(ProjectStatusSchema);

export const ProcessStepSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String(),
    projectTypeId: UuidSchema,
    processStepIndex: T.Integer(),
  },
  { additionalProperties: false },
);
export const ProcessStepsSchema = T.Array(ProcessStepSchema);

export const ProjectTypeSchema = T.Object(
  { id: UuidSchema, name: T.String(), active: T.Boolean() },
  { additionalProperties: false },
);
export const ProjectTypesSchema = T.Array(ProjectTypeSchema);

const GermanStateSchema = T.Union([
  T.Literal("Bayern"),
  T.Literal("Baden-Württemberg"),
  T.Literal("Berlin"),
  T.Literal("Brandenburg"),
  T.Literal("Bremen"),
  T.Literal("Hamburg"),
  T.Literal("Hessen"),
  T.Literal("Mecklenburg-Vorpommern"),
  T.Literal("Niedersachsen"),
  T.Literal("Nordrhein-Westfalen"),
  T.Literal("Rheinland-Pfalz"),
  T.Literal("Saarland"),
  T.Literal("Sachsen"),
  T.Literal("Sachsen-Anhalt"),
  T.Literal("Schleswig-Holstein"),
  T.Literal("Thüringen"),
]);

export const ProjectSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String(),
    projectTypeId: UuidSchema,
    projectTypeName: T.String(),
    createdById: UuidSchema,
    entryDate: DateSchema,
    internalProjectNumber: T.String(),
    state: T.Union([GermanStateSchema, T.Null()]),
    imported: NullableBooleanSchema,
    owners: T.Array(UuidSchema),
    members: T.Array(UuidSchema),
    auditors: T.Array(UuidSchema),
    salutation: NullableStringSchema,
    company: NullableStringSchema,
    firstName: NullableStringSchema,
    lastName: NullableStringSchema,
    street: NullableStringSchema,
    houseNumber: NullableStringSchema,
    addressSupplement: NullableStringSchema,
    plz: NullableStringSchema,
    location: NullableStringSchema,
    country: NullableStringSchema,
    email: NullableStringSchema,
    phone: NullableStringSchema,
    fax: NullableStringSchema,
    statusId: UuidSchema,
    statusName: T.String(),
    currentProcessStepId: NullableUuidSchema,
    createdAt: DateTimeSchema,
    originalCreatedAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    projectVersion: T.Integer({ minimum: 1 }),
    latestVersion: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export const ProjectsSchema = T.Array(ProjectSchema);

export const LatestVersionSchema = T.Object(
  { projectId: UuidSchema, latestVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);

const NodeTypes = ["deadline", "subtopic", "topic", "topic_norm"] as const;
const NodeTypeSchema = T.Union(NodeTypes.map((nodeType) => T.Literal(nodeType)));
const ParentReferenceSchema = T.Object(
  { id: UuidSchema, nodeType: NodeTypeSchema },
  { additionalProperties: false },
);

export const NodeListSchema = T.Object(
  {
    nodes: T.Array(
      T.Object(
        {
          id: UuidSchema,
          nodeType: NodeTypeSchema,
          parents: T.Array(ParentReferenceSchema),
          frontendParentIds: T.Array(T.String()),
          isOutdated: T.Boolean(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const CommonNodeFields = {
  id: UuidSchema,
  projectId: UuidSchema,
  isDeleted: T.Boolean(),
  isOutdated: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  projectVersion: T.Integer({ minimum: 1 }),
  updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
};

const DeadlineNodeSchema = T.Object(
  {
    nodeType: T.Literal("deadline"),
    startAt: DateSchema,
    endAt: DateSchema,
    deadlineType: T.String(),
    legalBasis: NullableStringSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const TopicNodeFields = {
  name: T.String(),
  showInMvp: T.Boolean(),
  showInEwm: T.Boolean(),
  showInBeschluss: T.Boolean(),
  description: NullableStringSchema,
};
const TopicNodeSchema = T.Object(
  {
    nodeType: T.Literal("topic"),
    ...TopicNodeFields,
    parentTopicId: NullableUuidSchema,
    mvpAssignee: NullableUuidSchema,
    rpbAssignee: NullableUuidSchema,
    mvpAssignees: T.Array(UuidSchema),
    rpbAssignees: T.Array(UuidSchema),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const SubtopicNodeSchema = T.Object(
  {
    nodeType: T.Literal("subtopic"),
    ...TopicNodeFields,
    topicId: UuidSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const TopicNormNodeSchema = T.Object(
  {
    nodeType: T.Literal("topic_norm"),
    jurabk: T.String(),
    paragraphNr: NullableStringSchema,
    satz: NullableStringSchema,
    absatz: NullableStringSchema,
    nummer: NullableStringSchema,
    topicId: UuidSchema,
    type: T.Union([T.Literal("pruefung"), T.Literal("verfahren")]),
    mvpStatus: TopicNormStatusSchema,
    satzStatuses: T.Record(T.String(), TopicNormStatusSchema),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);

export const BatchNodesResponseSchema = T.Object(
  {
    results: T.Array(
      T.Union([DeadlineNodeSchema, SubtopicNodeSchema, TopicNodeSchema, TopicNormNodeSchema]),
    ),
  },
  { additionalProperties: false },
);

export type NodeType = (typeof NodeTypes)[number];

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
