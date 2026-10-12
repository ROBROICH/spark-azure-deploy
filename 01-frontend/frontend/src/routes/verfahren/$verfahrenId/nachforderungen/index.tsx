import { NachforderungenPage } from '@/features/project/nachforderungen/NachforderungenPage';
import { redirectExcludedStepToEwms } from '@/features/project/route/productModeRedirect';
import { nachforderungenTabSearchSchema } from '@/features/project/nachforderungen/nachforderungen.search';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const searchSchema = z.object({
  search: z.string().optional().catch(undefined),
  deleteRequestItemId: z.string().optional().catch(undefined),
  nachforderungenTab:
    nachforderungenTabSearchSchema.shape.nachforderungenTab.optional(),
});

export const Route = createFileRoute(
  '/verfahren/$verfahrenId/nachforderungen/',
)({
  beforeLoad: ({ params }) => {
    redirectExcludedStepToEwms(params.verfahrenId);
  },
  component: RouteComponent,
  validateSearch: searchSchema,
});

function RouteComponent() {
  return <NachforderungenPage />;
}
