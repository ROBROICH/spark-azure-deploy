import {
  v1AgentOrchestrationStartBatchMvpWorkflow as startBatchMvpWorkflow,
  v1ProjectLogicInitializeProject as initializeProject,
} from '@/api-clients/backend';
import { createExaminationDb } from '@/db/nodes/createExaminationDb';
import { ensureProjectGraphReady } from '@/db/nodes/projectGraphCache';
import { getCurrentUserQueryOptions } from '@/features/access-control/current-user/currentUser';
import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { organizationUsersCollection } from '@/features/access-control/organization-users/organizationUsers.collection';
import { isProjectOwnerOrMember } from '@/features/access-control/project-permissions/isProjectOwnerOrMember';
import { projectsCollection } from '@/features/project/data/collections/projects.collection';
import { getProjectLatestVersion } from '@/features/project/versioning/projectVersioning';
import { toast } from '@/features/ui/toast/Toast';
import { getProjectTemporalWorkflowsManager } from '@/features/workflow-runtime/workflow-status/projectTemporalWorkflows.collection';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import i18n from 'i18next';

type ProjectRouteLoaderContext = {
  params: {
    verfahrenId: string;
  };
};

const startProjectRouteWorkflows = async (projectId: string) => {
  const requests: Promise<unknown>[] = [
    initializeProject({
      path: { projectId: projectId },
      throwOnError: true,
    }),
  ];

  if (getConfiguredProductMode() === 'spark') {
    requests.push(
      startBatchMvpWorkflow({
        body: { projectId },
        throwOnError: true,
      }),
    );
  }

  await Promise.all(requests);
};

const startProjectRouteWorkflowsBestEffort = async (projectId: string) => {
  try {
    await startProjectRouteWorkflows(projectId);
  } catch {
    toast.error(
      i18n.t('ProjectRouteError.workflowInitializationFailed', {
        ns: 'Project',
      }),
    );
  }
};

export const projectRouteLoader = async (
  loaderContext: ProjectRouteLoaderContext,
) => {
  const { params } = loaderContext;

  // Fetch the project first so deleted projects throw the dedicated 404
  // before best-effort initialization requests are started.
  const project = await projectsCollection.utils.fetchProject(
    params.verfahrenId,
  );

  const currentUser = await queryClient.fetchQuery(
    getCurrentUserQueryOptions(),
  );

  const canAccessProject = isProjectOwnerOrMember({
    project,
    role: currentUser.role,
    userId: currentUser.userId,
  });

  const organizationUsersPreload = canAccessProject
    ? organizationUsersCollection.preload()
    : undefined;

  const projectInitialization = canAccessProject
    ? startProjectRouteWorkflowsBestEffort(params.verfahrenId)
    : undefined;

  const projectVersion = getProjectLatestVersion(project);
  const db = createExaminationDb(params.verfahrenId, projectVersion);
  const workflowsManager = getProjectTemporalWorkflowsManager(
    params.verfahrenId,
    projectVersion,
  );
  const { nodesCollection } = db;

  await Promise.all([organizationUsersPreload, projectInitialization]);

  await ensureProjectGraphReady(nodesCollection, async () => {
    await nodesCollection.preload();

    return Array.from(nodesCollection.state.values());
  });

  return {
    db,
    projectName: project.name,
    projectVersion,
    refetchNodeSummaries: () => nodesCollection.utils.refetch(),
    workflowsManager,
  };
};
