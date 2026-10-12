import type {HttpJson} from "@spark-workflow/http-host";

const mutationBaseUrl = (): URL => {
  const value = process.env.DMS_MUTATION_BASE_URL;
  if (value === undefined) {
    throw new Error("DMS_MUTATION_BASE_URL must point to the supervised DMS process");
  }
  return new URL(value);
};

export interface MutationJsonResult {
  status: number;
  body: HttpJson;
}

export async function mutateJson(path: string, init: RequestInit): Promise<MutationJsonResult> {
  const response = await fetch(new URL(path, mutationBaseUrl()), init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return { status: response.status, body: await response.json() };
}

export function mutationRequest(
  method: "DELETE" | "PATCH" | "POST",
  body?: HttpJson,
  headers: Readonly<Record<string, string>> = {},
): RequestInit {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set("content-type", "application/json");
  return {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
