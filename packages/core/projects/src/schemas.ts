import { type Static, Type as T } from "@sinclair/typebox";
import { Elysia, t } from "elysia";

import { db } from "./database/model.ts";
import { projectErrors } from "./errors.ts";

const UUID_SOURCE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
export const PROJECT_LOGIC_UUID_SCHEMA_TITLE = "ProjectLogicUuid";
export const UuidSchema = T.String({
  pattern: UUID_SOURCE,
  title: PROJECT_LOGIC_UUID_SCHEMA_TITLE,
});
const DateSchema = T.String({ format: "date" });
const DateTimeSchema = T.String({ minLength: 1 });
const NullableString = T.Union([T.String(), T.Null()]);
const NullableUuid = T.Union([UuidSchema, T.Null()]);

export const ProjectInternalStatusSchema = T.Union([
  T.Literal("IN_CREATION"),
  T.Literal("UPLOAD_DOCUMENTS"),
  T.Literal("OPEN"),
  T.Literal("IN_PROGRESS"),
  T.Literal("COMPLETED"),
]);

export const GermanStateSchema = t.UnionEnum([
  "Bayern",
  "Baden-Württemberg",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
]);

const { applicants, deadlines, projects, topics } = db.insert;
const applicantSelect = db.select.applicants;
const applicantUpdate = db.update.applicants;
const projectUpdate = db.update.projects;
const topicUpdate = db.update.topics;
const deadlineUpdate = db.update.deadlines;

const ApplicantResponseFields = {
  salutation: applicantSelect.salutation,
  company: applicantSelect.company,
  firstName: applicantSelect.firstName,
  lastName: applicantSelect.lastName,
  street: applicantSelect.street,
  houseNumber: applicantSelect.houseNumber,
  addressSupplement: applicantSelect.addressSupplement,
  plz: applicantSelect.plz,
  location: applicantSelect.location,
  country: applicantSelect.country,
  email: applicantSelect.email,
  phone: applicantSelect.phone,
  fax: applicantSelect.fax,
};

const ApplicantInsertFields = {
  salutation: applicants.salutation,
  company: applicants.company,
  firstName: applicants.firstName,
  lastName: applicants.lastName,
  street: applicants.street,
  houseNumber: applicants.houseNumber,
  addressSupplement: applicants.addressSupplement,
  plz: applicants.plz,
  location: applicants.location,
  country: applicants.country,
  email: applicants.email,
  phone: applicants.phone,
  fax: applicants.fax,
};

const ApplicantWriteFields = {
  salutation: applicantUpdate.salutation,
  company: applicantUpdate.company,
  firstName: applicantUpdate.firstName,
  lastName: applicantUpdate.lastName,
  street: applicantUpdate.street,
  houseNumber: applicantUpdate.houseNumber,
  addressSupplement: applicantUpdate.addressSupplement,
  plz: applicantUpdate.plz,
  location: applicantUpdate.location,
  country: applicantUpdate.country,
  email: applicantUpdate.email,
  phone: applicantUpdate.phone,
  fax: applicantUpdate.fax,
};

export const ApplicantResponseSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    projectVersion: T.Integer({ minimum: 1 }),
    ...ApplicantResponseFields,
  },
  { additionalProperties: false },
);

export const ProjectResponseSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String(),
    projectTypeId: UuidSchema,
    projectTypeName: T.String(),
    createdById: UuidSchema,
    entryDate: DateSchema,
    internalProjectNumber: T.String(),
    state: T.Union([GermanStateSchema, T.Null()]),
    imported: T.Union([T.Boolean(), T.Null()]),
    owners: T.Array(UuidSchema),
    members: T.Array(UuidSchema),
    auditors: T.Array(UuidSchema),
    ...ApplicantResponseFields,
    statusId: UuidSchema,
    statusName: T.String(),
    currentProcessStepId: NullableUuid,
    createdAt: DateTimeSchema,
    originalCreatedAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
    projectVersion: T.Integer({ minimum: 1 }),
    latestVersion: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const CreateProjectSchema = t.Object(
  {
    name: t.String(),
    projectTypeId: UuidSchema,
    createdById: t.Optional(t.Nullable(UuidSchema)),
    entryDate: DateSchema,
    internalProjectNumber: t.String(),
    state: t.Optional(t.Nullable(GermanStateSchema)),
    statusId: t.Optional(t.Nullable(UuidSchema)),
    imported: projects.imported,
    ...ApplicantInsertFields,
  },
  { additionalProperties: false },
);

