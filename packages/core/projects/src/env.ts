import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { TemporalConnectionEnvironment } from "@spark-temporal/typescript/environment";

import { CoreWorkerEnvironment, coreWorkerTemporalConfiguration } from "../../src/temporal-env.ts";

const ProjectEnvironment = Type.Object(
  {
    PROJECT_CUT_OFF_DATE: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const parseProjectConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(ProjectEnvironment, source);
  const projectCutOffDate =
    environment.PROJECT_CUT_OFF_DATE === undefined
      ? undefined
      : new Date(environment.PROJECT_CUT_OFF_DATE);
  if (projectCutOffDate !== undefined && Number.isNaN(projectCutOffDate.valueOf())) {
    throw new TypeError("PROJECT_CUT_OFF_DATE must be a date-time");
  }
  return Object.freeze({
    projectCutOffDate,
  });
};

export type ProjectConfiguration = ReturnType<typeof parseProjectConfiguration>;

export const parseProjectCommandConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(TemporalConnectionEnvironment, source);
  return Object.freeze({
    temporalHost: environment.TEMPORAL_HOST,
    temporalNamespace: environment.TEMPORAL_NAMESPACE,
  });
};

export type ProjectCommandConfiguration = ReturnType<typeof parseProjectCommandConfiguration>;

export const parseProjectWorkerConfiguration = (source: typeof process.env) =>
  Object.freeze(coreWorkerTemporalConfiguration(Value.Parse(CoreWorkerEnvironment, source)));

export type ProjectWorkerConfiguration = ReturnType<typeof parseProjectWorkerConfiguration>;
