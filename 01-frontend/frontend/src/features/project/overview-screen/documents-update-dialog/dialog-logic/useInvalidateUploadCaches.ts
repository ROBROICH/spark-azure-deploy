import { useQueryClient } from '@tanstack/react-query';

/**
 * Returns helpers that invalidate the full set of caches affected by a ZIP
 * upload workflow transition. Centralized so the upload, confirm, reject, and
 * dialog-close paths stay in lockstep when a new query key is added.
 *
 * @returns invalidateForProject — invalidates `['files', projectId]`, `['processing-files', projectId]`, and `['projects']`. invalidateForWorkflowTransition — also invalidates the temporal workflows list, used after upload-handshake and approve-decision settle.
 */
export const useInvalidateUploadCaches = () => {
  const queryClient = useQueryClient();

  const invalidateForProject = async (projectId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['files', projectId] }),
      queryClient.invalidateQueries({
        queryKey: ['processing-files', projectId],
      }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };

  const invalidateForWorkflowTransition = async (projectId: string) => {
    await Promise.all([
      invalidateForProject(projectId),
      queryClient.invalidateQueries({
        queryKey: [{ _id: 'getWorkflowsTemporalWorkflowsGet' }],
      }),
    ]);
  };

  return { invalidateForProject, invalidateForWorkflowTransition };
};
