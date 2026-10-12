import { Type, type Static } from "@sinclair/typebox";

const contracts = Type.Module({
  TemporalWorkerConfig: Type.Object({
    targetHost: Type.String({ minLength: 1 }),
    namespace: Type.Optional(Type.String({ minLength: 1, default: "default" })),
    taskQueue: Type.String({ minLength: 1 }),
    maxConcurrentActivities: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()], { default: null }),
    ),
    maxTaskQueueActivitiesPerSecond: Type.Optional(
      Type.Union([Type.Number({ exclusiveMinimum: 0 }), Type.Null()], { default: null }),
    ),
  }),
});

export const TemporalWorkerConfig = contracts.Import("TemporalWorkerConfig");
export type TemporalWorkerConfig = Static<typeof TemporalWorkerConfig>;
