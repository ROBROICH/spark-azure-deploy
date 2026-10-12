import { defineConfig } from '@hey-api/openapi-ts';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

config();
config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const plugins = ['@tanstack/react-query', '@hey-api/client-fetch'] as const;

const stripGeneratedClientTodoCommentsPostProcess = {
  name: 'Strip generated client files TODO comments',
  command: 'node',
  args: ['src/scripts/strip-generated-client-todos.js', '{{path}}'],
} as const;

const generatedClientOutput = (path: string) => ({
  path,
  postProcess: [stripGeneratedClientTodoCommentsPostProcess],
});

const apiSpecPath = fileURLToPath(
  new URL(
    '../../02-backend/service_api_docs/specs/spark-backend.json',
    import.meta.url,
  ),
);
const LAW_CHANGES_OPENAPI_URL = process.env.VITE_LAW_CHANGES_OPENAPI_URL;
const legacyOperationNamespaces = [
  ['/api/supplementary-requests/v1', 'v1SupplementaryRequests'],
  ['/api/plausibility-notes/v1', 'v1PlausibilityNotes'],
  ['/api/agent-orchestration/v1', 'v1AgentOrchestration'],
  ['/api/examination/v1', 'v1Examination'],
  ['/api/feedback/v1', 'v1Feedback'],
  ['/api/protocol/v1', 'v1Protocol'],
  ['/api/comment/v1', 'v1Comment'],
  ['/api/identity', 'v1Identity'],
  ['/api/fcs/v1', 'v1FormalCompleteness'],
  ['/api/fpp/v1', 'v1Fpp'],
  ['/api/oms/v1', 'v1ObjectionsManagement'],
  ['/api/vae/v1', 'v1AdministrativeFileDraft'],
  ['/api/dms/v1', 'v1DocumentManagement'],
  ['/api/pls/v1', 'v1ProjectLogic'],
  ['/api/internal/workflows', 'v1TemporalJobs'],
  ['/api/temporal', 'v1TemporalJobs'],
] as const;

export default defineConfig([
  {
    input: apiSpecPath,
    output: generatedClientOutput('src/api-clients/backend'),
    parser: {
      filters: {
        operations: { exclude: ['/^[A-Z]+ \/api\/v2\//'] },
        orphans: true,
      },
      patch: {
        operations: (_method, routePath, operation) => {
          const namespace = legacyOperationNamespaces.find(([prefix]) =>
            routePath.startsWith(prefix),
          )?.[1];
          const operationId = operation.operationId;
          if (
            namespace === undefined ||
            operationId === undefined ||
            operationId.startsWith(namespace)
          ) {
            return;
          }
          operation.operationId = `${namespace}${operationId[0]?.toUpperCase()}${operationId.slice(1)}`;
        },
      },
    },
    plugins,
  },
  ...(LAW_CHANGES_OPENAPI_URL === undefined
    ? []
    : [
        {
          input: LAW_CHANGES_OPENAPI_URL,
          output: generatedClientOutput('src/api-clients/law-changes-module'),
          plugins,
        },
      ]),
]);
