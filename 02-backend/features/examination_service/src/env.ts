import { defineResource } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const Environment = Type.Object(
  {
    LAW_DATABASE_BASE_URL: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const parseExaminationConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(Environment, source);
  return Object.freeze({ lawDatabaseBaseUrl: environment.LAW_DATABASE_BASE_URL });
};

export const ExaminationConfiguration = defineResource<
  ReturnType<typeof parseExaminationConfiguration>
>()("examination/Configuration");
