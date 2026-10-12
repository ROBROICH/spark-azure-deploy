import {describe, expect, test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";
import {type Static} from "@sinclair/typebox";
import {ErrorResponse, IdentityListResponse, IdentityResponse, RuntimeTokenFixture, loadIdentityReadFixture, parseContract, } from "./support/contracts";

const meUrl = process.env.IDENTITY_READ_ME_URL;
const usersUrl = process.env.IDENTITY_READ_USERS_URL;
const runtimeTokensJson = process.env.IDENTITY_READ_TOKENS;
const externalReadsAvailable = Boolean(meUrl && usersUrl && runtimeTokensJson);
const externalTest = externalReadsAvailable ? test : test.skip;

const jsonRequest = async (
  baseUrl: string,
  path: string,
  token?: string,
): Promise<{ body: HttpJson; status: number }> => {
  const response = await fetch(new URL(path, baseUrl), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return {
    body: (await response.json()) as HttpJson,
    status: response.status,
  };
};

describe("Identity read fixture", () => {
  test("contains typed input data without runtime credentials", async () => {
    const fixture = await loadIdentityReadFixture();

    expect(fixture.users.search.query).toBe("alice");
    expect(fixture.users.noMatch.query).toBe("nobody");
    expect(fixture.users.providerError.query).toBe("provider-error");

    const serialized = JSON.stringify(fixture).toLowerCase();
    for (const forbidden of ["private_key", "access_token", "client_secret", "authorization"]) {
      expect(serialized).not.toContain(`"${forbidden}":`);
    }
  });
});

describe("GET /me", () => {
  externalTest("freezes normalized claims and meaningful auth failures", async () => {
    if (!meUrl || !runtimeTokensJson)
      throw new Error("external Identity /me fixture is not configured");

    const fixture = await loadIdentityReadFixture();
    const tokens = parseContract(RuntimeTokenFixture, JSON.parse(runtimeTokensJson));
    const results: Array<{
      id: string;
      status: number;
      body?: Static<typeof IdentityResponse> | Static<typeof ErrorResponse>;
    }> = [];

    for (const scenario of fixture.me.cases) {
      const baseUrl = scenario.profile === "bulk" ? usersUrl : meUrl;
      if (!baseUrl)
        throw new Error(`external Identity ${scenario.profile} fixture is not configured`);
      const raw = await jsonRequest(
        baseUrl,
        "/me",
        scenario.token ? tokens[scenario.token] : undefined,
      );
      const body = parseContract(raw.status === 200 ? IdentityResponse : ErrorResponse, raw.body);
      const result: (typeof results)[number] = {
        id: scenario.id,
        status: raw.status,
      };
      if (raw.status === 200) result.body = body;
      results.push(result);
    }

    expect(results).toMatchSnapshot("normalized responses");
  });
});

describe("GET /users", () => {
  externalTest(
    "freezes pagination, filtering, exact search, no-match, and provider failure",
    async () => {
      if (!usersUrl) throw new Error("external Identity /users fixture is not configured");

      const fixture = await loadIdentityReadFixture();
      const listAllRaw = await jsonRequest(usersUrl, "/users");
      const listAll = parseContract(IdentityListResponse, listAllRaw.body);

      expect(listAllRaw.status).toBe(200);
      expect(listAll.users).toContainEqual(fixture.users.listAll.first);
      for (const expectedUser of fixture.users.listAll.tail) {
        expect(listAll.users).toContainEqual(expectedUser);
      }
      expect(listAll.users.some(({ role }) => role === null)).toBeTrue();
      for (const excludedUserId of fixture.users.listAll.excludedUserIds) {
        expect(listAll.users.some(({ userId }) => userId === excludedUserId)).toBeFalse();
      }

      const searchRaw = await jsonRequest(usersUrl, `/users?search=${fixture.users.search.query}`);

      const noMatchRaw = await jsonRequest(
        usersUrl,
        `/users?search=${fixture.users.noMatch.query}`,
      );

      const providerErrorRaw = await jsonRequest(
        usersUrl,
        `/users?search=${fixture.users.providerError.query}`,
      );

      const stableResults = [
        {
          id: "search",
          status: searchRaw.status,
          body: parseContract(IdentityListResponse, searchRaw.body),
        },
        {
          id: "no-match",
          status: noMatchRaw.status,
          body: parseContract(IdentityListResponse, noMatchRaw.body),
        },
        {
          id: "provider-error",
          status: providerErrorRaw.status,
        },
      ];

      parseContract(ErrorResponse, providerErrorRaw.body);

      expect(stableResults).toMatchSnapshot("stable responses");
    },
  );
});
