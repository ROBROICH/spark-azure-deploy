import { v1SupplementaryRequestsGetSupplementaryRequestSources } from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { skipToken, useQuery } from '@tanstack/react-query';

export const useRequestSources = (projectId: string) =>
  useQuery({
    queryKey: ['request-sources', projectId],
    queryFn: projectId
      ? async () => {
          const { data } =
            await v1SupplementaryRequestsGetSupplementaryRequestSources({
              path: { projectId },
              throwOnError: true,
            });
          return data;
        }
      : skipToken,
  });

export const invalidateRequestReads = (projectId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['request-items'] }),
    queryClient.invalidateQueries({ queryKey: ['request-sources', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['request-letter', projectId] }),
    queryClient.invalidateQueries({
      queryKey: ['formal-documents', projectId],
    }),
  ]);
