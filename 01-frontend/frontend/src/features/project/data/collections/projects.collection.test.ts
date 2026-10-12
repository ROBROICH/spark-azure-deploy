import type { ProjectResponse } from '@/api-clients/backend';
import { client } from '@/api-clients/backend/client.gen';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { createLiveQueryCollection, eq } from '@tanstack/db';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProjectNotFoundError,
  projectsCollection,
} from './projects.collection';

const originalClientConfig = client.getConfig();

afterEach(() => {
  queryClient.clear();
  client.setConfig(originalClientConfig);
});

describe('project detail reads', () => {
  it.each([404, 422])(
    'presents HTTP %i as a missing project rather than a generic read failure',
    async (status) => {
      client.setConfig({
        baseUrl: 'http://projects.test',
        fetch: () => Promise.resolve(new Response(null, { status })),
      });
      await expect(
        projectsCollection.utils.fetchProject('project-missing'),
      ).rejects.toBeInstanceOf(ProjectNotFoundError);
    },
  );
});

const project: ProjectResponse = {
  id: '62000000-0000-4000-8000-000000000001',
  name: 'Ortsumgehung Nord',
  projectTypeId: 'type-1',
  projectTypeName: 'Straßenbau',
  createdById: '62000000-0000-4000-8000-000000000002',
  entryDate: '2026-01-01',
  internalProjectNumber: 'AZ-001',
  state: null,
  imported: null,
  owners: [],
  members: [],
  auditors: [],
  salutation: null,
  company: null,
  firstName: null,
  lastName: null,
  street: null,
  houseNumber: null,
  addressSupplement: null,
  plz: null,
  location: null,
  country: null,
  email: null,
  phone: null,
  fax: null,
  statusId: 'status-1',
  statusName: 'Offen',
  currentProcessStepId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  originalCreatedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  projectVersion: 1,
  latestVersion: 1,
};

describe('project updates', () => {
  it('patches only the edited fields and never the session-owned creator', async () => {
    const patches: unknown[] = [];
    client.setConfig({
      baseUrl: 'http://projects.test',
      fetch: async (request) => {
        if (!(request instanceof Request) || request.method !== 'PATCH') {
          return Response.json(project);
        }
        const body: unknown = await request.json();
        patches.push(body);
        return Response.json({ ...project, name: 'Ortsumgehung Süd' });
      },
    });
    const loaded = createLiveQueryCollection((q) =>
      q
        .from({ projects: projectsCollection })
        .where(({ projects }) => eq(projects.id, project.id)),
    );
    try {
      await loaded.preload();
      await projectsCollection.update(project.id, (draft) => {
        draft.name = 'Ortsumgehung Süd';
        draft.createdById = '62000000-0000-4000-8000-000000000003';
      }).isPersisted.promise;

      expect(patches).toEqual([{ name: 'Ortsumgehung Süd' }]);
    } finally {
      await loaded.cleanup();
    }
  });
});
