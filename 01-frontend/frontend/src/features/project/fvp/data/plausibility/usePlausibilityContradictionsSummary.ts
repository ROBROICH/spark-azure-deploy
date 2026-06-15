import { usePlausibilityContradictions } from './usePlausibilityContradictions';

export type PlausibilityContradictionsSummary = {
  total: number;
  open: number;
  onRequestList: number;
  ignored: number;
  resolved: number;
};

/**
 * Exposes a neutral project-level read model for contradiction summary counts
 * so sibling FVP features do not depend on PlausibilityCheck-owned modules.
 */
export const usePlausibilityContradictionsSummary = (projectId: string) => {
  const { contradictions, isLoading, isError } =
    usePlausibilityContradictions(projectId);

  const summary: PlausibilityContradictionsSummary = {
    total: contradictions.length,
    open: 0,
    onRequestList: 0,
    ignored: 0,
    resolved: 0,
  };

  for (const contradiction of contradictions) {
    if (contradiction.isOnRequestList) {
      summary.onRequestList++;
    }

    switch (contradiction.status) {
      case 'OPEN':
        summary.open++;
        break;
      case 'IGNORED':
        summary.ignored++;
        break;
      case 'RESOLVED':
        summary.resolved++;
        break;
    }
  }

  return { summary, isLoading, isError };
};
