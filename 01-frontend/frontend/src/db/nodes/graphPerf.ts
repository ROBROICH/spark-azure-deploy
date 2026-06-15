type GraphPerfDetail = Record<string, unknown>;

type GraphPerfEvent = {
  atMs: number;
  detail?: GraphPerfDetail;
  durationMs?: number;
  kind: 'mark' | 'measure' | 'memory';
  name: string;
};

type GraphPerfAggregate = {
  count: number;
  maxDurationMs: number;
  totalDurationMs: number;
};

type GraphPerfStore = {
  aggregates: Record<string, GraphPerfAggregate>;
  createdAtIso: string;
  events: GraphPerfEvent[];
  url: string;
};

declare global {
  interface Window {
    __GRAPH_PERF__?: GraphPerfStore;
  }
}

const GRAPH_PERF_PARAM = 'graphPerf';

const canUseWindow = () => typeof window !== 'undefined';

type PerformanceWithMemory = Performance & {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
};

export const isGraphPerfEnabled = () => {
  if (!canUseWindow()) {
    return false;
  }

  return (
    new URLSearchParams(window.location.search).get(GRAPH_PERF_PARAM) === '1'
  );
};

const toRoundedNumber = (value: number) => Number(value.toFixed(3));

const getGraphPerfStore = () => {
  if (!isGraphPerfEnabled() || !canUseWindow()) {
    return null;
  }

  window.__GRAPH_PERF__ ??= {
    aggregates: {},
    createdAtIso: new Date().toISOString(),
    events: [],
    url: window.location.href,
  };

  return window.__GRAPH_PERF__;
};

const recordGraphPerfEvent = (event: GraphPerfEvent) => {
  const store = getGraphPerfStore();

  if (!store) {
    return;
  }

  store.events.push(event);

  if (event.durationMs === undefined) {
    return;
  }

  const aggregate = store.aggregates[event.name] ?? {
    count: 0,
    maxDurationMs: 0,
    totalDurationMs: 0,
  };

  aggregate.count += 1;
  aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, event.durationMs);
  aggregate.totalDurationMs += event.durationMs;
  store.aggregates[event.name] = aggregate;
};

export const markGraphPerf = (name: string, detail?: GraphPerfDetail) => {
  if (!isGraphPerfEnabled()) {
    return;
  }

  recordGraphPerfEvent({
    atMs: toRoundedNumber(performance.now()),
    detail,
    kind: 'mark',
    name,
  });
};

export const measureGraphPerf = <T>(
  name: string,
  fn: () => T,
  detail?: GraphPerfDetail,
) => {
  if (!isGraphPerfEnabled()) {
    return fn();
  }

  const start = performance.now();

  try {
    return fn();
  } finally {
    recordGraphPerfEvent({
      atMs: toRoundedNumber(start),
      detail,
      durationMs: toRoundedNumber(performance.now() - start),
      kind: 'measure',
      name,
    });
  }
};

// This async measurement helper is dead code after route instrumentation was
// removed, but keep it available for later graph debugging sessions.
export const measureAsyncGraphPerf = async <T>(
  name: string,
  fn: () => Promise<T>,
  detail?: GraphPerfDetail,
) => {
  if (!isGraphPerfEnabled()) {
    return fn();
  }

  const start = performance.now();

  try {
    return await fn();
  } finally {
    recordGraphPerfEvent({
      atMs: toRoundedNumber(start),
      detail,
      durationMs: toRoundedNumber(performance.now() - start),
      kind: 'measure',
      name,
    });
  }
};

export const sampleGraphPerfMemory = (
  name: string,
  detail?: GraphPerfDetail,
) => {
  if (!isGraphPerfEnabled()) {
    return;
  }

  const memory = (performance as PerformanceWithMemory).memory;

  if (!memory) {
    return;
  }

  recordGraphPerfEvent({
    atMs: toRoundedNumber(performance.now()),
    detail: {
      ...detail,
      jsHeapSizeLimitMb: toRoundedNumber(memory.jsHeapSizeLimit / 1024 / 1024),
      totalJSHeapSizeMb: toRoundedNumber(memory.totalJSHeapSize / 1024 / 1024),
      usedJSHeapSizeMb: toRoundedNumber(memory.usedJSHeapSize / 1024 / 1024),
    },
    kind: 'memory',
    name,
  });
};