export const UpdateProjectSchema = t.Object(
  {
    name: t.Optional(t.String()),
    projectTypeId: t.Optional(UuidSchema),
    entryDate: t.Optional(DateSchema),
    internalProjectNumber: t.Optional(t.String()),
    state: t.Optional(t.Nullable(GermanStateSchema)),
    currentProcessStepId: t.Optional(t.Nullable(UuidSchema)),
    ...ApplicantWriteFields,
  },
  { additionalProperties: false },
);

export const LegacyUpdateProjectSchema = t.Object(
  {
    ...UpdateProjectSchema.properties,
    name: projectUpdate.name,
    projectTypeId: t.Optional(t.Nullable(UuidSchema)),
    entryDate: t.Optional(t.Nullable(DateSchema)),
    internalProjectNumber: projectUpdate.internalProjectNumber,
  },
  { additionalProperties: false },
);

export const UpdateProjectStatusSchema = T.Object(
  { internalName: ProjectInternalStatusSchema },
  { additionalProperties: false },
);

const plsEnumModels = new Elysia({ name: "project-logic.models" }).model({
  GermanState: GermanStateSchema,
});

const plsResourceModels = plsEnumModels.model({
  ProjectResponse: t.Object(
    {
      ...ProjectResponseSchema.properties,
      state: t.Nullable(plsEnumModels.Ref("GermanState")),
    },
    { additionalProperties: false },
  ),
  CreateProjectRequest: t.Object(
    {
      ...CreateProjectSchema.properties,
      state: t.Optional(t.Nullable(plsEnumModels.Ref("GermanState"))),
    },
    { additionalProperties: false },
  ),
  UpdateProjectRequest: t.Object(
    {
      ...LegacyUpdateProjectSchema.properties,
      state: t.Optional(t.Nullable(plsEnumModels.Ref("GermanState"))),
    },
    { additionalProperties: false },
  ),
});

