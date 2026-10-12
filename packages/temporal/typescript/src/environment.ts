import { Type } from "@sinclair/typebox";

export const TemporalConnectionEnvironment = Type.Object(
  {
    TEMPORAL_HOST: Type.String({ minLength: 1 }),
    TEMPORAL_NAMESPACE: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const TemporalWorkerEnvironment = Type.Object(
  {
    ...TemporalConnectionEnvironment.properties,
    TEMPORAL_MAX_CONCURRENT_ACTIVITIES: Type.Optional(Type.Number({ minimum: 1, multipleOf: 1 })),
    TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND: Type.Optional(
      Type.Number({ exclusiveMinimum: 0 }),
    ),
  },
  { additionalProperties: false },
);
