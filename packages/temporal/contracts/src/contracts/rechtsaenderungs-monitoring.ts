import { Type, type Static } from "@sinclair/typebox";

import { DateTime, StringEnum, type WorkflowName } from "../registry.js";

export const RECHTSAENDERUNGS_MONITORING_TASK_QUEUE = "rechtsaenderungs_monitoring" as const;
export const RECHTSAENDERUNGS_MONITORING_WORKFLOW =
  "MonitorRechtsaenderungenWorkflow" as WorkflowName<"MonitorRechtsaenderungenWorkflow">;
export const RECHTSAENDERUNGS_MONITORING_SOURCE_WORKFLOW =
  "MonitorRechtsaenderungenSourceWorkflow" as WorkflowName<"MonitorRechtsaenderungenSourceWorkflow">;

const sourceValues = { EU: "EU", BUND: "Bund", BUNDESLAND: "Bundesland" } as const;

const contracts = Type.Module({
  RechtsaenderungenSource: StringEnum(sourceValues),
  FeedEntry: Type.Object({
    title: Type.String(),
    titleHash: Type.String(),
    link: Type.String({ format: "uri" }),
    guid: Type.String(),
    description: Type.String(),
    pubDate: DateTime,
  }),
  MonitorRechtsaenderungenInput: Type.Object({
    source: Type.Ref("RechtsaenderungenSource"),
    location: Type.Optional(Type.Union([Type.Ref("Bundesland"), Type.Null()], { default: null })),
    entryTitles: Type.Optional(
      Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
    ),
    overwrite: Type.Optional(Type.Boolean({ default: false })),
  }),
  MonitorRechtsaenderungenOutput: Type.Object({
    written: Type.Integer(),
    skipped: Type.Integer(),
    failed: Type.Integer(),
  }),
});

export const RechtsaenderungenSource = contracts.Import("RechtsaenderungenSource");
export const FeedEntry = contracts.Import("FeedEntry");
export const MonitorRechtsaenderungenInput = contracts.Import("MonitorRechtsaenderungenInput");
export const MonitorRechtsaenderungenOutput = contracts.Import("MonitorRechtsaenderungenOutput");

export type RechtsaenderungenSource = Static<typeof RechtsaenderungenSource>;
export type FeedEntry = Static<typeof FeedEntry>;
export type MonitorRechtsaenderungenInput = Static<typeof MonitorRechtsaenderungenInput>;
export type MonitorRechtsaenderungenOutput = Static<typeof MonitorRechtsaenderungenOutput>;
