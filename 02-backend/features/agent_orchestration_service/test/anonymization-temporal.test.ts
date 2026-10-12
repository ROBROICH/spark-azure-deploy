import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { executeAnonymizationRequest } from "../src/routes/anonymization.ts";
import { AosTemporalCommandsService } from "../src/temporal/commands.ts";

const address = process.env.AOS_TEMPORAL_TEST_ADDRESS;
if (address !== undefined && address !== "127.0.0.1:7233") {
  throw new Error("Anonymization integration tests require the isolated local Temporal server");
}
const nativeTest = address === undefined ? test.skip : test;
const commands = new AosTemporalCommandsService({
  temporalHost: "127.0.0.1:7233",
  temporalNamespace: "default",
  payloadStorage: null,
});
afterAll(() => commands.close());

describe("anonymization with a local PDF echo worker", () => {
  nativeTest(
    "recovers a completed result and isolates owners without accepting replacement bytes",
    async () => {
      const requestId = randomUUID();
      const pdf = "%PDF-local-original";
      const request = (sub: string, file?: Blob) =>
        executeAnonymizationRequest(
          { requestId, file },
          (input) => commands.executeAnonymization(input),
          { sub },
        );
      const first = (await request("owner-a", new Blob([pdf]))).unwrap();
      expect(await first.text()).toBe(pdf);
      const recovered = (await request("owner-a")).unwrap();
      expect(await recovered.text()).toBe(pdf);
      const foreign = await request("owner-b");
      expect(foreign.status).toBe("error");
      if (foreign.isErr()) expect(foreign.error.status).toBe(404);
      const replaced = await request("owner-a", new Blob(["%PDF-different"]));
      expect(replaced.status).toBe("error");
      if (replaced.isErr()) expect(replaced.error.status).toBe(409);
    },
  );

  nativeTest("a missing fileless request never starts a substitute workflow", async () => {
    const result = await executeAnonymizationRequest(
      { requestId: randomUUID() },
      (input) => commands.executeAnonymization(input),
      { sub: "owner-a" },
    );
    expect(result.status).toBe("error");
    if (result.isErr()) expect(result.error.status).toBe(404);
  });

  nativeTest("parallel original uploads recover the same retained document", async () => {
    const requestId = randomUUID();
    const upload = () =>
      executeAnonymizationRequest(
        { requestId, file: new Blob(["%PDF-parallel"]) },
        (input) => commands.executeAnonymization(input),
        { sub: "owner-a" },
      );
    const [first, second] = await Promise.all([upload(), upload()]);
    expect(await first.unwrap().text()).toBe("%PDF-parallel");
    expect(await second.unwrap().text()).toBe("%PDF-parallel");
  });
});
