import { NODE_TYPE_LITERALS } from '@/db/nodes/nodeTypeLabels';
import { NodeGraph } from '@/features/dev-tools/node-graph/NodeGraph';
import { ProjectNavbar } from '@/features/project/route-navbar/ProjectNavbar';
import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import { isDevModeEnabled } from '@/features/dev-mode/useDevMode';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';

export const examinationDevSearchSchema = z.object({
  view: z.enum(['graph', 'diagram', 'data']).catch('graph').default('graph'),
  selectedNodeType: z
    .enum(NODE_TYPE_LITERALS)
    .catch('gesetz')
    .default('gesetz'),
  selectedNodeId: z.string().catch('').default(''),
  selectedDescendantType: z
    .enum(NODE_TYPE_LITERALS)
    .catch('satz')
    .default('satz'),
  graphDataTopicId: z.string().catch('').default(''),
  selectedGraphNodeId: z.string().catch('').default(''),
  showDescendants: z.boolean().catch(false).default(false),
});

export const Route = createFileRoute('/verfahren/$verfahrenId/examination-dev')(
  {
    validateSearch: examinationDevSearchSchema,
    beforeLoad: () => {
      if (!isDevModeEnabled()) {
        throw notFound();
      }
    },
    component: RouteComponent,
  },
);

function RouteComponent() {
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
      <Suspense fallback={<ProjectNavbarSkeleton />}>
        <ProjectNavbar
          selectedStep="overview"
          titleOverride="Nodes Dev Tools"
        />
      </Suspense>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 p-8">
        <NodeGraph />
      </main>
    </div>
  );
}
