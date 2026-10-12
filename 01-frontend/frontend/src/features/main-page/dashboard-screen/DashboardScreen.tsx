import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { getRouteApi } from '@tanstack/react-router';
import { Calendar, Folder, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button/Button';
import { CalendarWidget } from '../calendar-widget/CalendarWidget';
import { CreateProjectForm } from '../create-project-form/CreateProjectForm';
import { useFavorites } from '@/features/project/data/project-favorites/useFavorites';
import { ProjectsTableFeature } from '../list-screen/projects-table/ProjectsTableFeature';
import { FavoritesSection } from './FavoritesSection';
import { MainPageHeader } from './MainPageHeader';
import { RedactionAgentPromo } from './RedactionAgentPromo';
import { useProjectList } from '@/features/project/data/collections/projects.collection';

const rootRoute = getRouteApi('/');

/** Dashboard main page with favorite cards, calendar, AI tools, and projects table. */
export const DashboardScreen = () => {
  const { t } = useTranslation('Dashboard');
  const navigate = rootRoute.useNavigate();
  const searchState = rootRoute.useSearch();
  const { displayName: userName } = useCurrentUser();
  // eslint-disable-next-line no-restricted-syntax -- dialog open state is ephemeral UI state and should not be persisted in the route
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const effectiveMode = getConfiguredProductMode();
  const isEwmsOnly = effectiveMode === 'ewms';
  const { favoriteIds } = useFavorites();

  const { data: projects, isLoading } = useProjectList({ ids: favoriteIds });
  const favoriteProjects = favoriteIds.flatMap((id) => {
    const project = projects.find((candidate) => candidate.id === id);
    return project ? [project] : [];
  });

  return (
    <div className="flex-1 bg-white">
      <main className="mx-auto mt-6 flex w-full max-w-container-sm flex-col bg-white p-4 sm:p-8">
        <div className="flex flex-col gap-10">
          <MainPageHeader
            userName={userName}
            onCreateProject={() => setCreateProjectOpen(true)}
          />

          <FavoritesSection
            isLoading={isLoading}
            favoriteIds={favoriteIds}
            favoriteProjects={favoriteProjects}
          />

          {!isEwmsOnly && (
            <RedactionAgentPromo
              onTryNow={() => navigate({ to: '/schwaerzungsagent' })}
            />
          )}

          {/* Deadlines and dates section — omitted in EWMS-only mode */}
          {!isEwmsOnly && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="rounded-lg bg-bg-quaternary p-2"
                >
                  <Calendar className="size-4" aria-hidden="true" />
                </span>
                <h2 className="flex-1 text-base font-medium tracking-tight text-text-primary">
                  {t('deadlinesAndDates')}
                </h2>
              </div>
              <CalendarWidget />
            </div>
          )}

          {/* My projects (projects table) */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                className="rounded-lg bg-bg-quaternary p-2"
              >
                <Folder className="size-4" aria-hidden="true" />
              </span>
              <h2 className="flex-1 text-base font-medium tracking-tight text-text-primary">
                {t('myProjects')}
              </h2>
              <Button
                variant="secondary"
                withIcon
                size="sm"
                onClick={() => setCreateProjectOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={createProjectOpen}
              >
                <Plus aria-hidden="true" />
                {t('ProjectsTable.addProject')}
              </Button>
              <CreateProjectForm
                open={createProjectOpen}
                onOpenChange={setCreateProjectOpen}
                onSuccess={(createdProjectId) => {
                  setCreateProjectOpen(false);
                  if (createdProjectId) {
                    navigate({
                      to: '/verfahren/$verfahrenId',
                      params: { verfahrenId: createdProjectId },
                    });
                  }
                }}
              />
            </div>
            <ProjectsTableFeature
              searchState={searchState}
              navigate={navigate}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
