import {type Static, type TSchema} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

import {ErrorResponseSchema, SupplementaryRequestResponseSchema, } from "./read-contracts.ts";

export { ErrorResponseSchema, SupplementaryRequestResponseSchema };

export function parseMutationContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
