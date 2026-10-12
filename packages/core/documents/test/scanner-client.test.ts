import { describe, expect, test } from "bun:test";

import { ClamAvClient, ScannerUnavailableError } from "../src/scanner/clamav-client.ts";
import {
  StrictScannerFake,
  type ScannerExpectation,
  type ScannerOutcome,
} from "./support/strict-scanner-fake.ts";

const exactBytes = new TextEncoder().encode("%PDF-1.4\nDMS TypeScript scanner\0binary\n%%EOF\n");
const expected = (outcome: ScannerOutcome): ScannerExpectation => ({
  outcome,
  body: exactBytes,
});

const withFake = async <Result>(
  expectations: readonly ScannerExpectation[],
  callback: (baseUrl: string) => Promise<Result>,
): Promise<Result> => {
  const fake = new StrictScannerFake(...expectations).start();
  try {
    const result = await callback(fake.baseUrl);
    fake.assertComplete();
    return result;
  } finally {
    fake.stop();
  }
};

describe("production ClamAV stream client", () => {
  test("sends exact bytes and maps clean plus both infected variants", async () => {
    await withFake(
      [expected("clean"), expected("infected"), expected("infected-alternate")],
      async (baseUrl) => {
        const client = new ClamAvClient({ enabled: true, baseUrl });
        expect(await client.scanBytes(exactBytes)).toEqual({ isClean: true, threatName: null });
        expect(await client.scanBytes(exactBytes)).toEqual({
          isClean: false,
          threatName: "Eicar-Test-Signature",
        });
        expect(await client.scanBytes(exactBytes)).toEqual({
          isClean: false,
          threatName: "Alt-Test-Signature",
        });
      },
    );
  });

  for (const outcome of ["malformed", "ambiguous", "unavailable", "closed"] as const) {
    test(`fails closed for ${outcome}`, async () => {
      await withFake([expected(outcome)], async (baseUrl) => {
        const client = new ClamAvClient({ enabled: true, baseUrl });
        expect(await client.scanBytes(exactBytes).catch((error) => error)).toBeInstanceOf(
          outcome === "closed" ? Error : ScannerUnavailableError,
        );
      });
    });
  }

  test("strict fake records an unexpected request", async () => {
    const fake = new StrictScannerFake().start();
    try {
      const response = await fetch(`${fake.baseUrl}/wrong`, { method: "POST", body: exactBytes });
      expect(response.status).toBe(500);
      expect(() => fake.assertComplete()).toThrow("unexpected scanner request");
    } finally {
      fake.stop();
    }
  });
});
