import { v1DocumentManagementCancelFileProcessing as cancelFileProcessing } from '@/api-clients/backend';
import {
  v1DocumentManagementSetFileDiffMutation as setFileDiffMutation,
  v1DocumentManagementSubmitFileApprovalMutation as submitFileApprovalMutation,
} from '@/api-clients/backend/@tanstack/react-query.gen';
import { useMutation } from '@tanstack/react-query';

const useApprovalActionsImplementation = () => {
  const setFileDiff = useMutation(setFileDiffMutation());
  const submitDecision = useMutation(submitFileApprovalMutation());
  const cancelUpload = useMutation({
    mutationFn: async (fileId: string) => {
      const { data } = await cancelFileProcessing({
        path: { fileId },
      });
      return data;
    },
  });
  return { setFileDiff, submitDecision, cancelUpload };
};

type ApprovalActionMutations = ReturnType<
  typeof useApprovalActionsImplementation
>;

export type ApprovalActions = {
  [K in keyof ApprovalActionMutations]: Pick<
    ApprovalActionMutations[K],
    'mutateAsync' | 'isPending'
  >;
};

export const useApprovalActions: () => ApprovalActions =
  useApprovalActionsImplementation;
