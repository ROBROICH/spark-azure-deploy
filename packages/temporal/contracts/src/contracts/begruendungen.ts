import { Type, type Static } from "@sinclair/typebox";

import { StringEnum, type WorkflowName } from "../registry.js";

export const BEGRUENDUNGEN_TASK_QUEUE = "begruendungen_db" as const;
export const BEGRUENDUNGEN_UPDATE_WORKFLOW =
  "UpdateBegruendungenWorkflow" as WorkflowName<"UpdateBegruendungenWorkflow">;
export const BEGRUENDUNGEN_UPDATE_SOURCE_WORKFLOW =
  "UpdateBegruendungenSourceWorkflow" as WorkflowName<"UpdateBegruendungenSourceWorkflow">;
export const BEGRUENDUNGEN_UPDATE_LAW_DOC_WORKFLOW =
  "UpdateBegruendungenLawDocWorkflow" as WorkflowName<"UpdateBegruendungenLawDocWorkflow">;

const hierarchyValues = {
  EU: "eu",
  BUND: "bund",
  BUNDESLAND: "bundesland",
  KOMMUNE: "kommune",
} as const;
const bundeslandValues = {
  BY: "BY",
  BW: "BW",
  BE: "BE",
  BB: "BB",
  HB: "HB",
  HH: "HH",
  HE: "HE",
  MV: "MV",
  NI: "NI",
  NW: "NW",
  RP: "RP",
  SL: "SL",
  SN: "SN",
  ST: "ST",
  SH: "SH",
  TH: "TH",
} as const;
const sourceValues = { DIP_DRUCK: "dip_druck" } as const;
const dipDruckExtra = Type.Object({ api_key: Type.String() }, { additionalProperties: false });
const documentMeta = Type.Object(
  {
    id: Type.String(),
    drucksachetyp: Type.String(),
    pdf_url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);

const processLawDocInput = Type.Object({
  lawDoc: Type.Ref("GNDocData"),
  source: Type.Ref("BegruendungenSource"),
  extra: Type.Optional(Type.Union([dipDruckExtra, Type.Null()], { default: null })),
  overwrite: Type.Optional(Type.Boolean({ default: false })),
});

const contracts = Type.Module({
  Hierarchy: StringEnum(hierarchyValues),
  BundeslandParam: StringEnum(bundeslandValues),
  BegruendungenSource: StringEnum(sourceValues),
  GNDocData: Type.Object({
    jurabk: Type.String(),
    kurzue: Type.String(),
    langue: Type.String(),
    hierarchy: Type.Ref("Hierarchy"),
    bundesland: Type.Optional(
      Type.Union([Type.Ref("BundeslandParam"), Type.Null()], { default: null }),
    ),
  }),
  SourceConfigInput: Type.Object({
    source: Type.Ref("BegruendungenSource"),
    hierarchy: Type.Ref("Hierarchy"),
    bundesland: Type.Optional(
      Type.Union([Type.Ref("BundeslandParam"), Type.Null()], { default: null }),
    ),
    extra: Type.Optional(Type.Union([dipDruckExtra, Type.Null()], { default: null })),
    overwrite: Type.Optional(Type.Boolean({ default: false })),
  }),
  ProcessLawDocInput: processLawDocInput,
  ProcessLawDocResult: Type.Object({
    jurabk: Type.String(),
    written: Type.Integer(),
    skipped: Type.Integer(),
    failed: Type.Integer(),
  }),
  ProcessSingleDocResult: Type.Object({
    jurabk: Type.String(),
    status: Type.String(),
    error: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
  }),
  ProcessSingleDocInput: Type.Composite([processLawDocInput, Type.Object({ documentMeta })]),
  UpdateBegruendungenSourceInput: Type.Object({
    sourceConfig: Type.Ref("SourceConfigInput"),
  }),
  UpdateBegruendungenSourceOutput: Type.Object({
    written: Type.Integer(),
    skipped: Type.Integer(),
    failed: Type.Integer(),
  }),
  UpdateBegruendungenInput: Type.Object({
    sources: Type.Array(Type.Ref("SourceConfigInput")),
  }),
  UpdateBegruendungenOutput: Type.Object({
    written: Type.Integer(),
    skipped: Type.Integer(),
    failed: Type.Integer(),
  }),
});

export const Hierarchy = contracts.Import("Hierarchy");
export const BundeslandParam = contracts.Import("BundeslandParam");
export const BegruendungenSource = contracts.Import("BegruendungenSource");
export const GNDocData = contracts.Import("GNDocData");
export const SourceConfigInput = contracts.Import("SourceConfigInput");
export const ProcessLawDocInput = contracts.Import("ProcessLawDocInput");
export const ProcessLawDocResult = contracts.Import("ProcessLawDocResult");
export const ProcessSingleDocResult = contracts.Import("ProcessSingleDocResult");
export const ProcessSingleDocInput = contracts.Import("ProcessSingleDocInput");
export const UpdateBegruendungenSourceInput = contracts.Import("UpdateBegruendungenSourceInput");
export const UpdateBegruendungenSourceOutput = contracts.Import("UpdateBegruendungenSourceOutput");
export const UpdateBegruendungenInput = contracts.Import("UpdateBegruendungenInput");
export const UpdateBegruendungenOutput = contracts.Import("UpdateBegruendungenOutput");

export type Hierarchy = Static<typeof Hierarchy>;
export type BundeslandParam = Static<typeof BundeslandParam>;
export type BegruendungenSource = Static<typeof BegruendungenSource>;
export type GNDocData = Static<typeof GNDocData>;
export type SourceConfigInput = Static<typeof SourceConfigInput>;
export type ProcessLawDocInput = Static<typeof ProcessLawDocInput>;
export type ProcessLawDocResult = Static<typeof ProcessLawDocResult>;
export type ProcessSingleDocResult = Static<typeof ProcessSingleDocResult>;
export type ProcessSingleDocInput = Static<typeof ProcessSingleDocInput>;
export type UpdateBegruendungenSourceInput = Static<typeof UpdateBegruendungenSourceInput>;
export type UpdateBegruendungenSourceOutput = Static<typeof UpdateBegruendungenSourceOutput>;
export type UpdateBegruendungenInput = Static<typeof UpdateBegruendungenInput>;
export type UpdateBegruendungenOutput = Static<typeof UpdateBegruendungenOutput>;
