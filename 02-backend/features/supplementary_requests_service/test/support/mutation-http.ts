import type {HttpJson} from "@spark-workflow/http-host";



export interface MutationJsonResult {
  status: number;
  body: HttpJson;
}

function mutationBaseUrl(): URL {
  const value = process.env.SUPPLEMENTARY_REQUESTS_BASE_URL;
  if (value === undefined) {
    throw new Error(
      "SUPPLEMENTARY_REQUESTS_BASE_URL must point to the supervised incumbent Supplementary Requests service",
    );
  }
  return new URL(value.endsWith("/") ? value : `${value}/`);
}

export async function mutateJson(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  options: {
    body?: HttpJson;
    headers?: Record<string, string>;
  } = {},
): Promise<MutationJsonResult> {
  const headers = new Headers(options.headers);
  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  const response = await fetch(new URL(path.replace(/^\//, ""), mutationBaseUrl()), {
    method,
    headers,
    body,
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${method} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return { status: response.status, body: await response.json() };
}
