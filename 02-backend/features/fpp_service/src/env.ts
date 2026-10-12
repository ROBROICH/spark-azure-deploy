import { defineResource } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { parseFileUrlPolicy } from "./url.ts";

const Uuid = Type.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});

const Environment = Type.Object(
  {
    DEFAULT_PROJECT_TYPE_ID: Uuid,
    SYSTEM_USER_ID: Uuid,
  },
  { additionalProperties: false },
);

export const parseFppConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(Environment, source);
  return Object.freeze({
    defaultProjectTypeId: environment.DEFAULT_PROJECT_TYPE_ID,
    systemUserId: environment.SYSTEM_USER_ID,
    downloadPolicy: parseFileUrlPolicy(source),
  });
};

export const FppConfiguration =
  defineResource<ReturnType<typeof parseFppConfiguration>>()("fpp/Configuration");
