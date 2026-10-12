import type {HttpJson} from "@spark-workflow/http-host";

import {loadKeycloakAdminFixture, type KeycloakAdminFixture, } from "../test/support/contracts.ts";

const ACCESS_TOKEN = "identity-read-provider-fixture-token";

type ProviderCall = KeycloakAdminFixture["scenarios"]["readUsers"]["calls"][number];
type ProviderResponse = ProviderCall["response"];

export interface BoundaryStatus {
  complete: boolean;
  missing: string[];
  unexpected: string[];
}

export interface KeycloakAdminReadFixture {
  respond(request: Request): Promise<Response>;
  status(): BoundaryStatus;
}

interface DeclaredRequest {
  label: string;
  response: ProviderResponse;
}

const json = (status: number, body: HttpJson) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const sortedEntries = (value: Iterable<[string, string]>) =>
  [...value].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );

const canonical = (value: HttpJson): HttpJson => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!(value instanceof Object)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entry]) => (entry === undefined ? [] : [[key, canonical(entry)]])),
  );
};

const requestKey = (request: HttpJson) => JSON.stringify(canonical(request));

const expectedRequest = (call: ProviderCall, clientSecret: string) => {
  let body: HttpJson = null;
  let contentType: string | null = null;
  if (call.form !== undefined) {
    body = sortedEntries(
      Object.entries(call.form).map(([key, value]) => [
        key,
        value === "$runtime" ? clientSecret : value,
      ]),
    );
    contentType = "application/x-www-form-urlencoded";
  } else if (call.json !== undefined) {
    body = canonical(call.json as HttpJson);
    contentType = "application/json";
  }

  return {
    method: call.method,
    path: call.path,
    query: sortedEntries(Object.entries(call.query ?? {})),
    contentType,
    authorization: call.requiresAuthorization ? `Bearer ${ACCESS_TOKEN}` : null,
    body,
  };
};

const actualRequest = async (request: Request) => {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? null;
  const bodyText = await request.text();
  let body: HttpJson = null;
  if (contentType === "application/x-www-form-urlencoded") {
    body = sortedEntries(new URLSearchParams(bodyText));
  } else if (contentType === "application/json") {
    try {
      body = canonical(JSON.parse(bodyText) as HttpJson);
    } catch {
      body = { malformedJson: bodyText };
    }
  } else if (bodyText !== "") {
    body = { raw: bodyText };
  }

  return {
    method: request.method,
    path: url.pathname,
    query: sortedEntries(url.searchParams),
    contentType,
    authorization: request.headers.get("authorization"),
    body,
  };
};

const generatedUserPage = (specification: { start: number; count: number }) =>
  Array.from({ length: specification.count }, (_, offset) => {
    const index = specification.start + offset;
    return {
      id: `20000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      username: `fixture-page-${String(index).padStart(3, "0")}`,
      enabled: true,
      email: `fixture-page-${String(index).padStart(3, "0")}@example.test`,
      firstName: "Page",
      lastName: `Fixture ${String(index).padStart(3, "0")}`,
    };
  });

const providerResponse = (response: ProviderResponse): Response => {
  if ("runtimeAccessToken" in response) {
    return json(response.status, { access_token: ACCESS_TOKEN });
  }
  if ("generatedUserPage" in response) {
    return json(response.status, generatedUserPage(response.generatedUserPage));
  }
  if ("json" in response) return json(response.status, response.json as HttpJson);
  return new Response(null, { status: response.status });
};

const mergeEquivalentListResponses = (
  left: ProviderResponse,
  right: ProviderResponse,
): ProviderResponse | undefined => {
  if (
    !("json" in left) ||
    !("json" in right) ||
    left.status !== right.status ||
    !Array.isArray(left.json) ||
    !Array.isArray(right.json)
  ) {
    return undefined;
  }
  const entries = new Map([...left.json, ...right.json].map((entry) => [requestKey(entry), entry]));
  return { status: left.status, json: [...entries.values()] };
};

export function assertKeycloakAdminReadFixtureComplete(boundary: KeycloakAdminReadFixture): void {
  const status = boundary.status();
  if (!status.complete) {
    throw new Error(
      `Identity Keycloak Admin boundary did not observe all declared request kinds: ${JSON.stringify(status)}`,
    );
  }
}

const createKeycloakAdminBoundary = (
  calls: readonly ProviderCall[],
  clientSecret: string,
): KeycloakAdminReadFixture => {
  const declared = new Map<string, DeclaredRequest>();

  for (const call of calls) {
    const key = requestKey(expectedRequest(call, clientSecret));
    const current = declared.get(key);
    const label = `${call.method} ${call.path}${
      call.query === undefined ? "" : `?${new URLSearchParams(call.query).toString()}`
    }`;
    if (current === undefined) {
      declared.set(key, { label, response: call.response });
      continue;
    }
    if (requestKey(current.response as HttpJson) !== requestKey(call.response as HttpJson)) {
      const merged = mergeEquivalentListResponses(current.response, call.response);
      if (merged === undefined) {
        throw new Error(`Identity provider fixture has conflicting responses for ${label}`);
      }
      current.response = merged;
    }
  }

  const seen = new Set<string>();
  const unexpectedRequests: string[] = [];

  return {
    async respond(request) {
      const actual = await actualRequest(request);
      const key = requestKey(actual);
      const declaredRequest = declared.get(key);
      const url = new URL(request.url);
      const label = `${request.method} ${url.pathname}${url.search}`;
      if (declaredRequest === undefined) {
        const detail = `Unexpected Keycloak Admin request: ${label}`;
        unexpectedRequests.push(detail);
        return json(500, { detail });
      }
      seen.add(key);
      return providerResponse(declaredRequest.response);
    },
    status() {
      const missing = [...declared]
        .filter(([key]) => !seen.has(key))
        .map(([, declaredRequest]) => declaredRequest.label);
      return {
        complete: missing.length === 0 && unexpectedRequests.length === 0,
        missing,
        unexpected: [...unexpectedRequests],
      };
    },
  };
};

export async function createKeycloakAdminReadFixture(
  clientSecret: string,
): Promise<KeycloakAdminReadFixture> {
  if (clientSecret === "") throw new Error("Identity Keycloak fixture client secret is required");
  const fixture = await loadKeycloakAdminFixture();
  return createKeycloakAdminBoundary(fixture.scenarios.readUsers.calls, clientSecret);
}
