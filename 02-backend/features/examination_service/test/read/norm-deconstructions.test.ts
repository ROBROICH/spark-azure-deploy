import {describe, expect} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

import {NormDeconstructionsSchema, parseReadContract, } from "../support/read-contracts.ts";
import {externalTest, readJson} from "../support/external-app.ts";

const canonical = (body: ReturnType<typeof parse>) =>
  [...body].sort((left, right) =>
    `${left.jurabk}:${left.paragraph}`.localeCompare(`${right.jurabk}:${right.paragraph}`),
  );
const parse = (value: HttpJson) => parseReadContract(NormDeconstructionsSchema, value);
const read = (query = "") => readJson(`/norm-deconstructions/${query ? `?${query}` : ""}`);

describe("GET /norm-deconstructions/ HTTP contract", () => {
  externalTest(
    "snapshots the complete strict payload without freezing incidental SQL order",
    async () => {
      const response = await read();
      const body = canonical(parse(response.body));

      expect(response.status).toBe(200);
      expect(body.map(({ jurabk, paragraph }) => `${jurabk}:${paragraph}`)).toEqual([
        "LFoG NRW:72",
        "VwVfG NRW:30",
        "VwVfG NRW:87",
      ]);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("freezes jurabk and paragraph filters alone and combined", async () => {
    const [law, paragraph, combined] = await Promise.all([
      read(`jurabk=${encodeURIComponent("LFoG NRW")}`),
      read("paragraph=72"),
      read(`jurabk=${encodeURIComponent("LFoG NRW")}&paragraph=72`),
    ]);
    const payload = {
      law: canonical(parse(law.body)),
      paragraph: canonical(parse(paragraph.body)),
      combined: canonical(parse(combined.body)),
    };

    expect(payload.law).toEqual(payload.paragraph);
    expect(payload.combined).toEqual(payload.law);
    expect(payload).toMatchSnapshot();
  });

  externalTest("preserves exact-match behavior and empty results", async () => {
    const [wrongCase, wrongSpacing, absent] = await Promise.all([
      read(`jurabk=${encodeURIComponent("lfog NRW")}`),
      read(`paragraph=${encodeURIComponent(" 72 ")}`),
      read("jurabk=UNKNOWN&paragraph=999"),
    ]);
    const payload = [wrongCase, wrongSpacing, absent].map((response) => ({
      status: response.status,
      body: canonical(parse(response.body)),
    }));

    expect(payload.every(({ body }) => body.length === 0)).toBe(true);
    expect(payload).toMatchSnapshot();
  });
});
