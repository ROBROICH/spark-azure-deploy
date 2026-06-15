import { cancelUploadProcessV2FilesFileIdCancelGet } from '@/api-clients/dms-module';
import {
  setFileDiffV2FilesFileIdDiffPostMutation,
  submitApprovalV2FilesFileIdDecisionPostMutation,
} from '@/api-clients/dms-module/@tanstack/react-query.gen';
import { useMutation } from '@tanstack/react-query';

// Narrow contract: consumers only use `mutateAsync` and `isPending`. Exposing
// `Pick<UseMutationResult, ...>` keeps the mutation arg/result generics
// implementation-defined while letting test mocks construct concrete objects
// without `as unknown as` casts.
type ApprovalMutationContract<TInput, TOutput> = {
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
};

type SetFileDiffInput = Parameters<
  ReturnType<typeof useApprovalActionsRaw>['setFileDiff']['mutateAsync']
>[0];
type SetFileDiffOutput = Awaited<
  ReturnType<
    ReturnType<typeof useApprovalActionsRaw>['setFileDiff']['mutateAsync']
  >
>;
type SubmitDecisionInput = Parameters<
  ReturnType<typeof useApprovalActionsRaw>['submitDecision']['mutateAsync']
>[0];
type SubmitDecisionOutput = Awaited<
  ReturnType<
    ReturnType<typeof useApprovalActionsRaw>['submitDecision']['mutateAsync']
  >
>;
type CancelUploadOutput = Awaited<
  ReturnType<
    ReturnType<typeof useApprovalActionsRaw>['cancelUpload']['mutateAsync']
  >
>;

export type ApprovalActions = {
  setFileDiff: ApprovalMutationContract<SetFileDiffInput, SetFileDiffOutput>;
  submitDecision: ApprovalMutationContract<
    SubmitDecisionInput,
    SubmitDecisionOutput
  >;
  cancelUpload: ApprovalMutationContract<string, CancelUploadOutput>;
};

// Internal raw-shape factory used solely to derive the input/output types
// above. Consumers should use `useApprovalActions` which exposes the narrow
// `ApprovalActions` contract.
const useApprovalActionsRaw = () => {
  const setFileDiff = useMutation(setFileDiffV2FilesFileIdDiffPostMutation());
  const submitDecision = useMutation(
    submitApprovalV2FilesFileIdDecisionPostMutation(),
  );
  const cancelUpload = useMutation({
    mutationFn: async (fileId: string) => {
      const { data } = await cancelUploadProcessV2FilesFileIdCancelGet({
        path: { file_id: fileId },
      });
      return data;
    },
  });
  return { setFileDiff, submitDecision, cancelUpload };
};

/**
 * Wraps the DMS approval-flow endpoints (set diff, submit decision, cancel upload)
 * as TanStack mutations so callers can await each action individually.
 *
 * @returns The three mutations narrowed to the `mutateAsync` + `isPending`
 *   contract that consumers depend on.
 */
export const useApprovalActions = (): ApprovalActions => {
  return useApprovalActionsRaw();
};
