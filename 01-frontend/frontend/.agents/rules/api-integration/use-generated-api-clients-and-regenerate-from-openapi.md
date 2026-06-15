# Use Generated API Clients and Regenerate from OpenAPI

- Do not hand-write request clients for APIs that already have generated clients.
- Import from `src/api-clients/` instead of copying request code across features.
- Do not manually edit generated client output files.
- When the contract changes, regenerate the clients from OpenAPI instead of patching generated code by hand.
- Generated API clients are configured with `redirect: 'manual'` in `configureClients()` so auth/session redirects can be detected before the browser follows them.
- Do not add generated-client flows that depend on automatic redirect following. If a backend endpoint intentionally uses redirects for non-auth behavior, document that contract and use an explicit request path that preserves session-expiry handling.

## Bad Example

```tsx
const getProject = async (projectId: string) => {
  return fetch(`/api/pls/projects/${projectId}`).then((response) =>
    response.json(),
  );
};
```

## Good Example

```tsx
import { projectsClient } from '@/api-clients/projects';

const getProject = (projectId: string) => {
  return projectsClient.getProject({ path: { projectId } });
};
```
