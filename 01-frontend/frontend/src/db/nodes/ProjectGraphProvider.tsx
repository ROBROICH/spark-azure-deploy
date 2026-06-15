import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { ExaminationDb } from './createExaminationDb';
import {
  countNodesByType,
  getChildNodes,
  getDescendantNodeRefs,
  getNodesByType as getNodesByTypeFromGraph,
  getRootNodeIds,
  hasNode as hasIndexedNode,
} from './examinationGraphModel';
import {
  markGraphPerf,
  measureGraphPerf,
  sampleGraphPerfMemory,
} from './graphPerf';
import { getCachedOrBuildProjectGraph } from './projectGraphCache';
import type { NodeTypeLiteral } from './types';

type ProjectGraphProviderParams = {
  db: ExaminationDb;
};

type ProjectGraphProviderProps = PropsWithChildren<ProjectGraphProviderParams>;

const useProjectGraphContextLogic = (params: ProjectGraphProviderParams) => {
  const { db } = params;
  const { collection, data: summaries } = useLiveSuspenseQuery(
    db.nodesCollection,
  );

  // eslint-disable-next-line no-restricted-syntax -- the shared graph snapshot is reused across provider consumers and should only rebuild when the backing collections change.
  const index = useMemo(
    () =>
      measureGraphPerf(
        'projectGraphContext.graph.resolve',
        () => getCachedOrBuildProjectGraph(collection, summaries),
        { summaryCount: summaries.length },
      ),
    [collection, summaries],
  );
  // eslint-disable-next-line no-restricted-syntax -- root ids are shared through the provider value and should keep a stable identity until the graph changes.
  const roots = useMemo(() => getRootNodeIds(index), [index]);
  // eslint-disable-next-line no-restricted-syntax -- this summary object is part of the provider contract and should only change when the graph changes.
  const nodeCountsByType = useMemo(() => countNodesByType(index), [index]);

  // eslint-disable-next-line no-restricted-syntax -- graph perf diagnostics write to the window-backed perf store after the graph commit completes.
  useEffect(() => {
    markGraphPerf('projectGraphContext.graph.ready', {
      edgeCount: index.edgeCount,
      summaryCount: summaries.length,
      topicCount: nodeCountsByType.get('topic') ?? 0,
      vertexCount: index.nodeById.size,
    });
    sampleGraphPerfMemory('projectGraphContext.graph.ready', {
      edgeCount: index.edgeCount,
      summaryCount: summaries.length,
      vertexCount: index.nodeById.size,
    });
  }, [index, nodeCountsByType, summaries.length]);

  // eslint-disable-next-line no-restricted-syntax -- context provider values are identity-sensitive and should only change when shared graph data actually changes.
  return useMemo(
    () => ({
      getChildren: (nodeId: string) => getChildNodes(index, nodeId),
      getDescendants: (nodeId: string) => getDescendantNodeRefs(index, nodeId),
      getNodesByType: <T extends NodeTypeLiteral>(type: T) =>
        getNodesByTypeFromGraph<T>(index, type),
      hasNode: (nodeId: string) => hasIndexedNode(index, nodeId),
      index,
      isLoadingRequiredGraphData: false,
      nodeCountsByType,
      roots,
    }),
    [index, nodeCountsByType, roots],
  );
};

type ProjectGraphContextValue = ReturnType<typeof useProjectGraphContextLogic>;

const ProjectGraphContext = createContext<ProjectGraphContextValue | null>(
  null,
);

export const useGraph = () => {
  const context = useContext(ProjectGraphContext);

  if (context === null) {
    throw new Error('useGraph must be used within ProjectGraphProvider');
  }

  return context;
};

export const ProjectGraphProvider = (props: ProjectGraphProviderProps) => {
  const { children, db } = props;
  const value = useProjectGraphContextLogic({ db });

  return (
    <ProjectGraphContext.Provider value={value}>
      {children}
    </ProjectGraphContext.Provider>
  );
};
