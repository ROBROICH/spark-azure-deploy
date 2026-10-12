import { describe, expect, test } from "bun:test";

import {
  ScannerUnavailableError,
  parseScannerResponse,
} from "../src/scanner/clamav-client.ts";

describe("ClamAV response mapping", () => {
  test("accepts only an explicit OK verdict as clean", () => {
    expect(parseScannerResponse(200, '{"status":"OK"}')).toEqual({
      isClean: true,
      threatName: null,
    });
  });

  test("maps both incumbent infected response variants", () => {
    expect(
      parseScannerResponse(
        200,
        '{"status":"FOUND","message":"Eicar-Test-Signature"}',
      ),
    ).toEqual({ isClean: false, threatName: "Eicar-Test-Signature" });
    expect(
      parseScannerResponse(
        406,
        '{"status":"FOUND","message":"Alt-Test-Signature"}',
      ),
    ).toEqual({ isClean: false, threatName: "Alt-Test-Signature" });
    expect(parseScannerResponse(406, "not-json")).toEqual({
      isClean: false,
      threatName: null,
    });
  });

  for (const [label, status, body] of [
    ["malformed clean", 200, "{not-json"],
    ["ambiguous", 200, '{"status":"UNKNOWN"}'],
    ["provider failure", 503, '{"status":"ERROR"}'],
  ] as const) {
    test(`fails closed for ${label}`, () => {
      expect(() => parseScannerResponse(status, body)).toThrow(ScannerUnavailableError);
    });
  }
});
