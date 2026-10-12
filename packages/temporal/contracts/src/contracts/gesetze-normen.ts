import { Type, type Static } from "@sinclair/typebox";

import { StringEnum, type WorkflowName } from "../registry.js";

export const GESETZE_NORMEN_TASK_QUEUE = "rechtliche_datenbanken" as const;
export const GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_WORKFLOW =
  "UpdateRechtsgrundlageWorkflow" as WorkflowName<"UpdateRechtsgrundlageWorkflow">;
export const GESETZE_NORMEN_UPDATE_RECHTSGRUNDLAGE_SOURCE_WORKFLOW =
  "UpdateRechtsgrundlageSource" as WorkflowName<"UpdateRechtsgrundlageSource">;

const sourceValues = { BUND: "bund", EU: "eu", BUNDESLAND: "bundesland" } as const;
const bundeslandValues = {
  BY: "Bayern",
  BW: "Baden-Württemberg",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
} as const;

const baseRelevantLaws = Type.Object({
  parser: Type.String(),
  extra: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
  baseUrl: Type.String({ format: "uri" }),
  gesetz: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()], { default: null })),
  verordnung: Type.Optional(
    Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
  ),
  richtlinie: Type.Optional(
    Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
  ),
  verwaltungsvorschrift: Type.Optional(
    Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
  ),
  technischeNorm: Type.Optional(
    Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
  ),
});

const contracts = Type.Module({
  GesetzeNormenSource: StringEnum(sourceValues),
  Bundesland: StringEnum(bundeslandValues),
  BaseRelevantLaws: baseRelevantLaws,
  StateRelevantLaws: Type.Intersect([
    Type.Ref("BaseRelevantLaws"),
    Type.Object({ name: Type.Ref("Bundesland") }),
  ]),
  RelevantLaws: Type.Object({
    eu: Type.Optional(Type.Union([Type.Ref("BaseRelevantLaws"), Type.Null()], { default: null })),
    bund: Type.Optional(Type.Union([Type.Ref("BaseRelevantLaws"), Type.Null()], { default: null })),
    bundesland: Type.Optional(
      Type.Union([Type.Ref("StateRelevantLaws"), Type.Null()], { default: null }),
    ),
    bundeslaender: Type.Optional(
      Type.Union([Type.Array(Type.Ref("StateRelevantLaws")), Type.Null()], { default: null }),
    ),
  }),
  UpdateRechtsgrundlageInput: Type.Object({
    pipelineConfig: Type.Ref("RelevantLaws"),
    overwrite: Type.Optional(Type.Boolean({ default: false })),
  }),
  UpdateRechtsgrundlageOutput: Type.Object({
    written: Type.Integer(),
    skipped: Type.Integer(),
  }),
  UpdateRechtsgrundlageSourceInput: Type.Object({
    source: Type.Ref("GesetzeNormenSource"),
    location: Type.Optional(Type.Union([Type.Ref("Bundesland"), Type.Null()], { default: null })),
    overwrite: Type.Optional(Type.Boolean({ default: false })),
    laws: Type.Ref("BaseRelevantLaws"),
  }),
  UpdateRechtsgrundlageSourceOutput: Type.Object({
    written: Type.Integer(),
    skipped: Type.Integer(),
  }),
});

export const GesetzeNormenSource = contracts.Import("GesetzeNormenSource");
export const Bundesland = contracts.Import("Bundesland");
export const BaseRelevantLaws = contracts.Import("BaseRelevantLaws");
export const StateRelevantLaws = contracts.Import("StateRelevantLaws");
export const RelevantLaws = contracts.Import("RelevantLaws");
export const UpdateRechtsgrundlageInput = contracts.Import("UpdateRechtsgrundlageInput");
export const UpdateRechtsgrundlageOutput = contracts.Import("UpdateRechtsgrundlageOutput");
export const UpdateRechtsgrundlageSourceInput = contracts.Import(
  "UpdateRechtsgrundlageSourceInput",
);
export const UpdateRechtsgrundlageSourceOutput = contracts.Import(
  "UpdateRechtsgrundlageSourceOutput",
);

export type GesetzeNormenSource = Static<typeof GesetzeNormenSource>;
export type Bundesland = Static<typeof Bundesland>;
export type BaseRelevantLaws = Static<typeof BaseRelevantLaws>;
export type StateRelevantLaws = Static<typeof StateRelevantLaws>;
export type RelevantLaws = Static<typeof RelevantLaws>;
export type UpdateRechtsgrundlageInput = Static<typeof UpdateRechtsgrundlageInput>;
export type UpdateRechtsgrundlageOutput = Static<typeof UpdateRechtsgrundlageOutput>;
export type UpdateRechtsgrundlageSourceInput = Static<typeof UpdateRechtsgrundlageSourceInput>;
export type UpdateRechtsgrundlageSourceOutput = Static<typeof UpdateRechtsgrundlageSourceOutput>;
