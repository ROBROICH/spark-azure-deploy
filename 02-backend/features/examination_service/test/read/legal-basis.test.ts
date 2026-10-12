import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  LegalBasisNormsSchema,
  parseReadContract,
  readPaginationHeaders,
  ValidationErrorResponseSchema,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { lawDatabaseReadCallCount, lawDatabaseReadRequestKeys } from "../setup/read-boundaries.ts";

const DOCS = "GET /documents/";
const DOCS_BY = "GET /documents/?bundesland=BY";
const TOC = "GET /toc/";
const SEARCH_BKAG = "GET /norms/search?include_absaetze=false&jurabk=BKAG";
const SEARCH_BKAG_10 = "GET /norms/search?include_absaetze=false&jurabk=BKAG&paragraph_nr=10";
const SEARCH_BY_DOKNR = "GET /norms/search?doknr=DOC-BY-1&include_absaetze=false";
const SEARCH_BY_COMBINED =
  "GET /norms/search?bundesland=BY&include_absaetze=false&jurabk=BYLAW&paragraph_nr=2";
const SEARCH_EXCLUDED = "GET /norms/search?bundesland=BY&include_absaetze=false&jurabk=BKAG";
const SEARCH_FAILURE = "GET /norms/search?include_absaetze=false&jurabk=FAIL";
const DOC_BKAG = "GET /documents/BKAG";
const DOC_BY = "GET /documents/BYLAW?bundesland=BY";

async function withLawDeltas<T>(expected: readonly string[], action: () => Promise<T>): Promise<T> {
  const keys = lawDatabaseReadRequestKeys();
  for (const key of expected) expect(keys).toContain(key);
  const before = new Map(keys.map((key) => [key, lawDatabaseReadCallCount(key)]));
  const result = await action();
  for (const key of keys) {
    expect(lawDatabaseReadCallCount(key) - (before.get(key) ?? 0)).toBe(
      expected.includes(key) ? 1 : 0,
    );
  }
  return result;
}

const legalBasis = (query = "", expected: readonly string[] = [DOCS, TOC]) =>
  withLawDeltas(expected, () => readJson(`/legal-basis/norms${query ? `?${query}` : ""}`));

const parsedPage = (response: Awaited<ReturnType<typeof readJson>>) => ({
  status: response.status,
  headers: readPaginationHeaders(response.headers),
  body: parseReadContract(LegalBasisNormsSchema, response.body),
});

describe("GET /legal-basis/norms HTTP contract", () => {
  externalTest(
    "snapshots the complete browse result and genuine no-limit pagination headers",
    async () => {
      const response = await legalBasis();
      const page = parsedPage(response);

      expect(page.status).toBe(200);
      expect(page.body.map(({ jurabk, paragraphNr }) => `${jurabk}:${paragraphNr}`)).toEqual([
        "BKAG:10",
        "BKAG:11",
        "BYLAW:2",
        "NWLAW:3",
        "SGBI:5",
      ]);
      expect(page.body.filter(({ isDeconstructed }) => isDeconstructed)).toHaveLength(0);
      expect(page).toMatchSnapshot();
    },
  );

  externalTest(
    "normalizes paragraph searches on the browse branch and snapshots an empty match",
    async () => {
      const normalized = parsedPage(
        await legalBasis(`paragraph_nr=${encodeURIComponent(" § 10 ")}`),
      );
      const empty = parsedPage(await legalBasis("paragraph_nr=999"));

      expect(
        normalized.body.map(({ jurabk, paragraphNr }) => `${jurabk}:${paragraphNr}`),
      ).toEqual(["BKAG:10"]);
      expect(empty.body).toEqual([]);
      expect({ normalized, empty }).toMatchSnapshot();
    },
  );

  externalTest("filters a state-only browse without admitting another state", async () => {
    const page = parsedPage(await legalBasis("bundesland=BY", [DOCS_BY, TOC]));

    expect(page.body.map(({ bundesland }) => bundesland)).toEqual(["BY"]);
    expect(page.body.map(({ jurabk }) => jurabk)).not.toContain("NWLAW");
    expect(page).toMatchSnapshot();
  });

  externalTest("freezes direct jurabk and normalized combined law/paragraph searches", async () => {
    const jurabk = parsedPage(await legalBasis("jurabk=BKAG", [SEARCH_BKAG, DOC_BKAG]));
    const combined = parsedPage(
      await legalBasis(`jurabk=BKAG&paragraph_nr=${encodeURIComponent("§ 10")}`, [
        SEARCH_BKAG_10,
        DOC_BKAG,
      ]),
    );

    expect(jurabk.body.map(({ paragraphNr }) => paragraphNr)).toEqual(["10", "11"]);
    expect(combined.body.map(({ paragraphNr }) => paragraphNr)).toEqual(["10"]);
    expect(combined.body[0]?.isDeconstructed).toBe(false);
    expect({ jurabk, combined }).toMatchSnapshot();
  });

  externalTest(
    "freezes exact document and combined state/law/paragraph direct searches",
    async () => {
      const document = parsedPage(await legalBasis("doknr=DOC-BY-1", [SEARCH_BY_DOKNR, DOC_BY]));
      const combined = parsedPage(
        await legalBasis("jurabk=BYLAW&paragraph_nr=2&bundesland=BY", [SEARCH_BY_COMBINED, DOC_BY]),
      );

      expect(document.body).toEqual(combined.body);
      expect(document.body[0]?.doknr).toBe("DOC-BY-1");
      expect(document.body[0]?.bundesland).toBe("BY");
      expect({ document, combined }).toMatchSnapshot();
    },
  );

  externalTest(
    "excludes a federal law from a state and preserves a Law Database failure",
    async () => {
      const excluded = parsedPage(await legalBasis("jurabk=BKAG&bundesland=BY", [SEARCH_EXCLUDED]));
      const failure = await legalBasis("jurabk=FAIL", [SEARCH_FAILURE]);
      const failureBody = parseReadContract(ErrorResponseSchema, failure.body);

      expect(excluded.body).toEqual([]);
      expect(failure.status).toBe(502);
      expect({
        excluded,
        failure: { status: failure.status, body: failureBody },
      }).toMatchSnapshot();
    },
  );

  externalTest(
    "snapshots first, middle, and empty pages with only genuine pagination headers",
    async () => {
      const first = parsedPage(await legalBasis("limit=2&offset=0"));
      const middle = parsedPage(await legalBasis("limit=2&offset=2"));
      const empty = parsedPage(await legalBasis("limit=2&offset=99"));

      expect(first.headers).toEqual({
        totalCount: "5",
        returnedCount: "2",
        offset: "0",
        limit: "2",
        hasMore: "true",
        nextOffset: "2",
      });
      expect(middle.headers.nextOffset).toBe("4");
      expect(empty.headers).toEqual({
        totalCount: "5",
        returnedCount: "0",
        offset: "99",
        limit: "2",
        hasMore: "false",
        nextOffset: null,
      });
      expect({ first, middle, empty }).toMatchSnapshot();
    },
  );

  externalTest(
    "rejects invalid state, limit, and offset before any Law Database call",
    async () => {
      const responses = await withLawDeltas([], () =>
        Promise.all([
          readJson("/legal-basis/norms?bundesland=XX"),
          readJson("/legal-basis/norms?limit=0"),
          readJson("/legal-basis/norms?offset=-1"),
        ]),
      );
      const parsed = responses.map((response) => ({
        status: response.status,
        body: parseReadContract(ValidationErrorResponseSchema, response.body),
      }));

      expect(parsed.map(({ status }) => status)).toEqual([422, 422, 422]);
    },
  );
});
