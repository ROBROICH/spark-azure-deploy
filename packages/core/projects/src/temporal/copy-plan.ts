import type {
  CopyPlan,
  NodeReference,
  NodeSummaryRow,
  ServiceName,
  TopicNormPayload,
} from "./contracts.ts";
import type { FileDiffEntry, FileDiffSummary } from "@spark-temporal/contracts";

export const DOCUMENT_MANAGEMENT_SERVICE = "documentManagementService";
export const PROJECT_LOGIC_SERVICE = "projectLogicService";
export const EXAMINATION_SERVICE = "examinationService";

export interface NodeKey {
  readonly service: string;
  readonly nodeType: string;
  readonly id: string;
}

export interface ParentRef extends NodeKey {}

export interface NodeSummary extends NodeKey {
  readonly parents: readonly ParentRef[];
  readonly frontendParentIds: readonly string[];
}

interface RevisionRequests {
  readonly mvpTopicNormIds: Set<string>;
  readonly rpbSatzIdsByTopicNormId: Map<string, Set<string>>;
  readonly changedSatzIds: Set<string>;
}

interface Preparation {
  readonly summaries: readonly NodeSummary[];
  readonly deletedKeys: Set<string>;
  readonly changedKeys: Set<string>;
  readonly renamedFileNames: ReadonlyMap<string, string>;
  readonly revisions: RevisionRequests;
  readonly deletedFileIds: Set<string>;
}

const key = ({ service, nodeType, id }: NodeKey): string => `${service}\0${nodeType}\0${id}`;

export function decodeNodeSummaries(rows: readonly NodeSummaryRow[]): NodeSummary[] {
  const serviceByRef = new Map(rows.map((row) => [`${row.nodeType}\0${row.id}`, row._service]));
  return rows.map((row) => ({
    service: row._service,
    id: row.id,
    nodeType: row.nodeType,
    parents: (row.parents ?? []).map((parent) => {
      const service = serviceByRef.get(`${parent.nodeType}\0${parent.id}`);
      if (service === undefined) {
        throw new Error(`Missing owning service for parent ${parent.nodeType}:${parent.id}`);
      }
      return { service, nodeType: parent.nodeType, id: parent.id };
    }),
    frontendParentIds: (row.frontendParentIds ?? []).map(String),
  }));
}

export function collectDependents(
  roots: readonly NodeKey[],
  summaries: readonly NodeSummary[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const summary of summaries) {
    for (const parent of summary.parents) {
      const parentKey = key(parent);
      const current = children.get(parentKey) ?? [];
      current.push(key(summary));
      children.set(parentKey, current);
    }
  }
  const known = new Set(summaries.map(key));
  const visited = new Set<string>();
  const queue = roots.map(key);
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const child of children.get(current) ?? []) {
      if (!visited.has(child)) queue.push(child);
    }
  }
  return new Set([...visited].filter((entry) => known.has(entry)));
}

const parentIds = (summary: NodeSummary, service: string, nodeType: string): Set<string> =>
  new Set(
    summary.parents
      .filter((parent) => parent.service === service && parent.nodeType === nodeType)
      .map(({ id }) => id),
  );

const firstParentId = (
  summary: NodeSummary,
  service: string,
  nodeType: string,
): string | undefined =>
  summary.parents.find((parent) => parent.service === service && parent.nodeType === nodeType)?.id;

const frontendIds = (summary: NodeSummary, nodeType: string): Set<string> => {
  const prefix = `${nodeType}:`;
  return new Set(
    summary.frontendParentIds
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length)),
  );
};

const fileIds = (entries: readonly FileDiffEntry[] | undefined): Set<string> =>
  new Set((entries ?? []).map(({ fileId }) => fileId));

const fileRoots = (ids: ReadonlySet<string>): NodeKey[] =>
  [...ids].map((id) => ({
    service: DOCUMENT_MANAGEMENT_SERVICE,
    nodeType: "file",
    id,
  }));

function revisionRequests(
  summaries: readonly NodeSummary[],
  changedKeys: ReadonlySet<string>,
): RevisionRequests {
  const byKey = new Map(summaries.map((summary) => [key(summary), summary]));
  const requests: RevisionRequests = {
    mvpTopicNormIds: new Set(),
    rpbSatzIdsByTopicNormId: new Map(),
    changedSatzIds: new Set(),
  };
  const changedTopicIds = new Set<string>();
  for (const summary of summaries) {
    if (!changedKeys.has(key(summary))) continue;
    if (summary.service === EXAMINATION_SERVICE && summary.nodeType === "dokument") {
      for (const id of frontendIds(summary, "topic")) changedTopicIds.add(id);
    }
    if (summary.service === EXAMINATION_SERVICE && summary.nodeType === "fundstelle") {
      const satzId = firstParentId(summary, EXAMINATION_SERVICE, "satz");
      const normId = firstParentId(summary, EXAMINATION_SERVICE, "norm");
      if (satzId === undefined || normId === undefined) continue;
      requests.changedSatzIds.add(satzId);
      const norm = byKey.get(key({ service: EXAMINATION_SERVICE, nodeType: "norm", id: normId }));
      if (norm === undefined) continue;
      for (const topicNormId of frontendIds(norm, "topic_norm")) {
        const ids = requests.rpbSatzIdsByTopicNormId.get(topicNormId) ?? new Set();
        ids.add(satzId);
        requests.rpbSatzIdsByTopicNormId.set(topicNormId, ids);
      }
    }
  }
  for (const summary of summaries) {
    if (summary.service !== PROJECT_LOGIC_SERVICE || summary.nodeType !== "topic_norm") continue;
    if (
      [...parentIds(summary, PROJECT_LOGIC_SERVICE, "topic")].some((id) => changedTopicIds.has(id))
    ) {
      requests.mvpTopicNormIds.add(summary.id);
    }
  }
  return requests;
}

