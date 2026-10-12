export const isNodeSummaryOutdated = (nodeSummary: unknown) => {
  return (
    (nodeSummary as { isOutdated?: unknown } | null | undefined)?.isOutdated ===
    true
  );
};

export const hasOutdatedNodeSummary = (
  nodeSummaries: ReadonlyArray<unknown>,
) => {
  return nodeSummaries.some(isNodeSummaryOutdated);
};
