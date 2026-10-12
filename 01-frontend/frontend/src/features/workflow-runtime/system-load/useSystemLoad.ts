import { v1TemporalJobsGetTemporalSystemLoadOptions as getTemporalSystemLoadOptions } from '@/api-clients/backend/@tanstack/react-query.gen';
import { getSystemLoadDisableThresholdPercentage } from '@/features/workflow-runtime/system-load/systemLoadThreshold';
import { useQuery } from '@tanstack/react-query';

const SYSTEM_LOAD_REFETCH_INTERVAL_MS = 120_000;

type UseSystemLoadOptions = {
  refetchInterval?: number | false;
};

export function useSystemLoad(options: UseSystemLoadOptions = {}) {
  const { refetchInterval = SYSTEM_LOAD_REFETCH_INTERVAL_MS } = options;
  const systemLoadQuery = useQuery({
    ...getTemporalSystemLoadOptions(),
    refetchInterval,
  });
  const loadPercentage = systemLoadQuery.data?.loadPercentage;
  const disableThresholdPercentage = getSystemLoadDisableThresholdPercentage();

  return {
    data: systemLoadQuery.data,
    disableThresholdPercentage,
    isError: systemLoadQuery.isError,
    isFetching: systemLoadQuery.isFetching,
    isLoading: systemLoadQuery.isLoading,
    isSystemLoadHigh:
      loadPercentage !== undefined &&
      loadPercentage >= disableThresholdPercentage,
    refetch: systemLoadQuery.refetch,
  };
}
