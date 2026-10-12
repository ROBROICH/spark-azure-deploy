import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isoInstant } from "@spark-workflow/http-host";
import type { Static } from "@sinclair/typebox";
import { and, eq } from "drizzle-orm";

import { LegalBasisNormResponseSchema } from "../src/contracts.ts";
import { absatz, gesetz, norm, normDeconstruction, satz, standangabe } from "../src/db/schema.ts";
import {
  cachedNorm,
  createLegalBasisFixture,
  databaseUrl,
  lawDocument,
  lawNorm,
  type LegalBasisFixture,
  type LawNormPayload,
} from "./support/legal-basis-postgres.ts";

process.env.AUTH_MODE = "disabled";
const realPostgres = databaseUrl ? describe : describe.skip;
type CatalogNorm = Static<typeof LegalBasisNormResponseSchema>;

realPostgres("legal-basis cache metadata against PostgreSQL", () => {
  let fixture: LegalBasisFixture;
  let norms: LawNormPayload[] = [];

  beforeAll(() => {
    fixture = createLegalBasisFixture(databaseUrl!, (url) => {
      if (url.pathname === "/norms/search") {
        return Response.json(
          norms.filter(
            (norm) =>
              (!url.searchParams.has("jurabk") || norm.jurabk === url.searchParams.get("jurabk")) &&
              (!url.searchParams.has("paragraph_nr") ||
                norm.paragraph_nr === url.searchParams.get("paragraph_nr")),
          ),
        );
      }
      if (url.pathname === "/documents/") {
        return Response.json([...new Set(norms.map(({ jurabk }) => jurabk))].map(lawDocument));
      }
      if (url.pathname.startsWith("/documents/")) {
        return Response.json(
          lawDocument(decodeURIComponent(url.pathname.slice("/documents/".length))),
        );
      }
      if (url.pathname === "/toc/") {
        return Response.json(
          norms.map((norm) => ({
            jurabk: norm.jurabk,
            paragraph_nr: norm.paragraph_nr,
            paragraph_typ: "§",
            doknr: norm.doknr,
            text: norm.paragraph_text,
          })),
        );
      }
      return new Response("No matching Law DB resource", { status: 404 });
    });
  });
  afterAll(() => fixture?.close(), 60_000);

  test("browse matches law/paragraph pairs and selects the newest paragraph spelling", async () => {
    const lawA = `Pair-A-${crypto.randomUUID()}`;
    const lawB = `Pair-B-${crypto.randomUUID()}`;
    fixture.cacheLaws.push(lawA, lawB);
    norms = [lawNorm(lawA, "44"), lawNorm(lawB, "31 a")];
    const winners = [crypto.randomUUID(), crypto.randomUUID()];
    const newest = new Date("2026-09-22T12:00:00.000Z");
    const old = new Date("2026-09-21T12:00:00.000Z");
    await fixture.postgres.query((database) =>
      database.insert(normDeconstruction).values([
        {
          id: crypto.randomUUID(),
          jurabk: lawA,
          paragraph: "44",
          createdAt: old,
          deconstruction: cachedNorm(lawA, "44"),
        },
        {
          id: winners[0]!,
          jurabk: lawA,
          paragraph: "§44",
          createdAt: newest,
          deconstruction: cachedNorm(lawA, "44"),
        },
        {
          id: crypto.randomUUID(),
          jurabk: lawB,
          paragraph: "§31a",
          createdAt: old,
          deconstruction: cachedNorm(lawB, "31a"),
        },
        {
          id: winners[1]!,
          jurabk: lawB,
          paragraph: "31 a",
          createdAt: newest,
          deconstruction: cachedNorm(lawB, "31 a"),
        },
        {
          id: crypto.randomUUID(),
          jurabk: lawA,
          paragraph: "31a",
          createdAt: newest,
          deconstruction: cachedNorm(lawA, "31a"),
        },
        {
          id: crypto.randomUUID(),
          jurabk: lawB,
          paragraph: "44",
          createdAt: newest,
          deconstruction: cachedNorm(lawB, "44"),
        },
      ]),
    );
    const response = await fixture.app.handle(
      new Request("http://examination.test/legal-basis/norms"),
    );
    const body = await response.json();
    expect({ status: response.status, body }).toMatchObject({
      status: 200,
      body: [
        {
          jurabk: lawA,
          paragraphNr: "44",
          deconstructionId: winners[0],
          deconstructionCreatedAt: isoInstant(newest),
          gesetz: { standangaben: ["Published 2026-09-22"] },
        },
        {
          jurabk: lawB,
          paragraphNr: "31 a",
          deconstructionId: winners[1],
          deconstructionCreatedAt: isoInstant(newest),
        },
      ],
    });
  });

  test("direct search matches the canonical cached paragraph spelling", async () => {
    const jurabk = `Direct-${crypto.randomUUID()}`;
    fixture.cacheLaws.push(jurabk);
    norms = [lawNorm(jurabk, "31 a")];
    const id = crypto.randomUUID();
    await fixture.postgres.query((database) =>
      database.insert(normDeconstruction).values({
        id,
        jurabk,
        paragraph: "31a",
        deconstruction: cachedNorm(jurabk, "31a"),
      }),
    );
    const response = await fixture.app.handle(
      new Request(`http://examination.test/legal-basis/norms?jurabk=${jurabk}`),
    );
    expect({ status: response.status, body: await response.json() }).toMatchObject({
      status: 200,
      body: [{ paragraphNr: "31 a", deconstructionId: id, isDeconstructed: true }],
    });
  });

  test("returns complete metadata for 30000 paragraphs without exhausting PostgreSQL bind parameters", async () => {
    const jurabk = `Scale-${crypto.randomUUID()}`;
    fixture.cacheLaws.push(jurabk);
    norms = Array.from({ length: 30_000 }, (_, index) => lawNorm(jurabk, String(index + 1)));
    const createdAt = new Date("2026-09-22T10:00:00.000Z");
    const payload = { ...cachedNorm(jurabk, "1"), absaetze: [] };
    const rows = await fixture.client<{ id: string; paragraph: string }[]>`
      INSERT INTO norm_deconstruction (id, jurabk, paragraph, deconstruction, created_at)
      SELECT gen_random_uuid(), ${jurabk}, n::text,
        jsonb_set(${payload}::jsonb, '{paragraphNr}', to_jsonb(n::text)), ${createdAt}
      FROM generate_series(1, 30000) AS n
      RETURNING id, paragraph
    `;
    const response = await fixture.app.handle(
      new Request(`http://examination.test/legal-basis/norms?jurabk=${jurabk}`),
    );
    expect(response.status).toBe(200);
    const body: CatalogNorm[] = await response.json();
    expect(response.headers.get("X-Total-Count")).toBe("30000");
    expect(response.headers.get("X-Returned-Count")).toBe("30000");
    expect(
      new Map(
        body.map((item) => [
          item.paragraphNr,
          [item.deconstructionId, item.deconstructionCreatedAt],
        ]),
      ),
    ).toEqual(new Map(rows.map((row) => [row.paragraph, [row.id, isoInstant(createdAt)]])));

    const page = await fixture.app.handle(
      new Request(`http://examination.test/legal-basis/norms?jurabk=${jurabk}&offset=8&limit=3`),
    );
    expect(page.status).toBe(200);
    expect(await page.json()).toEqual(body.slice(8, 11));
    expect(page.headers.get("X-Total-Count")).toBe("30000");
    expect(page.headers.get("X-Next-Offset")).toBe("11");
  }, 60_000);

  test("POST loads the selected canonical graph after browsing its metadata", async () => {
    const jurabk = `Graph-${crypto.randomUUID()}`;
    fixture.cacheLaws.push(jurabk);
    norms = [lawNorm(jurabk, "44")];
    const cached = cachedNorm(jurabk, "44");
    const id = crypto.randomUUID();
    await fixture.postgres.query((database) =>
      database.insert(normDeconstruction).values({
        id,
        jurabk,
        paragraph: "44",
        deconstruction: cached,
      }),
    );
    const catalog = await fixture.app.handle(
      new Request("http://examination.test/legal-basis/norms"),
    );
    expect({ status: catalog.status, body: await catalog.json() }).toMatchObject({
      status: 200,
      body: [{ deconstructionId: id }],
    });
    const { projectId, topicId } = await fixture.createProject();
    const response = await fixture.app.handle(
      new Request(
        `http://examination.test/legal-basis/projects/${projectId}/norms?projectVersion=1`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topicId, norms: [{ jurabk, paragraphNr: "44" }] }),
        },
      ),
    );
    expect({ status: response.status, body: await response.json() }).toMatchObject({
      status: 200,
      body: {
        items: [
          { deconstructionId: id, norm: { text: cached.paragraphText }, createdTopicNorm: true },
        ],
      },
    });
    const graph = await fixture.postgres.query((database) =>
      database
        .select({
          paragraph: norm.paragraphNr,
          absatz: absatz.absatzNr,
          sentence: satz.text,
          markers: satz.markers,
          stand: standangabe.standkommentar,
        })
        .from(gesetz)
        .innerJoin(
          norm,
          and(eq(norm.gesetzId, gesetz.id), eq(norm.projectVersion, gesetz.projectVersion)),
        )
        .innerJoin(
          absatz,
          and(eq(absatz.normId, norm.id), eq(absatz.projectVersion, norm.projectVersion)),
        )
        .innerJoin(
          satz,
          and(eq(satz.absatzId, absatz.id), eq(satz.projectVersion, absatz.projectVersion)),
        )
        .innerJoin(
          standangabe,
          and(
            eq(standangabe.gesetzId, gesetz.id),
            eq(standangabe.projectVersion, gesetz.projectVersion),
          ),
        )
        .where(eq(gesetz.projectId, projectId)),
    );
    expect(graph).toEqual([
      {
        paragraph: "44",
        absatz: "1",
        sentence: "A protected species must be preserved.",
        markers: ["Nr. 1"],
        stand: "Published 2026-09-22",
      },
    ]);
  });
});
