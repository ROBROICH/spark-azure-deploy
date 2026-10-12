import { AdministrationScreen } from '@/features/administration/AdministrationScreen';
import { requireAdministrationAccess } from '@/features/administration/route/requireAdministrationAccess';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/administration/')({
  beforeLoad: async ({ context }) => {
    await requireAdministrationAccess(context.queryClient);
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <AdministrationScreen />;
}
