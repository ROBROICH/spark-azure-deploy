import { toCompositeKey } from './compositeKey';
import { buildProjectNodeIndex } from './examinationGraphModel';
import { measureGraphPerf } from './graphPerf';
import type { NodeSummary } from './types';

type ProjectNodeIndex = ReturnType<typeof buildProjectNodeIndex>;
type NodeIndexStructureSignature = string;

type CachedGraphEntry = {
  index: ProjectNodeIndex;
  summaries: ReadonlyArray<NodeSummary>;
  structureById: ReadonlyMap<string, NodeIndexStructureSignature>;
  structureFingerprint: string;
};

const MAX_CACHED_PROJECT_GRAPHS = 2;
const graphCacheByCollection = new Map<object, CachedGraphEntry>();
const inflightGraphByCollection = new WeakMap<
  object,
  Promise<ProjectNodeIndex>
>();

const getCachedGraphEntry = (collectionKey: object) => {
  const cachedEntry = graphCacheByCollection.get(collectionKey);

  if (!cachedEntry) {
    return undefined;
  }

  graphCacheByCollection.delete(collectionKey);
  graphCacheByCollection.set(collectionKey, cachedEntry);

  return cachedEntry;
};

const setCachedGraphEntry = (
  collectionKey: object,
  cachedGraphEntry: CachedGraphEntry,
) => {
  graphCacheByCollection.delete(collectionKey);

  if (graphCacheByCollection.size >= MAX_CACHED_PROJECT_GRAPHS) {
    const oldestCollectionKey = graphCacheByCollection.keys().next().value;

    if (oldestCollectionKey !== undefined) {
      graphCacheByCollection.delete(oldestCollectionKey);
    }
  }

  graphCacheByCollection.set(collectionKey, cachedGraphEntry);
};

const hasSameSummaryRefs = (
  left: ReadonlyArray<NodeSummary>,
  right: ReadonlyArray<NodeSummary>,
) => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const getParentSignatureParts = (summary: NodeSummary) => {
  return Array.from(
    new Set([
      ...summary.parents.map((parent) => toCompositeKey(parent)),
      ...(summary.frontendParentIds ?? []),
    ]),
  ).sort();
};

const createStructureSignature = (summary: NodeSummary) => {
  return [
    summary.id,
    summary.nodeType,
    toCompositeKey(summary),
    summary.isOutdated ? 'outdated' : 'current',
    getParentSignatureParts(summary).join(','),
  ].join('|');
};

const hashString = (value: string, seed = 2166136261) => {
  let hash = seed;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createStructureFingerprint = (summaries: ReadonlyArray<NodeSummary>) => {
  let xorHash = 0;
  let sumHash = 0;

  for (const summary of summaries) {
    const signature = createStructureSignature(summary);
    const signatureHash = hashString(signature);

    xorHash ^= signatureHash;
    sumHash = (sumHash + signature.length + signatureHash) >>> 0;
  }

  return `${summaries.length}:${xorHash >>> 0}:${sumHash}`;
};

const buildStructureById = (summaries: ReadonlyArray<NodeSummary>) => {
  const structureById = new Map<string, NodeIndexStructureSignature>();

  for (const summary of summaries) {
    structureById.set(summary.id, createStructureSignature(summary));
  }

  return structureById;
};

const hasSameIndexStructure = (
  previous: ReadonlyMap<string, NodeIndexStructureSignature>,
  nextSummaries: ReadonlyArray<NodeSummary>,
) => {
  if (previous.size !== nextSummaries.length) {
    return false;
  }

  for (const summary of nextSummaries) {
    if (previous.get(summary.id) !== createStructureSignature(summary)) {
      return false;
    }
  }

  return true;
};

/** Reuses a prebuilt project node index while node summaries keep the same structure. */
export const getCachedOrBuildProjectGraph = (
  collectionKey: object,
  summaries: ReadonlyArray<NodeSummary>,
) => {
  const cachedEntry = getCachedGraphEntry(collectionKey);

  if (cachedEntry) {
    if (cachedEntry.summaries === summaries) {
      return cachedEntry.index;
    }

    if (hasSameSummaryRefs(cachedEntry.summaries, summaries)) {
      setCachedGraphEntry(collectionKey, {
        ...cachedEntry,
        summaries,
      });

      return cachedEntry.index;
    }

    const nextStructureFingerprint = createStructureFingerprint(summaries);

    if (
      cachedEntry.structureFingerprint === nextStructureFingerprint &&
      hasSameIndexStructure(cachedEntry.structureById, summaries)
    ) {
      setCachedGraphEntry(collectionKey, {
        ...cachedEntry,
        summaries,
      });

      return cachedEntry.index;
    }
  }

  if (import.meta.env.DEV && summaries.length > 50_000) {
    // eslint-disable-next-line no-console -- large-index rebuild logging is intentionally limited to dev diagnostics for cache misses.
    console.info(
      `[graph] rebuilding project node index for ${summaries.length} summaries`,
    );
  }

  const index = measureGraphPerf(
    'projectGraphCache.buildGraph',
    () => buildProjectNodeIndex(summaries),
    { summaryCount: summaries.length },
  );

  setCachedGraphEntry(collectionKey, {
    index,
    summaries,
    structureById: buildStructureById(summaries),
    structureFingerprint: createStructureFingerprint(summaries),
  });

  return index;
};

export const ensureProjectGraphReady = async (
  collectionKey: object,
  resolveSummaries: () => Promise<ReadonlyArray<NodeSummary>>,
) => {
  const inflightGraph = inflightGraphByCollection.get(collectionKey);

  if (inflightGraph) {
    return inflightGraph;
  }

  const graphPromise = (async () => {
    const summaries = await resolveSummaries();
    return getCachedOrBuildProjectGraph(collectionKey, summaries);
  })();

  inflightGraphByCollection.set(collectionKey, graphPromise);

  try {
    return await graphPromise;
  } finally {
    if (inflightGraphByCollection.get(collectionKey) === graphPromise) {
      inflightGraphByCollection.delete(collectionKey);
    }
  }
};
