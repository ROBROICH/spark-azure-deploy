import { getRouteApi } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/features/ui/tabs/Tabs';
import { StatisticsPanel } from './graph-view/StatisticsPanel';
import { SubgraphLoader } from './graph-view/SubgraphLoader';
import { GraphDataView } from './graph-view/GraphDataView';
import { TypeLevelGraphView } from './graph-view/TypeLevelGraphView';
import {
  getNodeEdges,
  getNodeSummaries,
} from './graph-data/projectNodeGraph.logic';
import { useNodeGraph } from './graph-data/useNodeGraph';

const examinationDevRoute = getRouteApi(
  '/verfahren/$verfahrenId/examination-dev',
);
const projectRoute = getRouteApi('/verfahren/$verfahrenId');

type NodeGraphView = 'data' | 'diagram' | 'graph';

const EXAMINATION_GRAPH_VIEWS = new Set<string>(['data', 'diagram', 'graph']);

function toNodeGraphView(value: string): NodeGraphView {
  return EXAMINATION_GRAPH_VIEWS.has(value)
    ? (value as NodeGraphView)
    : 'graph';
}

/**
 * Hosts the developer graph explorer, including the URL-backed view toggle,
 * live graph memory estimate, and payload loading statistics.
 */
export function NodeGraph() {
  const { view } = examinationDevRoute.useSearch();
  const navigate = examinationDevRoute.useNavigate();
  const { db } = projectRoute.useLoaderData();
  const graphResult = useNodeGraph();
  const { data: loadedPayloads } = useLiveQuery(db.payloadsCollection);

  const { graph, nodeCountsByType } = graphResult;
  const totalNodeCount = graph.nodeById.size;
  const loadedPayloadCount = loadedPayloads.length;
  const loadedPayloadPercent =
    totalNodeCount === 0 ? 0 : (loadedPayloadCount / totalNodeCount) * 100;
  // eslint-disable-next-line no-restricted-syntax -- estimating loaded graph memory walks the current graph snapshot plus all payloads cached in the route DB and should only rerun when those collections change
  const estimatedGraphMemoryMb = useMemo(() => {
    const snapshot = {
      edges: getNodeEdges(graph),
      nodes: getNodeSummaries(graph),
      payloads: loadedPayloads,
    };

    return (
      new TextEncoder().encode(JSON.stringify(snapshot)).length / 1024 / 1024
    );
  }, [graph, loadedPayloads]);

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        navigate({
          search: (prev) => ({
            ...prev,
            view: toNodeGraphView(value),
          }),
          replace: true,
        });
      }}
      className="min-h-0 flex-1 gap-4"
    >
      <TabsList className="self-center text-sm">
        <TabsTrigger value="graph" className="text-sm">
          Graph
        </TabsTrigger>
        <TabsTrigger value="diagram" className="text-sm">
          Schema Graph
        </TabsTrigger>
        <TabsTrigger value="data" className="text-sm">
          Data Graph
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="graph"
        className="mx-auto w-full max-w-container gap-4"
      >
        <StatisticsPanel
          estimatedGraphMemoryMb={estimatedGraphMemoryMb}
          loadedPayloadCount={loadedPayloadCount}
          loadedPayloadPercent={loadedPayloadPercent}
          nodeCountsByType={nodeCountsByType}
          totalNodes={totalNodeCount}
        />

        <SubgraphLoader />
      </TabsContent>

      <TabsContent value="diagram" className="min-h-0 flex-1 gap-4">
        <TypeLevelGraphView graphResult={graphResult} />
      </TabsContent>

      <TabsContent value="data" className="min-h-0 flex-1 gap-4">
        <GraphDataView graphResult={graphResult} />
      </TabsContent>
    </Tabs>
  );
}
