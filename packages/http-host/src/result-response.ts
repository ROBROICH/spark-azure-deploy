import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { Err, Ok, type Result } from "better-result";
import { Elysia, ElysiaCustomStatusResponse, status } from "elysia";
import type { EvlogError } from "evlog";

export const resultOf = <Schema extends TSchema>(schema: Schema) =>
  Type.Unsafe<Static<Schema> | Result<Static<Schema>, EvlogError>>(schema);

export const resultResponses = new Elysia({
  name: "@spark-workflow/http-host.result-responses",
}).onAfterHandle({ as: "global" }, ({ responseValue }) => {
  if (responseValue instanceof Err) throw responseValue.error;
  if (responseValue instanceof Ok) return responseValue.value ?? null;
  if (!(responseValue instanceof ElysiaCustomStatusResponse)) return;
  const { code, response } = responseValue;
  if (response instanceof Err) throw response.error;
  if (response instanceof Ok) return status(code, response.value);
});