export const plsModels = plsResourceModels.model({
  ProjectListResponse: t.Array(plsResourceModels.Ref("ProjectResponse")),
});
export const LatestVersionResponseSchema = T.Object(
  { projectId: UuidSchema, latestVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export const VersionLockValidationSchema = T.Object(
  {
    sourceVersion: T.Integer({ minimum: 1 }),
    targetVersion: T.Integer({ minimum: 1 }),
    lockToken: T.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export const WriteVersionValidationSchema = T.Object(
  { projectVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
export const InitializationResponseSchema = T.Object(
  {
    message: T.Union([T.String(), T.Null()]),
    workflowStatus: T.Union([
      T.Literal("PENDING"),
      T.Literal("RUNNING"),
      T.Literal("COMPLETED"),
      T.Literal("FAILED"),
      T.Literal("CANCELED"),
      T.Literal("TERMINATED"),
      T.Literal("CONTINUED_AS_NEW"),
      T.Literal("TIMED_OUT"),
    ]),
  },
  { additionalProperties: false },
);

export const TopicResponseSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    parentTopicId: NullableUuid,
    name: T.String(),
    description: NullableString,
    showInMvp: T.Boolean(),
    showInEwm: T.Boolean(),
    showInBeschluss: T.Boolean(),
    isDeleted: T.Boolean(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export const CreateTopicSchema = t.Object(
  {
    projectId: UuidSchema,
    name: t.String(),
    description: topics.description,
    parentTopicId: t.Optional(t.Nullable(UuidSchema)),
    showInMvp: T.Optional(topics.showInMvp),
    showInEwm: T.Optional(topics.showInEwm),
    showInBeschluss: T.Optional(topics.showInBeschluss),
  },
  { additionalProperties: false },
);
export const UpdateTopicSchema = t.Object(
  {
    name: t.String(),
    description: topicUpdate.description,
    parentTopicId: t.Optional(t.Nullable(UuidSchema)),
    showInMvp: topicUpdate.showInMvp,
    showInEwm: topicUpdate.showInEwm,
    showInBeschluss: topicUpdate.showInBeschluss,
  },
  { additionalProperties: false },
);
export const TopicNormStatusSchema = T.Union([
  T.Literal("unchecked"),
  T.Literal("checked"),
  T.Literal("needs_revision"),
]);
export const TopicNormResponseSchema = T.Object(
  {
    id: UuidSchema,
    topicId: UuidSchema,
    type: T.Union([T.Literal("pruefung"), T.Literal("verfahren")]),
    projectId: UuidSchema,
    projectVersion: T.Integer({ minimum: 1 }),
    jurabk: T.String(),
    paragraphNr: T.String(),
    absatz: NullableString,
    satz: NullableString,
    nummer: NullableString,
    mvpStatus: TopicNormStatusSchema,
    satzStatuses: T.Record(T.String(), TopicNormStatusSchema),
  },
  { additionalProperties: false },
);

export const DeadlineResponseSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    startAt: DateSchema,
    endAt: DateSchema,
    deadlineType: T.String(),
    legalBasis: NullableString,
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export const CreateDeadlineCommandSchema = t.Object(
  {
    startAt: DateSchema,
    endAt: DateSchema,
    deadlineType: t.String(),
    legalBasis: deadlines.legalBasis,
  },
  { additionalProperties: false },
);
export const CreateDeadlineSchema = t.Object(
  {
    projectId: UuidSchema,
    ...CreateDeadlineCommandSchema.properties,
  },
  { additionalProperties: false },
);
export const UpdateDeadlineSchema = t.Object(
  {
    startAt: t.Optional(DateSchema),
    endAt: t.Optional(DateSchema),
    deadlineType: t.Optional(t.String()),
    legalBasis: deadlineUpdate.legalBasis,
  },
  { additionalProperties: false },
);

export function assertDeadlineRange(input: {
  readonly startAt: string | null | undefined;
  readonly endAt: string | null | undefined;
}): void {
  if (
    input.startAt !== null &&
    input.startAt !== undefined &&
    input.endAt !== null &&
    input.endAt !== undefined &&
    input.startAt > input.endAt
  ) {
    throw projectErrors.INVALID_REQUEST({
      message: "startAt must be less than or equal to endAt",
    });
  }
}

export const ProjectTypeResponseSchema = T.Object(
  { id: UuidSchema, name: T.String(), active: T.Boolean() },
  { additionalProperties: false },
);
export const CreateProjectTypeSchema = T.Object(
  { name: T.String({ minLength: 1, maxLength: 255 }) },
  { additionalProperties: false },
);
export const UpdateProjectTypeSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String({ minLength: 1, maxLength: 255 }),
    active: T.Optional(T.Boolean()),
  },
  { additionalProperties: false },
);
export const ProjectStatusResponseSchema = T.Object(
  { id: UuidSchema, name: T.String(), internalName: T.String() },
  { additionalProperties: false },
);
export const ProcessStepResponseSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String(),
    projectTypeId: UuidSchema,
    processStepIndex: T.Integer(),
  },
  { additionalProperties: false },
);

export const IdParamsSchema = T.Object({ projectId: UuidSchema }, { additionalProperties: false });
export const ApplicantIdParamsSchema = T.Object(
  { projectId: UuidSchema, applicantId: UuidSchema },
  { additionalProperties: false },
);
export const ProjectTypeIdParamsSchema = T.Object(
  { projectTypeId: UuidSchema },
  { additionalProperties: false },
);
export const ProjectStatusIdParamsSchema = T.Object(
  { projectStatusId: UuidSchema },
  { additionalProperties: false },
);
export const TopicIdParamsSchema = T.Object(
  { topicId: UuidSchema },
  { additionalProperties: false },
);
export const DeadlineIdParamsSchema = T.Object(
  { deadlineId: UuidSchema },
  { additionalProperties: false },
);
export const ProcessStepIdParamsSchema = T.Object(
  { processStepId: UuidSchema },
  { additionalProperties: false },
);

export type CreateProject = Static<typeof CreateProjectSchema>;
export type ApplicantResponse = Static<typeof ApplicantResponseSchema>;
export type ProjectInternalStatus = Static<typeof ProjectInternalStatusSchema>;
export type UpdateProject = Static<typeof LegacyUpdateProjectSchema>;
export type CreateTopic = Static<typeof CreateTopicSchema>;
export type UpdateTopic = Static<typeof UpdateTopicSchema>;
export type CreateDeadline = Static<typeof CreateDeadlineSchema>;
export type UpdateDeadline = Static<typeof UpdateDeadlineSchema>;
export type ProjectResponse = Static<typeof ProjectResponseSchema>;
export type TopicResponse = Static<typeof TopicResponseSchema>;
export type DeadlineResponse = Static<typeof DeadlineResponseSchema>;
