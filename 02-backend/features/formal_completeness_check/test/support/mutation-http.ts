import type {HttpJson} from "@spark-workflow/http-host";

export interface MutationJsonResult {
  status: number;
  body: HttpJson;
}

const mutationTarget = (): URL => {
  const value = process.env.FCS_MUTATION_BASE_URL;
  if (value === undefined) {
    throw new Error(
      "FCS_MUTATION_BASE_URL must point to an already running incumbent Formal Completeness Check service",
    );
  }
  return new URL(value);
};

export async function mutateJson(path: string, init: RequestInit): Promise<MutationJsonResult> {
  const response = await fetch(new URL(path, mutationTarget()), init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return {
    status: response.status,
    body: await response.json(),
  };
}

export const mutationRequest = (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: HttpJson,
  headers: Record<string, string> = {},
): RequestInit => ({
  method,
  headers:
    body === undefined ? headers : { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
