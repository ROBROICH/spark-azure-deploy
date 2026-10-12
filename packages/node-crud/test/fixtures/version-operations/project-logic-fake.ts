


import type { NodeJson } from "../../../src/values";

type Result =
  | { readonly status: 204 }
  | { readonly status: number; readonly body: Readonly<unknown> };

type Expectation =
  | {
      readonly operation: "latest-version";
      readonly projectId: string;
      readonly result: Result;
    }
  | {
      readonly operation: "validate-version-lock";
      readonly projectId: string;
      readonly input: {
        readonly sourceVersion: number;
        readonly targetVersion: number;
        readonly lockToken: string;
      };
      readonly result: Result;
    };

export interface ProjectLogicFake {
  readonly url: string;
  readonly calls: readonly string[];
  assertComplete(): void;
  stop(): void;
}

const response = (result: Result): Response =>
  !("body" in result)
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { "content-type": "application/json" },
      });

export const startProjectLogicFake = (declared: readonly Expectation[]): ProjectLogicFake => {
  const expectations = [...declared];
  const calls: string[] = [];
  const unexpected: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const call = `${request.method} ${url.pathname}${url.search}`;
      calls.push(call);
      const expected = expectations[0];
      let matches = false;

      if (expected?.operation === "latest-version") {
        matches =
          request.method === "GET" &&
          url.pathname === `/projects/${expected.projectId}/latest-version` &&
          url.search === "";
      } else if (expected?.operation === "validate-version-lock") {
        let body: NodeJson | undefined;
        try {
          body = await request.json();
        } catch {
          body = undefined;
        }
        matches =
          request.method === "POST" &&
          url.pathname === `/projects/${expected.projectId}/version-lock/validate` &&
          url.search === "" &&
          request.headers.get("content-type")?.startsWith("application/json") === true &&
          JSON.stringify(body) === JSON.stringify(expected.input);
      }

      if (!expected || !matches) {
        const detail = `Unexpected Project Logic request: ${call}`;
        unexpected.push(detail);
        return Response.json({ detail }, { status: 500 });
      }
      expectations.shift();
      return response(expected.result);
    },
  });
  let stopped = false;

  return {
    url: `http://127.0.0.1:${server.port}`,
    calls,
    assertComplete() {
      if (unexpected.length > 0) throw new Error(unexpected.join("\n"));
      if (expectations.length > 0) {
        throw new Error(`${expectations.length} declared Project Logic request(s) were not made`);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      void server.stop(true);
    },
  };
};
