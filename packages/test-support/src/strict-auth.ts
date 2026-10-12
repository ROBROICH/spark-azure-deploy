import { mock, spyOn } from "bun:test";
import { v1 } from "@authzed/authzed-node";

export const machineSubject = "00000000-0000-0000-0000-000000000001";
export const machineHeaders = {
  "x-forwarded-client-cert": "URI=spiffe://cluster.local/ns/test/sa/caller",
};
export const offlineResourceId = "offline";

const base64url = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");

export async function useStrictAuthentication(relations: readonly string[]) {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "test" };
  const jwks = Bun.serve({ port: 0, fetch: () => Response.json({ keys: [publicJwk] }) });
  const authBaseUrl = `http://127.0.0.1:${jwks.port}`;
  Object.assign(process.env, {
    AUTH_MODE: "strict",
    AUTH_BASE_URL: authBaseUrl,
    AUTH_REALM: "test",
    AUTH_AUDIENCE: "test",
    AUTH_SPICE_DB_ENDPOINT: "127.0.0.1:1",
    AUTH_SPICE_DB_TOKEN: "test",
    AUTH_SPICE_DB_INSECURE: "true",
    AUTH_ALLOWED_MACHINE_IDENTITIES: "spiffe://cluster.local/ns/test/sa/*",
  });

  const granted = new Set(relations);
  const checks = mock(async (request: v1.CheckPermissionRequest) => {
    const resource = request.resource;
    if (resource?.objectId === offlineResourceId) throw new Error("SpiceDB is offline");
    const relation = `${request.subject?.object?.objectId} ${request.permission} ${resource?.objectType}:${resource?.objectId}`;
    return v1.CheckPermissionResponse.create({
      permissionship: granted.has(relation)
        ? v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION
        : v1.CheckPermissionResponse_Permissionship.NO_PERMISSION,
    });
  });
  const lookups = mock(async (request: v1.LookupResourcesRequest) => {
    const prefix = `${request.subject?.object?.objectId} ${request.permission} ${request.resourceObjectType}:`;
    return [...granted]
      .filter((relation) => relation.startsWith(prefix))
      .map((relation) =>
        v1.LookupResourcesResponse.create({ resourceObjectId: relation.slice(prefix.length) }),
      );
  });
  const client = Object.create(null) as v1.ZedClientInterface;
  Object.defineProperty(client, "promises", {
    value: { checkPermission: checks, lookupResources: lookups },
  });
  spyOn(v1, "NewClient").mockReturnValue(client);

  return {
    checks,
    lookups,
    stop: () => jwks.stop(true),
    async userToken(subject: string, roles: readonly string[]) {
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        sub: subject,
        realm_access: { roles },
        iss: `${authBaseUrl}/realms/test`,
        aud: "test",
        iat: now,
        exp: now + 60,
      };
      const unsigned = `${base64url(JSON.stringify({ alg: "RS256", kid: "test" }))}.${base64url(JSON.stringify(claims))}`;
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keys.privateKey,
        new TextEncoder().encode(unsigned),
      );
      return { authorization: `Bearer ${unsigned}.${base64url(new Uint8Array(signature))}` };
    },
  };
}
