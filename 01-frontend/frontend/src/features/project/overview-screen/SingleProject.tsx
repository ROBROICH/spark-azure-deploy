import { getRouteApi } from '@tanstack/react-router';
import { DeadlinesCard } from './deadlines-card/DeadlinesCard';
import { ProjectOverviewNavbarSection } from './ProjectOverviewNavbarSection';
import { ReadOnlyDocumentsCard } from './read-only-documents-table/ReadOnlyDocumentsCard';
import { TeamCard } from './team-card/TeamCard';
import { DocumentsUpdateDialog } from './documents-update-dialog/DocumentsUpdateDialog';
import { DocumentsUploadProvider } from './documents-update-dialog/DocumentsUploadContext';
import { DocumentsUploadToast } from './documents-update-dialog/DocumentsUploadToast';
import { ProjectMasterDataSection } from './ProjectMasterDataSection';

const route = getRouteApi('/verfahren/$verfahrenId/');

/**
 * Project overview page — shows metadata cards and the feature-owned documents card.
 *
 * @returns The full project overview layout.
 */
export const SingleProject = () => {
  const { verfahrenId } = route.useParams();

  return (
    <DocumentsUploadProvider>
      <div className="flex w-full max-w-container-sm min-w-0 flex-1 flex-col gap-10 overflow-x-clip p-8">
        <ProjectOverviewNavbarSection verfahrenId={verfahrenId} />
        <ProjectMasterDataSection />
        <DeadlinesCard />
        <TeamCard />

        <ReadOnlyDocumentsCard />
      </div>
      <DocumentsUpdateDialog />
      <DocumentsUploadToast />
    </DocumentsUploadProvider>
  );
};
