import { auditRequestInit } from "@spark-workflow/audit-client";
import { privateAddressBlockList, validateFileUrl, type FileUrlPolicy } from "@spark-workflow/fpp-service/url";
import { PeerContractError, type HttpJson } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Redacted } from "effect";
import { get as httpGet, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, get as httpsGet } from "node:https";
import type { SocketConstructorOpts } from "node:net";
import { Readable } from "node:stream";
import { DecompressionStream } from "node:stream/web";


const FppAccessTokenSchema = Type.Object(
  { access_token: Type.String({ minLength: 1 }) },
  { additionalProperties: true },
);
const privateSocketOptions: SocketConstructorOpts = { blockList: privateAddressBlockList };

export class ExternalHttpError extends Error {
  constructor(
    readonly service: string,
    readonly method: string,
    readonly path: string,
    readonly status: number,
  ) {
    super(`${service} ${method} ${path} returned ${status}`);
    this.name = "ExternalHttpError";
  }
}

async function checkedResponse(service: string, url: URL, init: RequestInit): Promise<Response> {
  const response = await fetch(url, auditRequestInit({ ...init, redirect: "error" }));
  if (!response.ok) {
    await response.body?.cancel();
    throw new ExternalHttpError(service, init.method ?? "GET", url.pathname, response.status);
  }
  return response;
}

async function downloadBytes(
  service: string,
  url: string,
  token: string,
  maxBytes: number,
  blockPrivateIps = false,
): Promise<Uint8Array> {
  const source = new URL(url);
  const agent = blockPrivateIps ? new HttpsAgent(privateSocketOptions) : undefined;
  let response: IncomingMessage | undefined;
  try {
    const { headers } = auditRequestInit({
      headers: { authorization: `Bearer ${token}`, accept: "*/*", "accept-encoding": "gzip, deflate, br" },
    });
    response = await new Promise<IncomingMessage>((resolve, reject) => {
      (source.protocol === "https:" ? httpsGet : httpGet)(
        source,
        { agent, headers: Object.fromEntries(new Headers(headers)) },
        resolve,
      ).once("error", reject);
    });
    const status = response.statusCode;
    if (status === undefined) throw new PeerContractError(service, "download", "invalid-response");
    if (status < 200 || status >= 300) {
      throw new ExternalHttpError(service, "GET", source.pathname, status);
    }
    if (Number(response.headers["content-length"]) > maxBytes) {
      throw new PeerContractError(service, "download", "source-too-large", status);
    }
    let body = Readable.toWeb(response);
    const encoding = response.headers["content-encoding"];
    if (encoding === "gzip" || encoding === "deflate" || encoding === "br") {
      body = body.pipeThrough(new DecompressionStream(encoding === "br" ? "brotli" : encoding));
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    for await (const chunk of body) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        throw new PeerContractError(service, "download", "source-too-large", status);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, received);
  } finally {
    response?.destroy();
    agent?.destroy();
  }
}

export interface FppSourceCredential {
  tokenUrl: string;
  clientId: string;
  clientSecret: Redacted.Redacted<string>;
  username: string;
  password: Redacted.Redacted<string>;
}

export class FppClient {
  constructor(
    private readonly credential: FppSourceCredential | null,
    private readonly downloadPolicy: FileUrlPolicy,
    private readonly maxObjectBytes: number,
  ) {}

  async downloadSource(url: string): Promise<Uint8Array> {
    if (this.credential === null) {
      throw new PeerContractError("FPP", "source credential selection", "source-not-configured");
    }
    validateFileUrl(url, this.downloadPolicy);
    const tokenResponse = await checkedResponse("FPP", new URL(this.credential.tokenUrl), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.credential.clientId,
        client_secret: Redacted.value(this.credential.clientSecret),
        grant_type: "password",
        username: this.credential.username,
        password: Redacted.value(this.credential.password),
        scope: "openid",
      }),
    });
    const token: HttpJson = await tokenResponse.json();
    if (!Value.Check(FppAccessTokenSchema, token)) {
      throw new PeerContractError("FPP", "token", "invalid-response", tokenResponse.status);
    }
    return downloadBytes("FPP", url, token.access_token, this.maxObjectBytes, this.downloadPolicy.blockPrivateIps);
  }
}