function prepare(rows: readonly NodeSummaryRow[], fileDiff: FileDiffSummary): Preparation {
  const summaries = decodeNodeSummaries(rows);
  const deletedFileIds = fileIds(fileDiff.deleted);
  const deletedKeys = collectDependents(fileRoots(deletedFileIds), summaries);
  const changedKeys = collectDependents(fileRoots(fileIds(fileDiff.changed)), summaries);
  const combined = new Set([...changedKeys, ...deletedKeys]);
  const renamedFileNames = new Map<string, string>();
  for (const entry of fileDiff.renamed ?? []) {
    const target = entry.targetFilename ?? entry.newName ?? entry.filename;
    if (target !== undefined) renamedFileNames.set(entry.fileId, target);
  }
  return {
    summaries,
    deletedKeys,
    changedKeys,
    renamedFileNames,
    revisions: revisionRequests(summaries, combined),
    deletedFileIds,
  };
}

export function topicNormNodeRefs(preparation: Preparation): NodeReference[] {
  const ids = new Set([
    ...preparation.revisions.mvpTopicNormIds,
    ...preparation.revisions.rpbSatzIdsByTopicNormId.keys(),
  ]);
  return [...ids].sort().map((id) => ({ nodeType: "topic_norm", id }));
}

function build(
  preparation: Preparation,
  topicNormPayloadRows: readonly TopicNormPayload[],
): CopyPlan {
  const payloads = new Map(topicNormPayloadRows.map((row) => [row.id, row]));
  const survivors: Record<string, NodeReference[]> = {};
  for (const summary of preparation.summaries) {
    if (
      summary.service === DOCUMENT_MANAGEMENT_SERVICE ||
      preparation.deletedKeys.has(key(summary))
    )
      continue;
    let overrides: NodeReference["overrides"];
    let setOutdated = false;
    if (summary.service === EXAMINATION_SERVICE) {
      if (
        preparation.changedKeys.has(key(summary)) &&
        ["dokument", "fundstelle"].includes(summary.nodeType)
      ) {
        setOutdated = true;
      }
      if (summary.nodeType === "bewertung") {
        setOutdated = [...parentIds(summary, EXAMINATION_SERVICE, "satz")].some((id) =>
          preparation.revisions.changedSatzIds.has(id),
        );
      }
      if (summary.nodeType === "dokument") {
        const fileId = firstParentId(summary, DOCUMENT_MANAGEMENT_SERVICE, "file");
        if (fileId !== undefined && preparation.renamedFileNames.has(fileId)) {
          overrides = { filename: preparation.renamedFileNames.get(fileId) };
        }
      }
    }
    if (summary.service === PROJECT_LOGIC_SERVICE && summary.nodeType === "topic_norm") {
      const payload = payloads.get(summary.id);
      if (
        preparation.revisions.mvpTopicNormIds.has(summary.id) &&
        payload?.mvpStatus === "checked"
      ) {
        overrides = { ...overrides, mvpStatus: "needs_revision" };
      }
      const satzIds = preparation.revisions.rpbSatzIdsByTopicNormId.get(summary.id);
      if (satzIds !== undefined) {
        const statuses = { ...payload?.satzStatuses };
        let changed = false;
        for (const id of satzIds) {
          if (statuses[id] === "checked") {
            statuses[id] = "needs_revision";
            changed = true;
          }
        }
        if (changed) overrides = { ...overrides, satzStatuses: statuses };
      }
    }
    let node: NodeReference = {
      nodeType: summary.nodeType,
      id: summary.id,
    };
    if (setOutdated) node = { ...node, setOutdated: true };
    if (overrides !== undefined) node = { ...node, overrides };
    (survivors[summary.service] ??= []).push(node);
  }
  return {
    survivorsPerService: survivors,
    deletedFileIds: [...preparation.deletedFileIds].sort(),
    deletedKeysCount: preparation.deletedKeys.size,
  };
}

export async function buildProjectVersionCopyPlan(input: {
  readonly services: readonly ServiceName[];
  readonly projectId: string;
  readonly sourceVersion: number;
  readonly fileDiff: FileDiffSummary;
  readonly listNodes: (
    service: ServiceName,
    projectId: string,
    version: number,
  ) => Promise<readonly NodeSummaryRow[]>;
  readonly batchNodes: (
    service: typeof PROJECT_LOGIC_SERVICE,
    projectId: string,
    version: number,
    nodes: readonly NodeReference[],
  ) => Promise<readonly TopicNormPayload[]>;
}): Promise<CopyPlan> {
  const rows = (
    await Promise.all(
      input.services.map((service) =>
        input.listNodes(service, input.projectId, input.sourceVersion),
      ),
    )
  ).flat();
  const preparation = prepare(rows, input.fileDiff);
  const refs = topicNormNodeRefs(preparation);
  let topicNormPayloadRows: readonly TopicNormPayload[] = [];
  if (refs.length > 0) {
    topicNormPayloadRows = await input.batchNodes(
      PROJECT_LOGIC_SERVICE,
      input.projectId,
      input.sourceVersion,
      refs,
    );
  }
  return build(preparation, topicNormPayloadRows);
}
