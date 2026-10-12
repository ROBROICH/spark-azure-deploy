import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { client } from '@/api-clients/backend/client.gen';
import type { FileResponse } from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { useProjectFiles } from './useProjectFiles';

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: () => 7,
  getMountedProjectIds: () => [],
}));

const projectId = '61000000-0000-4000-8000-000000000002';
const files: FileResponse[] = Array.from({ length: 120 }, (_, index) => ({
  id: `61000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  type: 'document',
  filename: `document-${index}.pdf`,
  mimeType: 'application/pdf',
  bucketPath: `${projectId}/document-${index}.pdf`,
  version: 1,
  projectVersion: 2,
  addedInVersion: 1,
  isDeleted: false,
  projectId,
  workflowId: null,
  runId: null,
  vectorSearchable: true,
  topics: [],
  createdAt: new Date(Date.UTC(2026, 8, 1, 8, 0, 120 - index)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 8, 1, 8, 0, 120 - index)).toISOString(),
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

describe('useProjectFiles', () => {
  it('transfers only the initial visible window from the selected document version', async () => {
    const original = client.getConfig();
    const requests: URL[] = [];
    const transferred: string[] = [];
    client.setConfig({
      baseUrl: 'http://files.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        requests.push(url);
        const page = Number(url.searchParams.get('page') ?? 1);
        const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
        const items = files.slice((page - 1) * pageSize, page * pageSize);
        transferred.push(...items.map((file) => file.id));
        return Promise.resolve(Response.json(items));
      },
    });
    const hook = renderHook(
      () => useProjectFiles(projectId, { documentVersion: 2 }),
      { wrapper },
    );
    try {
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
      expect(hook.result.current.files.map((file) => file.id)).toEqual(
        files.slice(0, 50).map((file) => file.id),
      );
      expect(transferred.length).toBeLessThanOrEqual(51);
      expect(
        requests.every((url) => url.searchParams.get('projectVersion') === '2'),
      ).toBe(true);
    } finally {
      hook.unmount();
      queryClient.clear();
      client.setConfig(original);
    }
  });
});
