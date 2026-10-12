import type { RechtsmethodikWorkflowOutput as RechtsmethodikResult } from "./contracts/rechtsmethodik.js";
import type { SatzOrchestratorWorkflowOutput as SatzChildOutput } from "./contracts/suche-zuordnung.js";

type GraphJson =
  | string
  | number
  | boolean
  | null
  | GraphJson[]
  | { [key: string]: GraphJson | undefined };
type GraphInsert = { nodeType: string; id: string; payload: { [key: string]: GraphJson } };
type GraphUpdate = { nodeType: string; id: string; payload: { [key: string]: GraphJson } };
export interface ExaminationLawContext {
  id: string;
  jurabk: string;
  frontendParentIds?: string[];
}
export interface ExaminationNormContext {
  id: string;
  gesetzId: string;
  paragraphNr: string;
  frontendParentIds?: string[];
}
export interface ExaminationAbsatzContext {
  id: string;
  normId: string;
  absatzNr: string;
}
export interface ExaminationSatzContext {
  id: string;
  absatzId: string;
  satzNr: string;
  markers?: string[];
}
export interface ExaminationRechtsmethodikContext {
  gesetze: ExaminationLawContext[];
  norms: ExaminationNormContext[];
  absaetze: ExaminationAbsatzContext[];
  saetze: ExaminationSatzContext[];
}
export interface ExaminationTopicNorm {
  id: string;
  jurabk: string;
  paragraphNr: string;
  topicId?: string | null;
  subtopicId?: string | null;
}
type RechtsmethodikSatz = RechtsmethodikResult["absaetze"][number]["saetze"][number];
type RechtsmethodikAbsatz = RechtsmethodikResult["absaetze"][number];
export type ExaminationNormResult = Omit<RechtsmethodikResult, "paragraphTitel"> & {
  paragraphTitel: string | null;
};
type VerweiseValue = NonNullable<
  NonNullable<RechtsmethodikSatz["atomareTatbestandsmerkmale"]>[number]
>["verweise"];

export function normalizeNormValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeParagraph(value: string): string {
  return normalizeNormValue(value).replace(/^§+/, "").trim();
}

function mergeParents(existing: readonly string[] | undefined, added: readonly string[]): string[] {
  return [...new Set([...(existing ?? []), ...added])].sort();
}

interface TopicNormMatch {
  ownerType: "topic" | "subtopic";
  ownerId: string;
  topicNormId: string;
}

function topicNormMatches(
  topicNorms: readonly ExaminationTopicNorm[],
): Map<string, TopicNormMatch[]> {
  const matches = new Map<string, TopicNormMatch[]>();
  for (const item of topicNorms) {
    const { id, jurabk, paragraphNr: paragraph, topicId, subtopicId } = item;
    if (topicId == null && subtopicId == null) {
      throw new Error(`topic_norm ${id} is missing a topic/subtopic owner`);
    }
    const key = `${normalizeNormValue(jurabk)}\u0000${normalizeParagraph(paragraph)}`;
    const values = matches.get(key) ?? [];
    if (topicId != null) {
      values.push({ ownerType: "topic", ownerId: topicId, topicNormId: id });
    } else if (subtopicId != null) {
      values.push({ ownerType: "subtopic", ownerId: subtopicId, topicNormId: id });
    }
    matches.set(key, values);
  }
  for (const values of matches.values()) {
    values.sort((left, right) =>
      [left.ownerType, left.ownerId, left.topicNormId]
        .join("\u0000")
        .localeCompare([right.ownerType, right.ownerId, right.topicNormId].join("\u0000")),
    );
  }
  return matches;
}

function uniqueIndex<Item, Key>(
  values: readonly Item[],
  keyOf: (value: Item) => Key,
  label: string,
): Map<Key, Item> {
  const index = new Map<Key, Item>();
  for (const value of values) {
    const key = keyOf(value);
    if (index.has(key)) throw new Error(`Ambiguous ${label} match for ${String(key)}`);
    index.set(key, value);
  }
  return index;
}

function mapVerweise(
  parentId: string,
  parentType: string,
  value: VerweiseValue,
  newId: () => string,
): GraphInsert[] {
  const output: GraphInsert[] = [];
  const parentKey = `${parentType.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())}Id`;
  for (const verweis of value.explizit) {
    if (verweis.technischeNorm != null) continue;
    output.push({
      nodeType: "expliziter_verweis",
      id: newId(),
      payload: {
        [parentKey]: parentId,
        gesetz: verweis.gesetz ?? null,
        paragraphNr: verweis.paragraphNr ?? null,
        absatzNr: verweis.absatzNr ?? null,
        satzNr: verweis.satzNr ?? null,
        untergliederung: verweis.untergliederung ?? [],
        verweisTyp: verweis.verweisTyp ?? null,
        kontext: verweis.kontext ?? null,
      },
    });
  }
  for (const rationale of value.implizit) {
    output.push({
      nodeType: "impliziter_verweis",
      id: newId(),
      payload: {
        [parentKey]: parentId,
        rationale,
      },
    });
  }
  return output;
}

