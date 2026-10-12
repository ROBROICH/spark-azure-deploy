import readFixture from "../fixtures/read-scenarios.json";

export interface BoundaryStatus {
  complete: boolean;
  missing: string[];
  unexpected: string[];
}

export interface StorageFailureFixture {
  callCount(): number;
  respond(request: Request): Response;
  status(): BoundaryStatus;
}

const json = <Body>(status: number, body: Body) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

const defaultStorageFailurePath =
  `/dms-clean-4306/qualification/documents/${readFixture.projects.other.id}/v1/${readFixture.uploads.freshFilename}`;

const unexpectedStorage = (request: Request, url: URL) =>
  json(500, {
    detail: `Unexpected storage failure request: ${request.method} ${url.pathname}${url.search}`,
  });

export function assertStorageFailureFixtureComplete(boundary: StorageFailureFixture): void {
  const status = boundary.status();
  if (!status.complete) {
    throw new Error(
      `Document Management storage-denial boundary was not consumed exactly: ${JSON.stringify(status)}`,
    );
  }
}

export function createStorageFailureFixture(
  expectedPath = defaultStorageFailurePath,
): StorageFailureFixture {
  let consumed = 0;
  const unexpectedRequests: string[] = [];
  return {
    callCount() {
      return consumed;
    },
    respond(request) {
      const url = new URL(request.url);
      const response = storageFailureResponse(request, expectedPath);
      if (response.status !== 403) {
        unexpectedRequests.push(
          `Unexpected storage failure request: ${request.method} ${url.pathname}${url.search}`,
        );
        return response;
      }
      if (consumed >= 2) {
        const detail =
          `Duplicate or over-budget storage failure request: ${request.method} ${url.pathname}${url.search}`;
        unexpectedRequests.push(detail);
        return json(500, { detail });
      }
      consumed += 1;
      return response;
    },
    status() {
      const missing = consumed < 2 ? [`HEAD ${expectedPath} x${2 - consumed}`] : [];
      return {
        complete: missing.length === 0 && unexpectedRequests.length === 0,
        missing,
        unexpected: [...unexpectedRequests],
      };
    },
  };
}

interface SigV4Authorization {
  credential: string;
  signedHeaders: string;
  signature: string;
}

const requiredSigV4SignedHeaders = ["host", "x-amz-content-sha256", "x-amz-date"] as const;

function parseSigV4Authorization(value: string): SigV4Authorization | undefined {
  const match = /^AWS4-HMAC-SHA256\s+(.+)$/.exec(value);
  if (match === null) return undefined;
  const components = match[1];
  if (components === undefined) return undefined;

  const fields = new Map<string, string>();
  for (const component of components.split(",")) {
    const separator = component.indexOf("=");
    if (separator < 1 || separator !== component.lastIndexOf("=")) return undefined;
    const name = component.slice(0, separator).trim();
    const fieldValue = component.slice(separator + 1).trim();
    if (
      !["Credential", "SignedHeaders", "Signature"].includes(name) ||
      fieldValue === "" ||
      fields.has(name)
    ) {
      return undefined;
    }
    fields.set(name, fieldValue);
  }

  const credential = fields.get("Credential");
  const signedHeaders = fields.get("SignedHeaders");
  const signature = fields.get("Signature");
  if (
    fields.size !== 3 ||
    credential === undefined ||
    signedHeaders === undefined ||
    signature === undefined
  ) {
    return undefined;
  }
  return { credential, signedHeaders, signature };
}

function isCanonicalAwsTimestamp(value: string, scopeDate: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (match === null || value.slice(0, 8) !== scopeDate) return false;

  const [, year, month, day, hour, minute, second] = match;
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(canonical);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().replace(".000", "") === canonical;
}

function hasValidSigV4Headers(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const signedAt = request.headers.get("x-amz-date");
  if (authorization === null || signedAt === null) return false;

  const parsed = parseSigV4Authorization(authorization);
  if (parsed === undefined || !/^[0-9a-f]{64}$/i.test(parsed.signature)) return false;

  const [accessKey, scopeDate, region, service, terminal, ...extraScope] =
    parsed.credential.split("/");
  if (
    extraScope.length !== 0 ||
    accessKey === undefined ||
    accessKey === "" ||
    scopeDate === undefined ||
    !/^\d{8}$/.test(scopeDate) ||
    region === undefined ||
    region === "" ||
    service !== "s3" ||
    terminal !== "aws4_request" ||
    !isCanonicalAwsTimestamp(signedAt, scopeDate)
  ) {
    return false;
  }

  const signedHeaderNames = parsed.signedHeaders.split(";");
  const signedHeaderSet = new Set(signedHeaderNames);
  if (
    signedHeaderNames.length !== signedHeaderSet.size ||
    signedHeaderNames.some((name) => !/^[a-z0-9-]+$/.test(name)) ||
    requiredSigV4SignedHeaders.some((name) => !signedHeaderSet.has(name)) ||
    signedHeaderNames.some((name) => request.headers.get(name)?.trim() === "") ||
    signedHeaderNames.some((name) => request.headers.get(name) === null)
  ) {
    return false;
  }

  const payloadHash = request.headers.get("x-amz-content-sha256");
  return payloadHash !== null && /^[0-9a-f]{64}$/i.test(payloadHash);
}

export function storageFailureResponse(
  request: Request,
  expectedPath = defaultStorageFailurePath,
): Response {
  const url = new URL(request.url);
  if (
    request.method !== "HEAD" ||
    url.pathname !== expectedPath ||
    url.search !== "" ||
    !hasValidSigV4Headers(request)
  ) {
    return unexpectedStorage(request, url);
  }

  return new Response(null, {
    status: 403,
    headers: {
      "content-type": "application/xml",
      "x-amz-error-code": "AccessDenied",
      "x-amz-error-message": "Synthetic fixture denial",
      "x-amz-request-id": "DMSREADFIXTURE",
    },
  });
}
