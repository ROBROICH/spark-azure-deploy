import { client } from '@/api-clients/backend/client.gen';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { setDocumentType } from './documentActions';

const originalClientConfig = client.getConfig();

afterEach(() => {
  queryClient.clear();
  client.setConfig(originalClientConfig);
});

describe('setDocumentType', () => {
  it('records the chosen type as the human decision for that document', async () => {
    const requests: { method: string; path: string; body: unknown }[] = [];
    client.setConfig({
      baseUrl: 'http://formal.test',
      fetch: async (request) => {
        if (!(request instanceof Request)) {
          throw new TypeError('Expected a Request');
        }
        requests.push({
          method: request.method,
          path: new URL(request.url).pathname,
          body: await request.json(),
        });
        return Response.json({});
      },
    });

    await setDocumentType('project-1', 'file-1', 'type-7');

    expect(requests).toEqual([
      {
        method: 'PATCH',
        path: '/api/fcs/v1/project-1/documents/file-1',
        body: { humanRequiredDocumentTypeId: 'type-7' },
      },
    ]);
  });

  it('rejects when the server refuses the change so the caller can report it', async () => {
    client.setConfig({
      baseUrl: 'http://formal.test',
      fetch: () => Promise.resolve(new Response(null, { status: 409 })),
    });

    await expect(
      setDocumentType('project-1', 'file-1', 'type-7'),
    ).rejects.toBeDefined();
  });
});
