import { PlausibilityCheckScreen } from '@/features/project/fvp/plausibility-check/PlausibilityCheckScreen';
import { plausibilityCheckSearchSchema } from '@/features/project/fvp/plausibility-check/plausibilityCheck.search';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/verfahren/$verfahrenId/fvp/pp/')({
  component: RouteComponent,
  validateSearch: plausibilityCheckSearchSchema,
});

function RouteComponent() {
  return <PlausibilityCheckScreen />;
}
