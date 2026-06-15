import { useEffect, useRef } from 'react';
import { markGraphPerf, sampleGraphPerfMemory } from '../graphPerf';

type GraphPerfDetail = Record<string, unknown>;

type UseGraphPerfReadyOnceParams = {
  detail?: GraphPerfDetail;
  enabled: boolean;
  name: string;
};

type UseGraphPerfReadyByKeyParams = {
  detail?: GraphPerfDetail;
  enabled: boolean;
  key: string | null;
  name: string;
};

const scheduleGraphPerfReadySample = (
  name: string,
  detail: GraphPerfDetail | undefined,
) => {
  const frameId = requestAnimationFrame(() => {
    markGraphPerf(name, detail);
    sampleGraphPerfMemory(name, detail);
  });

  return () => {
    cancelAnimationFrame(frameId);
  };
};

/**
 * Records one graph perf mark+memory sample the first time `enabled` becomes true.
 * Keep diagnostics in db/nodes so feature files stay easy to clean up later.
 */
export const useGraphPerfReadyOnce = (params: UseGraphPerfReadyOnceParams) => {
  const { detail, enabled, name } = params;
  const hasRecordedRef = useRef(false);

  // eslint-disable-next-line no-restricted-syntax -- this hook bridges React readiness to requestAnimationFrame so diagnostics run after the graph can paint
  useEffect(() => {
    if (!enabled || hasRecordedRef.current) {
      return;
    }

    hasRecordedRef.current = true;
    return scheduleGraphPerfReadySample(name, detail);
  }, [detail, enabled, name]);
};

/**
 * Records graph perf mark+memory samples when a keyed ready state resolves.
 * Repeated renders with the same key are ignored.
 */
export const useGraphPerfReadyByKey = (
  params: UseGraphPerfReadyByKeyParams,
) => {
  const { detail, enabled, key, name } = params;
  const lastRecordedKeyRef = useRef<string | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- keyed diagnostics intentionally subscribe to browser frame timing when a new ready state resolves
  useEffect(() => {
    if (!enabled || key === null || lastRecordedKeyRef.current === key) {
      return;
    }

    lastRecordedKeyRef.current = key;
    return scheduleGraphPerfReadySample(name, detail);
  }, [detail, enabled, key, name]);
};