function mapSatzChildren(
  satzId: string,
  satz: RechtsmethodikResult["absaetze"][number]["saetze"][number],
  newId: () => string,
): GraphInsert[] {
  const output: GraphInsert[] = [];
  const rechtsfolge = satz.rechtsfolge;
  if (rechtsfolge != null) {
    const rechtsfolgeId = newId();
    output.push({
      nodeType: "rechtsfolge",
      id: rechtsfolgeId,
      payload: {
        satzId: satzId,
        text: rechtsfolge.text,
      },
    });
    output.push(
      {
        nodeType: "sollensanordnungen",
        id: newId(),
        payload: {
          rechtsfolgeId: rechtsfolgeId,
          kategorie: rechtsfolge.sollensanordnungen,
        },
      },
      {
        nodeType: "adressat",
        id: newId(),
        payload: {
          rechtsfolgeId: rechtsfolgeId,
          entscheidung: rechtsfolge.rechtsfolgenAdressat,
        },
      },
    );
    if (rechtsfolge.ermessensspielraum != null) {
      output.push({
        nodeType: "ermessensspielraum",
        id: newId(),
        payload: {
          rechtsfolgeId: rechtsfolgeId,
          entscheidung: rechtsfolge.ermessensspielraum,
        },
      });
    }
    if (rechtsfolge.ermessensart != null) {
      output.push({
        nodeType: "ermessensart",
        id: newId(),
        payload: {
          rechtsfolgeId: rechtsfolgeId,
          art: rechtsfolge.ermessensart,
        },
      });
    }
    if (rechtsfolge.verweise != null) {
      output.push(...mapVerweise(rechtsfolgeId, "rechtsfolge", rechtsfolge.verweise, newId));
    }
  }
  for (const tbm of satz.atomareTatbestandsmerkmale ?? []) {
    const tbmId = newId();
    output.push({
      nodeType: "atomares_tbm",
      id: tbmId,
      payload: {
        satzId: satzId,
        text: tbm.text,
        prueffrage: tbm.prueffrage,
        pruefgegenstand: tbm.pruefgegenstand,
      },
    });
    for (const explicit of tbm.verweise.explizit) {
      if (explicit.technischeNorm !== null && explicit.technischeNorm !== undefined) {
        output.push({
          nodeType: "technische_norm",
          id: newId(),
          payload: {
            atomaresTbmId: tbmId,
            name: explicit.technischeNorm.kurzbeschreibung,
            confidence: 1,
          },
        });
      }
    }
    for (const item of tbm.rechtsbegriffe.bestimmteRechtsbegriffe) {
      const begriffId = newId();
      output.push({
        nodeType: "bestimmter_rechtsbegriff",
        id: begriffId,
        payload: {
          atomaresTbmId: tbmId,
          begriff: item.begriff,
        },
      });
      for (const definition of item.definitions) {
        output.push({
          nodeType: "legaldefinition",
          id: newId(),
          payload: {
            bestimmterRechtsbegriffId: begriffId,
            begriff: definition.begriff,
            definition: definition.definition,
            sourceJurabk: definition.source.jurabk,
            sourceParagraphNr: definition.source.paragraphNr,
          },
        });
      }
    }
    for (const item of tbm.rechtsbegriffe.unbestimmteRechtsbegriffe) {
      const begriffId = newId();
      output.push({
        nodeType: "unbestimmter_rechtsbegriff",
        id: begriffId,
        payload: {
          atomaresTbmId: tbmId,
          begriff: item.begriff,
          auslegung: item.auslegung ?? null,
        },
      });
      for (const proposal of item["auslegungsvorschläge"]) {
        output.push({
          nodeType: "auslegungsvorschlag",
          id: newId(),
          payload: {
            unbestimmterRechtsbegriffId: begriffId,
            methode: proposal.auslegungMethode,
            text: proposal.auslegungsvorschlag,
          },
        });
      }
    }
    output.push(...mapVerweise(tbmId, "atomares_tbm", tbm.verweise, newId));
  }
  return output;
}

