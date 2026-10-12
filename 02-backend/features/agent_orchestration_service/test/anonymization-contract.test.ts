import { describe, expect, test } from "bun:test";
import { executeAnonymizationRequest } from "../src/routes/anonymization.ts";
import type { AnonymizationCommandInput } from "../src/schemas.ts";

describe("AOS anonymization request", () => {
  test("a fileless retry carries no invented document", async () => {
    let command: AnonymizationCommandInput | undefined;
    const response = (
      await executeAnonymizationRequest(
        { requestId: "00000000-0000-4000-8000-000000000101" },
        async (input) => {
          command = input;
          return {
            pdfBase64: Buffer.from("redacted").toString("base64"),
            mediaType: "application/pdf",
          };
        },
        { sub: "owner-a" },
      )
    ).unwrap();
    expect(command?.pdfBase64).toBeUndefined();
    expect(await response.text()).toBe("redacted");
  });

  test("the same request identifier has different execution identities for different authenticated owners", async () => {
    const identities: string[] = [];
    for (const sub of ["owner-a", "owner-b"]) {
      (
        await executeAnonymizationRequest(
          { requestId: "00000000-0000-4000-8000-000000000101", file: new Blob(["%PDF-original"]) },
          async (input) => {
            identities.push(input.executionId);
            return {
              pdfBase64: Buffer.from("redacted").toString("base64"),
              mediaType: "application/pdf",
            };
          },
          { sub },
        )
      ).unwrap();
    }
    expect(identities[0]).not.toBe(identities[1]);
  });
});
