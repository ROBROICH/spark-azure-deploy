import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { Redacted } from "effect";
import { PeerContractError } from "@spark-workflow/http-host";
import { validateFileUrl } from "@spark-workflow/fpp-service/url";

import { FppClient } from "../src/external-clients.ts";

const foreignAuthorizations: Array<string | null> = [];
const foreign = Bun.serve({
  port: 0,
  fetch(request) {
    foreignAuthorizations.push(request.headers.get("authorization"));
    return new Response("foreign bytes");
  },
});
const foreignOrigin = `http://127.0.0.1:${foreign.port}`;
const fppTokenStatuses: number[] = [];

const maxObjectBytes = 64 * 1024;
const upstream = Bun.serve({
  port: 0,
  routes: {
    "/token": {
      POST: async (request) =>
        Response.json({ accessToken: `token-${(await request.formData()).get("clientId")}` }),
    },
    "/fpp-token": {
      POST: async (request) => {
        const form = await request.formData();
        const valid =
          form.get("grant_type") === "password" &&
          form.get("client_id") === "fpp" &&
          form.get("client_secret") === "secret-fpp" &&
          form.get("username") === "user" &&
          form.get("password") === "password" &&
          form.get("scope") === "openid";
        fppTokenStatuses.push(valid ? 200 : 400);
        return valid
          ? Response.json({ access_token: "token-fpp", token_type: "Bearer" })
          : Response.json({ error: "invalid_request" }, { status: 400 });
      },
    },
  },
});
const upstreamOrigin = `http://127.0.0.1:${upstream.port}`;

afterEach(() => {
  foreignAuthorizations.length = 0;
});
afterAll(async () => {
  await Promise.all([foreign.stop(true), upstream.stop(true)]);
});

describe("external source clients", () => {
  test("FPP requests its token with the standard OAuth fields", async () => {
    fppTokenStatuses.length = 0;
    const fpp = new FppClient(
      {
        tokenUrl: `${upstreamOrigin}/fpp-token`,
        clientId: "fpp",
        clientSecret: Redacted.make("secret-fpp"),
        username: "user",
        password: Redacted.make("password"),
      },
      { allowedDomains: ["localhost."], blockPrivateIps: false },
      maxObjectBytes,
    );

    await expect(fpp.downloadSource("https://localhost.:1/plan.zip")).rejects.toThrow();
    expect(fppTokenStatuses).toEqual([200]);
  });

  test("FPP sends no token to a URL outside the configured download policy", async () => {
    const fpp = new FppClient(
      {
        tokenUrl: `${upstreamOrigin}/fpp-token`,
        clientId: "fpp",
        clientSecret: Redacted.make("secret-fpp"),
        username: "user",
        password: Redacted.make("password"),
      },
      { allowedDomains: ["files.fpp.example"], blockPrivateIps: true },
      maxObjectBytes,
    );

    await expect(fpp.downloadSource(`${foreignOrigin}/plan.zip`)).rejects.toThrow();
    expect(foreignAuthorizations).toEqual([]);
  });

  test.skipIf(!process.env.FPP_TEST_TLS_CERT || !process.env.FPP_TEST_TLS_KEY)(
    "FPP blocks a DNS-resolved private destination before sending credentials",
    async () => {
      const authorizations: Array<string | null> = [];
      const peer = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        tls: {
          cert: Bun.file(process.env.FPP_TEST_TLS_CERT!),
          key: Bun.file(process.env.FPP_TEST_TLS_KEY!),
        },
        fetch(request) {
          authorizations.push(request.headers.get("authorization"));
          return new Response("private source bytes");
        },
      });
      const source = `https://localhost.:${peer.port}/plan.zip`;
      const credential = {
        tokenUrl: `${upstreamOrigin}/fpp-token`,
        clientId: "fpp",
        clientSecret: Redacted.make("secret-fpp"),
        username: "user",
        password: Redacted.make("password"),
      };
      const policy = { allowedDomains: ["localhost."], blockPrivateIps: true };
      try {
        validateFileUrl(source, policy);
        const allowed = new FppClient(credential, { ...policy, blockPrivateIps: false }, maxObjectBytes);
        expect(new TextDecoder().decode(await allowed.downloadSource(source))).toBe("private source bytes");
        expect(authorizations).toEqual(["Bearer token-fpp"]);
        const blocked = new FppClient(credential, policy, maxObjectBytes);
        await expect(blocked.downloadSource(source)).rejects.toThrow();
        expect(authorizations).toEqual(["Bearer token-fpp"]);
        const nonStandardToken = new FppClient(
          { ...credential, tokenUrl: `${upstreamOrigin}/token` },
          { ...policy, blockPrivateIps: false },
          maxObjectBytes,
        );
        await expect(nonStandardToken.downloadSource(source)).rejects.toBeInstanceOf(PeerContractError);
        expect(authorizations).toEqual(["Bearer token-fpp"]);
      } finally {
        await peer.stop(true);
      }
    },
  );


});
