import type { HttpJson } from "@spark-workflow/http-host";

import { examinationErrors } from "./errors.ts";

export type LawDatabaseQueryValue = string | number | boolean | null | undefined;

export class LawDatabaseClient {
  readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async get(
    path: string,
    query?: Readonly<Record<string, LawDatabaseQueryValue>>,
  ): Promise<HttpJson> {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) params.set(name, String(value));
    }
    const suffix = params.size === 0 ? "" : `?${params.toString()}`;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}${suffix}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw examinationErrors.LAW_DATABASE_UNAVAILABLE({
        cause: error instanceof Error ? error : undefined,
        internal: { path, operation: "request" },
      });
    }
    if (!response.ok) {
      throw examinationErrors.LAW_DATABASE_UNAVAILABLE({
        message: `Law database returned status ${response.status}.`,
        internal: { path, peerStatus: response.status },
      });
    }
    try {
      return (await response.json()) as HttpJson;
    } catch (error) {
      throw examinationErrors.LAW_DATABASE_UNAVAILABLE({
        cause: error instanceof Error ? error : undefined,
        internal: { path, invalidField: "response" },
      });
    }
  }
}
