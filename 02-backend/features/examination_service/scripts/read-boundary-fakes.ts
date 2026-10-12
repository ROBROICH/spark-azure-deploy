import type { HttpJson } from "@spark-workflow/http-host";

import fixture from "../fixtures/read-scenarios.json";

export const EXAMINATION_LAW_DATABASE_FAKE_PORT = 43_242;

export interface BoundaryStatus {
  complete: boolean;
  missing: string[];
  unexpected: string[];
}

export interface LawDatabaseReadFixture {
  callsForRequest(key: string): number;
  requestKeys(): string[];
  respond(request: Request): Response;
  status(): BoundaryStatus;
}

interface LawDatabaseBudget {
  method: "GET";
  path: string;
  query: string;
  expectedCallsPerRun: number;
  outcome: { status: number; body: HttpJson };
}

const json = (status: number, body: HttpJson) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export function canonicalQuery(searchParams: URLSearchParams): string {
  const entries = [...searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey),
  );
  return new URLSearchParams(entries).toString();
}

export function lawDatabaseRequestKey(request: {
  method: string;
  path: string;
  query: string;
}): string {
  return `${request.method} ${request.path}${request.query ? `?${request.query}` : ""}`;
}

export function assertLawDatabaseReadFixtureComplete(boundary: LawDatabaseReadFixture): void {
  const status = boundary.status();
  if (!status.complete) {
    throw new Error(
      `Examination Law Database boundary was not consumed exactly: ${JSON.stringify(status)}`,
    );
  }
}

export function createLawDatabaseReadFixture(): LawDatabaseReadFixture {
  const budgets = fixture.lawDatabaseBoundary.requests as LawDatabaseBudget[];
  const declared = new Map<string, LawDatabaseBudget>();
  for (const budget of budgets) {
    const key = lawDatabaseRequestKey(budget);
    if (declared.has(key)) {
      throw new Error(`Duplicate Examination Law Database fixture request: ${key}`);
    }
    if (canonicalQuery(new URLSearchParams(budget.query)) !== budget.query) {
      throw new Error(`Law Database fixture query is not canonical: ${key}`);
    }
    declared.set(key, budget);
  }

  const consumed = new Map<string, number>();
  const unexpected: string[] = [];
  const reject = (detail: string) => {
    unexpected.push(detail);
    return json(500, { detail });
  };

  return {
    callsForRequest: (key) => consumed.get(key) ?? 0,
    requestKeys: () => [...declared.keys()],
    respond(request) {
      const url = new URL(request.url);
      const key = lawDatabaseRequestKey({
        method: request.method,
        path: url.pathname,
        query: canonicalQuery(url.searchParams),
      });
      const budget = declared.get(key);
      if (budget === undefined) {
        return reject(`Unexpected Law Database request: ${key}`);
      }
      const current = consumed.get(key) ?? 0;
      if (current >= budget.expectedCallsPerRun) {
        return reject(`Duplicate or over-budget Law Database request: ${key}`);
      }
      consumed.set(key, current + 1);
      return json(budget.outcome.status, budget.outcome.body);
    },
    status() {
      const missing = budgets.flatMap((budget) => {
        const key = lawDatabaseRequestKey(budget);
        const remaining = budget.expectedCallsPerRun - (consumed.get(key) ?? 0);
        return remaining > 0 ? [`${key} x${remaining}`] : [];
      });
      return {
        complete: missing.length === 0 && unexpected.length === 0,
        missing,
        unexpected: [...unexpected],
      };
    },
  };
}
