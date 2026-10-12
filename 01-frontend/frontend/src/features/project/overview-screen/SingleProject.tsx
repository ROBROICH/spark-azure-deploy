import { getConfiguredProductMode } from '@/features/shared/config/productMode';
import { getRouteApi } from '@tanstack/react-router';
import { DeadlinesCard } from './deadlines-card/DeadlinesCard';
import { ProjectOverviewNavbarSection } from './ProjectOverviewNavbarSection';
import { ReadOnlyDocumentsCard } from './read-only-documents-table/ReadOnlyDocumentsCard';
import { TeamCard } from './team-card/TeamCard';
import { ProjectMasterDataSection } from './ProjectMasterDataSection';

const route = getRouteApi('/verfahren/$verfahrenId/');

/**
 * Project overview page — shows metadata cards and the feature-owned documents card.
 *
 * @returns The full project overview layout.
 */
export const SingleProject = () => {
  const { verfahrenId } = route.useParams();

  const effectiveMode = getConfiguredProductMode();
  return (
    <main className="flex w-full max-w-container-sm min-w-0 flex-1 flex-col gap-10 overflow-x-clip p-4 sm:p-8">
      <ProjectOverviewNavbarSection verfahrenId={verfahrenId} />
      <ProjectMasterDataSection />
      <DeadlinesCard />
      <TeamCard />

      {effectiveMode === 'spark' && <ReadOnlyDocumentsCard />}
    </main>
  );
};
