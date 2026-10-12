import { describe, expect, test } from "bun:test";

import {
  ConfirmDownloadResponseSchema,
  FppProjectMutationResponseSchema,
  MutationValidationErrorSchema,
  parseMutationContract,
} from "./support/mutation-contracts.ts";

describe("strict FPP mutation contracts", () => {
  test("parses the complete dynamic import and confirmation responses", () => {
    expect(
      parseMutationContract(FppProjectMutationResponseSchema, {
        requestId: "10000000-0000-4000-8000-000000000001",
        internalProjectId: "FPP-TEST-1",
        name: "FPP test project",
        status: "IMPORTED",
        createdAt: "2026-07-17T08:10:11.123456+00:00",
        updatedAt: "2026-07-17T08:10:12.123456+00:00",
      }),
    ).toMatchObject({ status: "IMPORTED" });

    expect(
      parseMutationContract(ConfirmDownloadResponseSchema, {
        status: "confirmed",
        fileId: "20000000-0000-4000-8000-000000000001",
        dmsFileId: "30000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      status: "confirmed",
      fileId: "20000000-0000-4000-8000-000000000001",
      dmsFileId: "30000000-0000-4000-8000-000000000001",
    });
  });

  test("returns only the declared confirmation fields", () => {
    const input = {
      status: "confirmed",
      fileId: "20000000-0000-4000-8000-000000000001",
      dmsFileId: "30000000-0000-4000-8000-000000000001",
      hidden: true,
    };

    const parsed = parseMutationContract(ConfirmDownloadResponseSchema, input);

    expect(parsed).toEqual({
      status: "confirmed",
      fileId: "20000000-0000-4000-8000-000000000001",
      dmsFileId: "30000000-0000-4000-8000-000000000001",
    });
    expect(Object.hasOwn(parsed, "hidden")).toBeFalse();
    expect(input.hidden).toBeTrue();
  });

  test("parses FastAPI validation detail without weakening its outer shape", () => {
    const parsed = parseMutationContract(MutationValidationErrorSchema, {
      detail: [
        {
          type: "missing",
          loc: ["body", "name"],
          msg: "Field required",
          input: { requestId: "10000000-0000-4000-8000-000000000001" },
        },
      ],
    });
    expect(parsed.detail[0]?.loc).toEqual(["body", "name"]);
  });
});