function mapAbsaetze(
  normId: string,
  values: readonly RechtsmethodikAbsatz[],
  existing: Map<string, ExaminationAbsatzContext>,
  existingSatzKeys: Set<string>,
  newId: () => string,
): GraphInsert[] {
  const output: GraphInsert[] = [];
  for (const absatz of values) {
    const absatzKey = `${normId}\u0000${absatz.absatzNr}`;
    const existingAbsatz = existing.get(absatzKey);
    const absatzId = existingAbsatz?.id ?? newId();
    if (existingAbsatz === undefined) {
      output.push({
        nodeType: "absatz",
        id: absatzId,
        payload: {
          normId,
          absatzNr: absatz.absatzNr,
          text: absatz.absatzText,
        },
      });
      existing.set(absatzKey, { id: absatzId, normId, absatzNr: absatz.absatzNr });
    }
    for (const [position, satz] of absatz.saetze.entries()) {
      const satzKey = `${absatzId}\u0000${satz.satzNr}\u0000${JSON.stringify(satz.markers)}`;
      if (existingSatzKeys.has(satzKey)) continue;
      const satzId = newId();
      output.push({
        nodeType: "satz",
        id: satzId,
        payload: {
          absatzId,
          satzNr: satz.satzNr,
          position,
          markers: satz.markers,
          text: satz.satzText,
          normTypLvl1: satz.normTypLvl1,
          normTypLvl2: satz.normTypLvl2 ?? null,
          tatbestandsmerkmale: satz.tatbestandsmerkmale ?? [],
          formel: satz.formel ?? null,
        },
      });
      existingSatzKeys.add(satzKey);
      output.push(...mapSatzChildren(satzId, satz, newId));
    }
  }
  return output;
}

export interface RechtsmethodikWritePlan {
  inserts: GraphInsert[];
  updates: GraphUpdate[];
  results: RechtsmethodikWriteResult[];
}

export interface RechtsmethodikWriteInput {
  normResult: ExaminationNormResult;
  topicNorms: readonly ExaminationTopicNorm[];
}

export interface RechtsmethodikWriteResult {
  jurabk: string;
  paragraphNr: string;
  gesetzId: string;
  normId: string;
  insertedGesetz: boolean;
  insertedNorm: boolean;
  changed: boolean;
}

function mergeFrontendParents(
  nodeType: "gesetz" | "norm",
  id: string,
  frontendParentIds: string[],
  inserts: GraphInsert[],
  updates: GraphUpdate[],
): void {
  const insert = inserts.find((item) => item.id === id);
  if (insert !== undefined) {
    insert.payload = { ...insert.payload, frontendParentIds };
    return;
  }
  const update = updates.find((item) => item.id === id);
  if (update !== undefined) {
    update.payload = { ...update.payload, frontendParentIds };
    return;
  }
  updates.push({ nodeType, id, payload: { frontendParentIds } });
}

