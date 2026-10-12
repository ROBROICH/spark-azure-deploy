import { CreateProjectForm } from '@/features/main-page/create-project-form/CreateProjectForm';
import { ProjectsTableFeature } from '@/features/main-page/list-screen/projects-table/ProjectsTableFeature';
import type { ProjectsTableNavigateFn } from '@/features/main-page/list-screen/projects-table/useProjectsTableRouteState';
import { ProjectStatus } from '@/features/main-page/data/schemas/project.schema';
import { getRouteApi } from '@tanstack/react-router';
import { Folder, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button/Button';

const route = getRouteApi('/verfahren/');

const LEGACY_STATUS_VALUES = new Set(Object.values(ProjectStatus));
const isLegacyProjectStatus = (
  value: string | undefined,
): value is (typeof ProjectStatus)[keyof typeof ProjectStatus] => {
  if (!value) {
    return false;
  }

  return LEGACY_STATUS_VALUES.has(
    value as (typeof ProjectStatus)[keyof typeof ProjectStatus],
  );
};

/**
 * Wraps a router search updater so legacy `/verfahren/?status=...` links are
 * normalized to the shared `statusFilter` shape after the first write.
 */
const createCanonicalSearchUpdater = (
  search: (prev: Record<string, unknown>) => Record<string, unknown>,
) => {
  return (prev: Record<string, unknown>) => ({
    ...search(prev),
    status: undefined,
  });
};

/**
 * Normalizes legacy `?status=` search params into the shared `statusFilter`
 * shape and renders the projects table with a create-project action.
 */
export const ListScreen = () => {
  const { t } = useTranslation('ProjectsOverview');
  const routeNavigate = route.useNavigate();
  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for the create project dialog
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const searchState = route.useSearch();
  const statusFilter = searchState.statusFilter ?? [];
  const legacyStatusFilter = isLegacyProjectStatus(searchState.status)
    ? [searchState.status]
    : [];
  const tableSearchState = {
    ...searchState,
    statusFilter: statusFilter.length > 0 ? statusFilter : legacyStatusFilter,
  };
  const navigate: ProjectsTableNavigateFn = (params) => {
    routeNavigate({
      ...params,
      search: createCanonicalSearchUpdater(params.search),
    });
  };

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col items-center bg-white">
      <div className="mx-auto mt-6 flex w-full max-w-container-sm flex-col bg-white p-4 sm:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className="rounded-lg bg-bg-quaternary p-2"
            >
              <Folder className="size-4" aria-hidden="true" />
            </span>
            <h1 className="flex-1 text-base font-medium tracking-tight text-text-primary">
              {t('pageTitle')}
            </h1>
            <Button
              variant="secondary"
              withIcon
              size="sm"
              onClick={() => setCreateProjectOpen(true)}
              aria-haspopup="dialog"
            >
              <Plus aria-hidden="true" />
              {t('addProject')}
            </Button>
          </div>

          {createProjectOpen && (
            <CreateProjectForm
              open={createProjectOpen}
              onOpenChange={setCreateProjectOpen}
              onSuccess={(createdProjectId) => {
                if (createdProjectId) {
                  routeNavigate({
                    to: '/verfahren/$verfahrenId',
                    params: { verfahrenId: createdProjectId },
                  });
                }
              }}
            />
          )}

          <ProjectsTableFeature
            searchState={tableSearchState}
            navigate={navigate}
          />
        </div>
      </div>
    </main>
  );
};
