import { ProjectTypeDetailScreen } from '@/features/administration/project-type-detail-screen/ProjectTypeDetailScreen';
import { administrationDetailSearchSchema } from '@/features/administration/administrationSections';
import { loadAdministrationProjectType } from '@/features/administration/route/loadAdministrationProjectType';
import { requireAdministrationAccess } from '@/features/administration/route/requireAdministrationAccess';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/administration/$projectTypeId')({
  validateSearch: administrationDetailSearchSchema,
  beforeLoad: async ({ context }) => {
    await requireAdministrationAccess(context.queryClient);
  },
  loader: async ({ params }) =>
    loadAdministrationProjectType(params.projectTypeId),
  component: RouteComponent,
});

function RouteComponent() {
  return <ProjectTypeDetailScreen />;
}
