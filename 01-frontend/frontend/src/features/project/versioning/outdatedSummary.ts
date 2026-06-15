export const isNodeSummaryOutdated = (nodeSummary: unknown) => {
  return (
    (nodeSummary as { is_outdated?: unknown } | null | undefined)
      ?.is_outdated === true
  );
};

export const hasOutdatedNodeSummary = (
  nodeSummaries: ReadonlyArray<unknown>,
) => {
  return nodeSummaries.some(isNodeSummaryOutdated);
};
