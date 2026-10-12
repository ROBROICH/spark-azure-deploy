import type {HttpJson} from "@spark-workflow/http-host";

export interface MutationJsonResponse {
  status: number;
  body: HttpJson;
}

function baseUrl(): string {
  const configured = process.env.PLAUSIBILITY_BASE_URL;
  if (!configured) {
    throw new Error(
      "PLAUSIBILITY_BASE_URL must point to an externally supervised incumbent Plausibility service",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PLAUSIBILITY_BASE_URL must be an HTTP URL");
  }
  return configured.replace(/\/$/, "");
}

export async function mutateJson(path: string, init: RequestInit): Promise<MutationJsonResponse> {
  const headers = new Headers(init.headers);
  headers.set("connection", "close");
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const text = await response.text();
  let body: HttpJson = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Plausibility test returned non-JSON for ${init.method ?? "GET"} ${path}: ${text}`,
    );
  }
  return { status: response.status, body };
}

export function mutationRequest(
  method: "POST" | "PATCH" | "DELETE",
  body?: HttpJson,
  headers: Record<string, string> = {},
): RequestInit {
  return {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
