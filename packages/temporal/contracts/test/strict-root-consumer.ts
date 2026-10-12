import {
  TemporalWorkerConfig,
  type Static,
} from "@spark-temporal/contracts";

type InferredWorkerConfig = Static<typeof TemporalWorkerConfig>;

const valid: InferredWorkerConfig = {
  targetHost: "temporal.invalid:7233",
  taskQueue: "strict-root-consumer",
  maxConcurrentActivities: 2,
};

const invalid: InferredWorkerConfig = {
  targetHost: "temporal.invalid:7233",
  taskQueue: "strict-root-consumer",
  // @ts-expect-error The authored TypeBox type must reject a string instead of falling back to any.
  maxConcurrentActivities: "two",
};

void valid;
void invalid;
