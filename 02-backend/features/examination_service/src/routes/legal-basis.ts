import type { AuthPolicy } from "@spark-workflow/authentification";
import type { ProjectsService } from "@spark-workflow/core/projects/resource";
import { isoInstant, type FeatureHttp, type HttpJson } from "@spark-workflow/http-host";
import { executeNodeMutation, type RequestAuthorization } from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  buildRechtsmethodikWritePlan,
  type ExaminationNormResult,
} from "@spark-temporal/contracts";
import { better, type SelectInput } from "better-drizzle";
import { sql } from "drizzle-orm";
import { makePgArray } from "drizzle-orm/pg-core";
import { t } from "elysia";

import {
  BundeslandSchema,
  LegalBasisAddNormsResponseSchema,
  LegalBasisAddRequestSchema,
  LegalBasisNormResponseSchema,
  UuidSchema,
} from "../contracts.ts";
import { examinationSchema, normDeconstruction } from "../db/schema.ts";
import { examinationErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import { LawDatabaseClient } from "../law-database.ts";

const lawSelect = {
  id: true,
  projectId: true,
  projectVersion: true,
  name: true,
  jurabk: true,
  frontendParentIds: true,
  isDeleted: true,
  isOutdated: true,
  updateType: true,
  createdAt: true,
  updatedAt: true,
} satisfies SelectInput<typeof examinationSchema, "gesetz">;
const normSelect = {
  id: true,
  projectId: true,
  projectVersion: true,
  gesetzId: true,
  paragraphNr: true,
  paragraphTitel: true,
  text: true,
  regelungsgegenstand: true,
  frontendParentIds: true,
  isDeleted: true,
  isOutdated: true,
  updateType: true,
  createdAt: true,
  updatedAt: true,
} satisfies SelectInput<typeof examinationSchema, "norm">;

const readPolicy = { roles: ["admin", "user", "service"] } satisfies AuthPolicy;
const writePolicy = {
  roles: ["admin", "user", "service"],
  permissions: [{ resource: "project", permission: "update", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const listQuery = T.Object(
  {
    jurabk: T.Optional(T.String()),
    paragraphNr: T.Optional(T.String()),
    doknr: T.Optional(T.String()),
    bundesland: T.Optional(BundeslandSchema),
    limit: T.Optional(t.Numeric({ minimum: 1 })),
    offset: T.Optional(t.Numeric({ minimum: 0 })),
  },
  { additionalProperties: false },
);
const projectParams = T.Object({ projectId: UuidSchema }, { additionalProperties: false });
const writeQuery = T.Object(
  { projectVersion: t.Numeric({ minimum: 1 }) },
  { additionalProperties: false },
);

const NullableString = T.Union([T.String(), T.Null()], { default: null });
const StandangabePayloadSchema = T.Object(
  { standtyp: NullableString, standkommentar: NullableString },
  { additionalProperties: true },
);
const DocumentPayloadSchema = T.Object(
  {
    doknr: NullableString,
    jurabk: NullableString,
    langue: NullableString,
    titel: NullableString,
    kurzue: NullableString,
    kurztitel: NullableString,
    bundesland: NullableString,
    doktyp: NullableString,
    fundstelle: NullableString,
    standangaben: T.Array(StandangabePayloadSchema, { default: [] }),
  },
  { additionalProperties: true },
);
const NormPayloadSchema = T.Object(
  {
    jurabk: T.String(),
    paragraph_nr: T.String(),
    titel: NullableString,
    paragraph_text: NullableString,
    doknr: NullableString,
    bundesland: NullableString,
    dokument_typ: NullableString,
    prev: NullableString,
    next: NullableString,
  },
  { additionalProperties: true },
);
const TocPayloadSchema = T.Object(
  {
    Title: NullableString,
    Ident: NullableString,
    paragraph_nr: NullableString,
    paragraph_typ: NullableString,
    text: NullableString,
    jurabk: T.String(),
    doknr: NullableString,
  },
  { additionalProperties: true },
);

type DocumentPayload = Static<typeof DocumentPayloadSchema>;
type NormPayload = Static<typeof NormPayloadSchema>;
type TocPayload = Static<typeof TocPayloadSchema>;
const TopicNormMatchSchema = T.Object(
  {
    id: UuidSchema,
    topicId: UuidSchema,
    jurabk: T.String(),
    paragraphNr: NullableString,
    absatz: NullableString,
    satz: NullableString,
    nummer: NullableString,
  },
  { additionalProperties: true },
);
const TopicNormPayloadSchema = T.Object(
  {
    nodeType: T.Literal("topic_norm"),
    id: UuidSchema,
    topicId: UuidSchema,
    projectId: UuidSchema,
    projectVersion: T.Integer(),
    jurabk: T.String(),
    paragraphNr: NullableString,
    type: T.Union([T.Literal("pruefung"), T.Literal("verfahren")]),
    absatz: NullableString,
    satz: NullableString,
    nummer: NullableString,
    mvpStatus: T.String(),
    satzStatuses: T.Record(T.String(), T.String()),
    frontendParentIds: T.Array(T.String()),
    isDeleted: T.Boolean(),
    isOutdated: T.Boolean(),
    updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
    createdAt: T.String(),
    updatedAt: T.String(),
  },
  { additionalProperties: false },
);
type TopicNormMatch = Static<typeof TopicNormMatchSchema>;
type TopicNormPayload = Static<typeof TopicNormPayloadSchema>;

interface CachedDeconstruction {
  id: string;
  jurabk: string;
  paragraph: string;
  createdAt: Date;
}

type LegalBasisSelection = Static<typeof LegalBasisAddRequestSchema>["norms"][number];
interface LegalBasisListQuery {
  jurabk?: string;
  paragraphNr?: string;
  doknr?: string;
  bundesland?: string;
  limit?: number;
  offset: number;
}

interface LegalBasisPage {
  items: ReturnType<typeof presentLegalBasisNorm>[];
  total: number;
  offset: number;
  limit: number | undefined;
  nextOffset: number | undefined;
}

interface PayloadFailureFacts {
  readonly invalidField?: "norm" | "tableOfContents" | "topicNorms";
  readonly index?: number;
  readonly peerDetail?: string;
}

const parsePayload = <Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
  internal: PayloadFailureFacts,
): Static<Schema> => {
  const parsed = Value.Default(schema, value);
  if (!Value.Check(schema, parsed)) {
    throw examinationErrors.LAW_DATABASE_UNAVAILABLE({ internal: { ...internal } });
  }
  return Value.Parse(schema, parsed);
};

const parseNorms = (value: HttpJson, limit?: number): NormPayload[] => {
  if (!Array.isArray(value)) {
    throw examinationErrors.LAW_DATABASE_UNAVAILABLE({
      internal: { invalidField: "norms" },
    });
  }
  return (limit === undefined ? value : value.slice(0, limit)).map((item, index) =>
    parsePayload(NormPayloadSchema, item, { invalidField: "norm", index }),
  );
};

const parseToc = (value: HttpJson): TocPayload[] => {
  if (!Array.isArray(value)) {
    throw examinationErrors.LAW_DATABASE_UNAVAILABLE({
      internal: { invalidField: "tableOfContents" },
    });
  }
  return value.map((item, index) =>
    parsePayload(TocPayloadSchema, item, { invalidField: "tableOfContents", index }),
  );
};

const normalizeParagraph = (value: string | undefined | null): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const normalized = value.trim().replace(/^§/, "").trim();
  return normalized || undefined;
};

const compactParagraph = (value: string): string =>
  normalizeParagraph(value)?.replace(/[\s\u00a0]+/g, "") ?? value.trim();

const cacheVariants = (value: string): string[] => {
  const normalized = normalizeParagraph(value);
  if (normalized === undefined) return [value];
  const compact = compactParagraph(value);
  return [
    ...new Set([
      value,
      normalized,
      `§ ${normalized}`,
      `§${normalized}`,
      compact,
      `§ ${compact}`,
      `§${compact}`,
    ]),
  ];
};

const cacheKey = (jurabk: string, paragraph: string): string =>
  `${jurabk}\u0000${compactParagraph(paragraph)}`;

const cachedDeconstructions = async (
  postgres: PostgresScope<typeof examinationSchema>,
  norms: readonly NormPayload[],
): Promise<Map<string, CachedDeconstruction>> => {
  const jurabks: string[] = [];
  const paragraphs: string[] = [];
  const keys = new Set<string>();
  for (const norm of norms) {
    for (const paragraph of cacheVariants(norm.paragraph_nr)) {
      const key = `${norm.jurabk}\u0000${paragraph}`;
      if (keys.has(key)) continue;
      keys.add(key);
      jurabks.push(norm.jurabk);
      paragraphs.push(paragraph);
    }
  }
  if (keys.size === 0) return new Map();
  const rows = await postgres.query(async (query) =>
    query
      .select({
        id: normDeconstruction.id,
        jurabk: normDeconstruction.jurabk,
        paragraph: normDeconstruction.paragraph,
        createdAt: normDeconstruction.createdAt,
      })
      .from(normDeconstruction)
      .innerJoin(
        sql`unnest(
          CAST(${makePgArray(jurabks)} AS TEXT[]),
          CAST(${makePgArray(paragraphs)} AS TEXT[])
        ) AS keys(jurabk, paragraph)`,
        sql`${normDeconstruction.jurabk} = keys.jurabk
          AND ${normDeconstruction.paragraph} = keys.paragraph`,
      ),
  );
  const result = new Map<string, CachedDeconstruction>();
  for (const row of rows) {
    const key = cacheKey(row.jurabk, row.paragraph);
    const current = result.get(key);
    if (current === undefined || row.createdAt > current.createdAt) {
      result.set(key, row);
    }
  }
  return result;
};

const idPart = (value: string | null): string =>
  encodeURIComponent(value || "_").replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const presentLegalBasisNorm = (
  normPayload: NormPayload,
  document: DocumentPayload | undefined,
  deconstruction: CachedDeconstruction | undefined,
): Static<typeof LegalBasisNormResponseSchema> => {
  const state = document?.bundesland ?? normPayload.bundesland;
  const doknr = normPayload.doknr ?? document?.doknr ?? null;
  const documentType = document?.doktyp ?? normPayload.dokument_typ;
  const lawTitle = document?.langue ?? document?.titel ?? null;
  const shortTitle = document?.kurzue ?? document?.kurztitel ?? null;
  const name = shortTitle ?? lawTitle ?? normPayload.jurabk;
  const gesetzId = `law-db-gesetz:${idPart(state || "bund")}:${idPart(normPayload.jurabk)}`;
  return {
    jurabk: normPayload.jurabk,
    paragraphNr: normPayload.paragraph_nr,
    paragraphTitel: normPayload.titel,
    gesetzTitel: lawTitle,
    gesetzKurztitel: shortTitle,
    doknr,
    bundesland: state,
    dokumentTyp: documentType,
    gesetz: {
      nodeType: "gesetz",
      id: gesetzId,
      name,
      jurabk: normPayload.jurabk,
      titel: lawTitle,
      kurztitel: shortTitle,
      doknr,
      bundesland: state,
      dokumentTyp: documentType,
      fundstelle: document?.fundstelle ?? null,
      standangaben: (document?.standangaben ?? []).map((entry) => {
        const comment = entry.standkommentar?.trim();
        if (comment) return comment;
        return entry.standtyp?.trim() ?? "";
      }),
    },
    norm: {
      nodeType: "norm",
      id: `law-db-norm:${idPart(state || "bund")}:${idPart(normPayload.jurabk)}:${idPart(normPayload.paragraph_nr)}`,
      gesetzId,
      paragraphNr: normPayload.paragraph_nr,
      paragraphTitel: normPayload.titel,
      text: normPayload.paragraph_text,
      regelungsgegenstand: null,
      doknr,
      prev: normPayload.prev,
      next: normPayload.next,
      frontendParentIds: [],
      isOutdated: false,
    },
    isDeconstructed: deconstruction !== undefined,
    deconstructionId: deconstruction?.id ?? null,
    deconstructionCreatedAt: deconstruction ? isoInstant(deconstruction.createdAt) : null,
  };
};

type SelectedLegalBasisItem = Awaited<ReturnType<typeof selectedNorm>>;
type LegalBasisAddItem = Static<typeof LegalBasisAddNormsResponseSchema>["items"][number];

const compareNorms = (left: NormPayload, right: NormPayload): number => {
  const leftValues = [
    left.jurabk,
    normalizeParagraph(left.paragraph_nr) ?? left.paragraph_nr,
    left.doknr ?? "",
    left.bundesland ?? "",
    left.dokument_typ ?? "",
    left.titel ?? "",
  ];
  const rightValues = [
    right.jurabk,
    normalizeParagraph(right.paragraph_nr) ?? right.paragraph_nr,
    right.doknr ?? "",
    right.bundesland ?? "",
    right.dokument_typ ?? "",
    right.titel ?? "",
  ];
  for (let index = 0; index < leftValues.length; index += 1) {
    const comparison = leftValues[index]!.toLocaleLowerCase().localeCompare(
      rightValues[index]!.toLocaleLowerCase(),
    );
    if (comparison !== 0) return comparison;
  }
  return 0;
};

const nextOffset = (
  offset: number,
  limit: number | undefined,
  returned: number,
  total: number,
): number | undefined => {
  if (limit === undefined) return undefined;
  const next = offset + returned;
  return next < total ? next : undefined;
};

const optionalTextMatches = (left: string | null, right: string | undefined): boolean => {
  const normalizedLeft = left === null ? undefined : left.trim() || undefined;
  const normalizedRight = right?.trim() || undefined;
  return normalizedLeft === normalizedRight;
};

const topicNormMatches = (
  topicNorm: TopicNormMatch,
  topicId: string,
  jurabk: string,
  paragraph: string,
): boolean =>
  topicNorm.topicId === topicId &&
  topicNorm.jurabk === jurabk &&
  normalizeParagraph(topicNorm.paragraphNr) === normalizeParagraph(paragraph) &&
  optionalTextMatches(topicNorm.absatz, undefined) &&
  optionalTextMatches(topicNorm.satz, undefined) &&
  optionalTextMatches(topicNorm.nummer, undefined);

const updateTypeValue = (value: "AUTOMATED" | "MANUAL" | null): "automated" | "manual" | null => {
  if (value === "AUTOMATED") return "automated";
  if (value === "MANUAL") return "manual";
  return null;
};

async function documents(
  lawDatabase: LawDatabaseClient,
  state: string | undefined,
): Promise<DocumentPayload[]> {
  const value = await lawDatabase.get("/documents/", { bundesland: state });
  if (!Array.isArray(value)) {
    throw examinationErrors.LAW_DATABASE_UNAVAILABLE({
      internal: { invalidField: "documents" },
    });
  }
  return value.map((item, index) =>
    parsePayload(DocumentPayloadSchema, item, {
      peerDetail: `Law database returned an invalid document payload at index ${index}.`,
    }),
  );
}

async function document(
  lawDatabase: LawDatabaseClient,
  jurabk: string,
  state?: string | null,
): Promise<DocumentPayload> {
  return parsePayload(
    DocumentPayloadSchema,
    await lawDatabase.get(`/documents/${encodeURIComponent(jurabk)}`, {
      bundesland: state,
    }),
    { peerDetail: "Law database returned an invalid document payload." },
  );
}

async function searchNorms(
  lawDatabase: LawDatabaseClient,
  query: Pick<LegalBasisListQuery, "jurabk" | "paragraphNr" | "doknr" | "bundesland">,
  limit?: number,
): Promise<NormPayload[]> {
  return parseNorms(
    await lawDatabase.get("/norms/search", {
      include_absaetze: false,
      jurabk: query.jurabk,
      paragraph_nr: normalizeParagraph(query.paragraphNr),
      doknr: query.doknr,
      bundesland: query.bundesland,
    }),
    limit,
  );
}

async function browse(
  lawDatabase: LawDatabaseClient,
  postgres: PostgresScope<typeof examinationSchema>,
  query: LegalBasisListQuery,
): Promise<LegalBasisPage> {
  const availableDocuments = await documents(lawDatabase, query.bundesland);
  const byDocument = new Map(
    availableDocuments
      .filter(({ doknr }) => doknr !== null)
      .map((document) => [document.doknr!, document]),
  );
  const byLawAndState = new Map(
    availableDocuments
      .filter(({ jurabk }) => jurabk !== null)
      .map((document) => [`${document.jurabk}\u0000${document.bundesland ?? ""}`, document]),
  );
  const paragraph = normalizeParagraph(query.paragraphNr);
  const candidates: Array<{ norm: NormPayload; document: DocumentPayload }> = [];
  for (const entry of parseToc(await lawDatabase.get("/toc/"))) {
    if (entry.paragraph_typ !== "§") continue;
    const entryParagraph = normalizeParagraph(entry.paragraph_nr);
    if (entryParagraph === undefined || (paragraph !== undefined && entryParagraph !== paragraph)) {
      continue;
    }
    const document =
      (entry.doknr === null ? undefined : byDocument.get(entry.doknr)) ??
      byLawAndState.get(`${entry.jurabk}\u0000${query.bundesland ?? ""}`);
    if (document === undefined) continue;
    candidates.push({
      norm: {
        jurabk: entry.jurabk,
        paragraph_nr: entryParagraph,
        titel: entry.text ?? entry.Title,
        paragraph_text: entry.text ?? entry.Title ?? "",
        doknr: entry.doknr,
        bundesland: document.bundesland,
        dokument_typ: document.doktyp,
        prev: null,
        next: null,
      },
      document,
    });
  }
  candidates.sort((left, right) => compareNorms(left.norm, right.norm));
  const total = candidates.length;
  const page = candidates.slice(
    query.offset,
    query.limit === undefined ? undefined : query.offset + query.limit,
  );
  const cache = await cachedDeconstructions(
    postgres,
    page.map(({ norm: payload }) => payload),
  );
  const items = page.map(({ norm: payload, document }) =>
    presentLegalBasisNorm(
      payload,
      document,
      cache.get(cacheKey(payload.jurabk, payload.paragraph_nr)),
    ),
  );
  return {
    items,
    total,
    offset: query.offset,
    limit: query.limit,
    nextOffset: nextOffset(query.offset, query.limit, items.length, total),
  };
}

async function selectedNorm(
  lawDatabase: LawDatabaseClient,
  postgres: PostgresScope<typeof examinationSchema>,
  selection: LegalBasisSelection,
) {
  const jurabk = selection.jurabk.trim();
  const paragraph = normalizeParagraph(selection.paragraphNr);
  if (!jurabk) {
    throw examinationErrors.LAW_NORM_REQUEST_INVALID({
      internal: { invalidField: "jurabk" },
    });
  }
  if (paragraph === undefined) {
    throw examinationErrors.LAW_NORM_REQUEST_INVALID({
      internal: { invalidField: "paragraphNr" },
    });
  }
  const matches = await searchNorms(lawDatabase, { jurabk, paragraphNr: paragraph }, 2);
  if (matches.length === 0) {
    throw examinationErrors.LAW_NORM_NOT_FOUND({ internal: { jurabk, paragraph } });
  }
  if (matches.length > 1) {
    throw examinationErrors.LAW_NORM_AMBIGUOUS({
      internal: { jurabk, paragraph, matchCount: matches.length },
    });
  }
  const payload = matches[0]!;
  const cache = await cachedDeconstructions(postgres, [payload]);
  const cached = cache.get(cacheKey(payload.jurabk, payload.paragraph_nr));
  const item = presentLegalBasisNorm(
    payload,
    await document(lawDatabase, payload.jurabk, payload.bundesland),
    cached,
  );
  if (!item.norm.text) {
    throw examinationErrors.LAW_NORM_TEXT_MISSING({
      internal: { jurabk: item.jurabk, paragraph: item.paragraphNr },
    });
  }
  const normResult: ExaminationNormResult =
    cached === undefined
      ? {
          gesetz: item.gesetz.name,
          jurabk: item.jurabk,
          standangaben: [],
          paragraphNr: item.paragraphNr,
          paragraphTitel: item.paragraphTitel,
          paragraphText: item.norm.text,
          absaetze: [],
          regelungsgegenstand: item.norm.regelungsgegenstand,
        }
      : (
          await postgres.query(async (query) =>
            better(query, { schema: examinationSchema })
              .normDeconstruction.findUnique({
                select: { deconstruction: true },
                where: { id: cached.id },
              })
              .throw(() =>
                examinationErrors.NORM_MATERIALIZATION_FAILED({
                  message: "Selected norm deconstruction is no longer available",
                  internal: { deconstructionId: cached.id },
                }),
              ),
          )
        ).deconstruction;
  return {
    ...item,
    normResult,
  };
}

async function findTopicNorm(
  projects: ProjectsService,
  projectId: string,
  projectVersion: number,
  topicId: string,
  jurabk: string,
  paragraph: string,
): Promise<TopicNormPayload | undefined> {
  const listed = await projects.listTopicNorms(topicId);
  if (listed.isErr()) throw listed.error;
  for (const [index, value] of listed.value.entries()) {
    const candidate = parsePayload(TopicNormMatchSchema, value, {
      invalidField: "topicNorms",
      index,
    });
    if (!topicNormMatches(candidate, topicId, jurabk, paragraph)) continue;
    const nodes = await projects.batchNodes(projectId, projectVersion, [
      { nodeType: "topic_norm", id: candidate.id },
    ]);
    if (nodes.isErr()) throw nodes.error;
    const node = nodes.value.find((item) => item.id === candidate.id);
    return node === undefined
      ? undefined
      : parsePayload(TopicNormPayloadSchema, node, {
          peerDetail: "Project data returned an invalid topic_norm payload.",
        });
  }
  return undefined;
}

async function getOrCreateTopicNorm(
  projects: ProjectsService,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  topicId: string,
  normType: "pruefung" | "verfahren",
  jurabk: string,
  paragraph: string,
): Promise<{ topicNorm: TopicNormPayload; created: boolean }> {
  const normalizedParagraph = normalizeParagraph(paragraph) ?? paragraph;
  const existing = await findTopicNorm(
    projects,
    projectId,
    projectVersion,
    topicId,
    jurabk,
    normalizedParagraph,
  );
  if (existing !== undefined) return { topicNorm: existing, created: false };
  const result = await projects.executeNodeMutation(auth, projectId, projectVersion, {
    inserts: [
      {
        nodeType: "topic_norm",
        payload: {
          topicId,
          jurabk,
          paragraphNr: normalizedParagraph,
          type: normType,
          absatz: null,
          satz: null,
          nummer: null,
          mvpStatus: "unchecked",
          satzStatuses: {},
          frontendParentIds: [],
          updateType: "manual",
        },
      },
    ],
    updates: [],
    deletes: [],
  });
  if (result.isErr()) throw result.error;
  const created = result.value.inserted.find((item) => item.nodeType === "topic_norm");
  if (created === undefined) {
    throw examinationErrors.PROJECT_DATA_UNAVAILABLE({
      internal: { projectId, projectVersion, topicId, invalidField: "topicNorm" },
    });
  }
  return {
    topicNorm: parsePayload(TopicNormPayloadSchema, created, {
      peerDetail: "Project data returned an invalid inserted topic_norm.",
    }),
    created: true,
  };
}

export const createLegalBasisRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("examination-service.routes.legal-basis")
    .get(
      "/legal-basis/norms",
      async ({ query, set, postgres, configuration }) => {
        const lawDatabase = new LawDatabaseClient(configuration.lawDatabaseBaseUrl);
        const request = { ...query, offset: query.offset ?? 0 };
        let page: LegalBasisPage;
        if (!request.jurabk && !request.doknr) {
          page = await browse(lawDatabase, postgres, request);
        } else {
          const all = (await searchNorms(lawDatabase, request)).sort(compareNorms);
          const selected = all.slice(
            request.offset,
            request.limit === undefined ? undefined : request.offset + request.limit,
          );
          const cache = await cachedDeconstructions(postgres, selected);
          const documents = new Map<string, DocumentPayload>();
          for (const payload of selected) {
            const state = request.bundesland ?? payload.bundesland;
            const key = `${payload.jurabk}\u0000${state ?? ""}`;
            if (!documents.has(key)) {
              documents.set(key, await document(lawDatabase, payload.jurabk, state));
            }
          }
          const items = selected.map((payload) => {
            const state = request.bundesland ?? payload.bundesland;
            return presentLegalBasisNorm(
              payload,
              documents.get(`${payload.jurabk}\u0000${state ?? ""}`),
              cache.get(cacheKey(payload.jurabk, payload.paragraph_nr)),
            );
          });
          page = {
            items,
            total: all.length,
            offset: request.offset,
            limit: request.limit,
            nextOffset: nextOffset(request.offset, request.limit, items.length, all.length),
          };
        }
        set.headers["X-Total-Count"] = String(page.total);
        set.headers["X-Returned-Count"] = String(page.items.length);
        set.headers["X-Offset"] = String(page.offset);
        set.headers["X-Has-More"] = page.nextOffset === undefined ? "false" : "true";
        if (page.limit !== undefined) set.headers["X-Limit"] = String(page.limit);
        if (page.nextOffset !== undefined) {
          set.headers["X-Next-Offset"] = String(page.nextOffset);
        }
        return page.items;
      },
      {
        query: listQuery,
        response: T.Array(LegalBasisNormResponseSchema),
        auth: readPolicy,
        configuration: true,
        detail: { operationId: "getLegalBasisNorms" },
      },
    )
    .post(
      "/legal-basis/projects/:projectId/norms",
      async ({ params, query, body, auth, postgres, projects, nodes, configuration }) => {
        const lawDatabase = new LawDatabaseClient(configuration.lawDatabaseBaseUrl);
        const projectId = params.projectId;
        const projectVersion = query.projectVersion;
        const admission = await projects.validateWriteVersion(projectId, projectVersion);
        if (admission.isErr()) throw admission.error;
        const preflight: SelectedLegalBasisItem[] = [];
        for (const selection of body.norms) {
          preflight.push(await selectedNorm(lawDatabase, postgres, selection));
        }
        return postgres.transact(async () => {
          const locked = await projects.validateWriteVersion(projectId, projectVersion);
          if (locked.isErr()) throw locked.error;
          const fetched = await projects.getTopic(body.topicId);
          if (fetched.isErr()) throw fetched.error;
          const topic = fetched.value;
          if (topic.projectId !== projectId) {
            throw examinationErrors.TOPIC_NOT_FOUND({
              internal: { projectId, topicId: body.topicId },
            });
          }
          const selections = [];
          for (const item of preflight) {
            selections.push({
              item,
              topic: await getOrCreateTopicNorm(
                projects,
                auth,
                projectId,
                projectVersion,
                body.topicId,
                body.type ?? "pruefung",
                item.jurabk,
                item.paragraphNr,
              ),
            });
          }
          const scope = { projectId, projectVersion, isDeleted: false };
          const [gesetze, norms, absaetze, saetze] = await postgres.query(async (query) => {
            const database = better(query, { schema: examinationSchema });
            return Promise.all([
              database.gesetz.findMany({
                select: { id: true, jurabk: true, frontendParentIds: true },
                where: scope,
              }),
              database.norm.findMany({
                select: { id: true, gesetzId: true, paragraphNr: true, frontendParentIds: true },
                where: scope,
              }),
              database.absatz.findMany({
                select: { id: true, normId: true, absatzNr: true },
                where: scope,
              }),
              database.satz.findMany({
                select: { id: true, absatzId: true, satzNr: true, markers: true },
                where: scope,
              }),
            ]);
          });
          const context = { gesetze, norms, absaetze, saetze };
          const materializations = selections.map(({ item, topic }) => ({
            normResult: item.normResult,
            topicNorms: [
              {
                id: topic.topicNorm.id,
                topicId: topic.topicNorm.topicId,
                jurabk: item.jurabk,
                paragraphNr: item.paragraphNr,
              },
            ],
          }));
          const plan = buildRechtsmethodikWritePlan(materializations, context, () =>
            crypto.randomUUID(),
          );
          const result = await executeNodeMutation(nodes, auth, projectId, projectVersion, {
            inserts: plan.inserts.map((item) => ({
              ...item,
              payload:
                item.nodeType === "gesetz" || item.nodeType === "norm"
                  ? { ...item.payload, updateType: "manual" }
                  : item.payload,
            })),
            updates: plan.updates,
          });
          if (result.isErr()) throw result.error;

          const items: LegalBasisAddItem[] = [];
          for (const [index, { item, topic }] of selections.entries()) {
            const materialized = plan.results[index];
            if (materialized === undefined) {
              throw examinationErrors.NORM_MATERIALIZATION_FAILED({
                internal: { projectId, projectVersion, selectionIndex: index },
              });
            }
            const [law, materializedNorm] = await postgres.query(async (query) => {
              const database = better(query, { schema: examinationSchema });
              return Promise.all([
                database.gesetz.findFirst({
                  select: lawSelect,
                  where: { id: materialized.gesetzId, projectVersion, isDeleted: false },
                }),
                database.norm.findFirst({
                  select: normSelect,
                  where: { id: materialized.normId, projectVersion, isDeleted: false },
                }),
              ]);
            });
            if (
              law === null ||
              law.projectId === null ||
              materializedNorm === null ||
              materializedNorm.projectId === null
            ) {
              throw examinationErrors.NORM_MATERIALIZATION_FAILED({
                internal: {
                  projectId,
                  projectVersion,
                  gesetzId: materialized.gesetzId,
                  normId: materialized.normId,
                },
              });
            }
            items.push({
              gesetz: {
                nodeType: "gesetz",
                ...law,
                updateType: updateTypeValue(law.updateType),
              },
              norm: {
                nodeType: "norm",
                ...materializedNorm,
                updateType: updateTypeValue(materializedNorm.updateType),
              },
              topicNorm: topic.topicNorm,
              createdGesetz: materialized.insertedGesetz,
              createdNorm: materialized.insertedNorm,
              createdTopicNorm: topic.created,
              isDeconstructed: item.isDeconstructed,
              deconstructionId: item.deconstructionId,
              deconstructionCreatedAt: item.deconstructionCreatedAt,
            });
          }
          return { items };
        });
      },
      {
        params: projectParams,
        query: writeQuery,
        body: LegalBasisAddRequestSchema,
        response: LegalBasisAddNormsResponseSchema,
        auth: writePolicy,
        projects: true,
        nodes: true,
        configuration: true,
        detail: { operationId: "addLegalBasisNormsToProject" },
      },
    );
