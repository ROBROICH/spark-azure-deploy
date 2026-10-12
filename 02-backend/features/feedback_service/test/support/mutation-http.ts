import type {HttpJson} from "@spark-workflow/http-host";



export interface MutationJsonResult {
  status: number;
  body: HttpJson;
}

export async function mutateJson(path: string, init: RequestInit): Promise<MutationJsonResult> {
  const value = process.env.FEEDBACK_MUTATION_BASE_URL;
  if (value === undefined) {
    throw new Error(
      "FEEDBACK_MUTATION_BASE_URL must point to an already running incumbent Feedback service",
    );
  }
  const response = await fetch(new URL(path, new URL(value)), init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return { status: response.status, body: (await response.json()) as HttpJson };
}

export const mutationRequest = (method: "POST", body: HttpJson): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