export function buildRechtsmethodikWritePlan(
  inputs: readonly RechtsmethodikWriteInput[],
  context: ExaminationRechtsmethodikContext,
  newId: () => string,
): RechtsmethodikWritePlan {
  const laws = uniqueIndex(
    context.gesetze.map((law) => ({
      ...law,
      frontendParentIds: law.frontendParentIds?.slice(),
    })),
    (law) => normalizeNormValue(law.jurabk),
    "gesetz",
  );
  const norms = uniqueIndex(
    context.norms.map((norm) => ({
      ...norm,
      frontendParentIds: norm.frontendParentIds?.slice(),
    })),
    (norm) => `${norm.gesetzId}\u0000${normalizeParagraph(norm.paragraphNr)}`,
    "norm",
  );
  const absaetze = uniqueIndex(
    context.absaetze.map((absatz) => ({ ...absatz })),
    (absatz) => `${absatz.normId}\u0000${absatz.absatzNr}`,
    "absatz",
  );
  const satzKeys = new Set(
    context.saetze.map((satz) => {
      return `${satz.absatzId}\u0000${satz.satzNr}\u0000${JSON.stringify(satz.markers ?? [])}`;
    }),
  );
  const inserts: GraphInsert[] = [];
  const updates: GraphUpdate[] = [];
  const results: RechtsmethodikWriteResult[] = [];

  for (const { normResult, topicNorms } of inputs) {
    const insertCount = inserts.length;
    const updateCount = updates.length;
    let mergedExistingMutation = false;
    const key = `${normalizeNormValue(normResult.jurabk)}\u0000${normalizeParagraph(normResult.paragraphNr)}`;
    const matches = topicNormMatches(topicNorms).get(key) ?? [];
    if (matches.length === 0) {
      throw new Error(
        `No project topic_norm match found for ${normResult.jurabk} ${normResult.paragraphNr}`,
      );
    }
    const gesetzParents = matches.map(({ ownerType, ownerId }) => `${ownerType}:${ownerId}`);
    const normParents = matches.map(({ topicNormId }) => `topic_norm:${topicNormId}`);
    const lawKey = normalizeNormValue(normResult.jurabk);
    const existingLaw = laws.get(lawKey);
    const insertedGesetz = existingLaw === undefined;
    const gesetzId = existingLaw?.id ?? newId();
    if (existingLaw === undefined) {
      inserts.push({
        nodeType: "gesetz",
        id: gesetzId,
        payload: {
          name: normResult.gesetz,
          jurabk: normResult.jurabk,
          frontendParentIds: gesetzParents,
        },
      });
      laws.set(lawKey, {
        id: gesetzId,
        jurabk: normResult.jurabk,
        frontendParentIds: gesetzParents,
      });
      for (const standangabe of normResult.standangaben) {
        const standangabeId = newId();
        inserts.push({
          nodeType: "standangabe",
          id: standangabeId,
          payload: {
            gesetzId,
            standtyp: standangabe.standtyp ?? "",
            standkommentar: standangabe.standkommentar ?? "",
            doknr: standangabe.doknr ?? null,
            externalId: standangabe.externalId ?? null,
          },
        });
      }
    } else {
      const merged = mergeParents(existingLaw.frontendParentIds, gesetzParents);
      if (JSON.stringify(merged) !== JSON.stringify(existingLaw.frontendParentIds ?? [])) {
        mergeFrontendParents("gesetz", gesetzId, merged, inserts, updates);
        existingLaw.frontendParentIds = merged;
        mergedExistingMutation = true;
      }
    }

    const normKey = `${gesetzId}\u0000${normalizeParagraph(normResult.paragraphNr)}`;
    const existingNorm = norms.get(normKey);
    const insertedNorm = existingNorm === undefined;
    const normId = existingNorm?.id ?? newId();
    if (existingNorm === undefined) {
      inserts.push({
        nodeType: "norm",
        id: normId,
        payload: {
          gesetzId,
          paragraphNr: normResult.paragraphNr,
          paragraphTitel: normResult.paragraphTitel,
          text: normResult.paragraphText,
          regelungsgegenstand: normResult.regelungsgegenstand ?? null,
          frontendParentIds: normParents,
        },
      });
      norms.set(normKey, {
        id: normId,
        gesetzId,
        paragraphNr: normResult.paragraphNr,
        frontendParentIds: normParents,
      });
    } else {
      const merged = mergeParents(existingNorm.frontendParentIds, normParents);
      if (JSON.stringify(merged) !== JSON.stringify(existingNorm.frontendParentIds ?? [])) {
        mergeFrontendParents("norm", normId, merged, inserts, updates);
        existingNorm.frontendParentIds = merged;
        mergedExistingMutation = true;
      }
    }

    inserts.push(...mapAbsaetze(normId, normResult.absaetze, absaetze, satzKeys, newId));
    results.push({
      jurabk: normResult.jurabk,
      paragraphNr: normResult.paragraphNr,
      gesetzId,
      normId,
      insertedGesetz,
      insertedNorm,
      changed:
        mergedExistingMutation || inserts.length !== insertCount || updates.length !== updateCount,
    });
  }
  return { inserts, updates, results };
}

export function mapFundstellen(
  output: SatzChildOutput,
  chunkToDokument: Readonly<Record<string, string>>,
  dmsToDokument: Readonly<Record<string, string>>,
  newId: () => string,
) {
  const inserts = [];
  for (const entry of output.originaltexte) {
    const chunks = (entry.chunkIds ?? []).filter(Boolean);
    const dokumentId =
      chunks.map((id) => chunkToDokument[id]).find((id) => id !== undefined) ??
      dmsToDokument[entry.documentId];
    if (dokumentId === undefined) continue;
    inserts.push({
      nodeType: "fundstelle",
      id: newId(),
      payload: {
        satzId: output.satzId,
        gesetzId: output.gesetzId,
        normId: output.normId,
        dokumentId: dokumentId,
        sourceNodeId: entry.nodeId,
        chunkIds: chunks,
        title: entry.title,
        text: entry.text,
        pageNumbers: entry.pageNumbers ?? [],
        frontendParentIds: chunks.map((id) => `chunk:${id}`),
        confidence: entry.confidence ?? null,
        consensusRatio: entry.consensusRatio ?? null,
        relevance: entry.relevance ?? null,
      },
    });
  }
  return inserts;
}
