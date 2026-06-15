import { defineConfig } from '@hey-api/openapi-ts';
import { config } from 'dotenv';
import path from 'node:path';

config();
config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const plugins = ['@tanstack/react-query', '@hey-api/client-fetch'] as const;

// Strip generated client files after codegen so upstream template TODO comments stay out of review surfaces.
const stripGeneratedClientTodoCommentsPostProcess = {
  name: 'Strip generated client files TODO comments',
  command: 'node',
  args: ['src/scripts/strip-generated-client-todos.js', '{{path}}'],
} as const;

const generatedClientOutput = (path: string) => ({
  path,
  postProcess: [stripGeneratedClientTodoCommentsPostProcess],
});

const PLS_OPENAPI_URL =
  process.env.VITE_PLS_OPENAPI_URL ?? 'http://localhost:18000/openapi.json';
const DMS_OPENAPI_URL =
  process.env.VITE_DMS_OPENAPI_URL ?? 'http://localhost:18001/openapi.json';
const FCS_OPENAPI_URL =
  process.env.VITE_FCS_OPENAPI_URL ?? 'http://localhost:18002/openapi.json';
const AOM_OPENAPI_URL =
  process.env.VITE_AOM_OPENAPI_URL ?? 'http://localhost:18003/openapi.json';
const TEMPORAL_JOBS_OPENAPI_URL =
  process.env.VITE_TEMPORAL_JOBS_OPENAPI_URL ??
  'http://localhost:18004/openapi.json';
const PNS_OPENAPI_URL =
  process.env.VITE_PNS_OPENAPI_URL ?? 'http://localhost:18005/openapi.json';
const OMS_OPENAPI_URL =
  process.env.VITE_OMS_OPENAPI_URL ?? 'http://localhost:18006/openapi.json';
const SUPPLEMENTARY_REQUESTS_OPENAPI_URL =
  process.env.VITE_SUPPLEMENTARY_REQUESTS_OPENAPI_URL ??
  'http://localhost:18007/openapi.json';
const COMMENTS_OPENAPI_URL =
  process.env.VITE_COMMENTS_OPENAPI_URL ??
  'http://localhost:18008/openapi.json';
const EXAMINATION_OPENAPI_URL =
  process.env.VITE_EXAMINATION_OPENAPI_URL ??
  'http://localhost:18009/openapi.json';
const VAE_OPENAPI_URL =
  process.env.VITE_VAE_OPENAPI_URL ?? 'http://localhost:18010/openapi.json';
const LAW_CHANGES_OPENAPI_URL =
  process.env.VITE_LAW_CHANGES_OPENAPI_URL ??
  'http://localhost:18011/openapi.json';
const IDENTITY_MANAGEMENT_OPENAPI_URL =
  process.env.VITE_IDENTITY_MANAGEMENT_OPENAPI_URL ??
  'http://localhost:18012/openapi.json';
const FEEDBACK_OPENAPI_URL =
  process.env.VITE_FEEDBACK_OPENAPI_URL ??
  'http://localhost:18013/openapi.json';
const PROTOCOL_OPENAPI_URL =
  process.env.VITE_PROTOCOL_OPENAPI_URL ??
  'http://localhost:18014/openapi.json';

export default defineConfig([
  {
    input: PLS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/pls-module'),
    plugins,
  },
  {
    input: DMS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/dms-module'),
    plugins,
  },
  {
    input: FCS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/fcs-module'),
    plugins,
  },
  {
    input: AOM_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/agent-orchestration-module'),
    plugins,
  },
  {
    input: TEMPORAL_JOBS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/temporal-jobs-module'),
    plugins,
  },
  {
    input: PNS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/pns-module'),
    plugins,
  },
  {
    input: OMS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/oms-module'),
    plugins,
  },
  {
    input: SUPPLEMENTARY_REQUESTS_OPENAPI_URL,
    output: generatedClientOutput(
      'src/api-clients/supplementary-requests-module',
    ),
    plugins,
  },
  {
    input: COMMENTS_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/comments-module'),
    plugins,
  },
  {
    input: EXAMINATION_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/examination-module'),
    plugins,
  },
  {
    input: VAE_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/vae-module'),
    plugins,
  },
  {
    input: LAW_CHANGES_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/law-changes-module'),
    plugins,
  },
  {
    input: IDENTITY_MANAGEMENT_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/identity-management-module'),
    plugins,
  },
  {
    input: FEEDBACK_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/feedback-module'),
    plugins,
  },
  {
    input: PROTOCOL_OPENAPI_URL,
    output: generatedClientOutput('src/api-clients/protocol-module'),
    plugins,
  },
]);
