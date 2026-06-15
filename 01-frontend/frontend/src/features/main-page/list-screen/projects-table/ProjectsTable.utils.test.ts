import { describe, expect, it } from 'vitest';
import type { Project } from '../../data/schemas/project.schema';
import { filterProjects } from './ProjectsTable.utils';

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Test Project',
  internalProjectNumber: 'AZ-001',
  projectTypeId: 'type-1',
  projectTypeName: 'TypeA',
  createdById: 'creator-1',
  statusId: 'status-1',
  statusName: 'Offen',
  createdAt: '2024-01-01T00:00:00Z',
  originalCreatedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  entryDate: '2024-01-01',
  projectVersion: 1,
  latestVersion: 1,
  owners: [],
  members: [],
  ...overrides,
});

const baseParams = {
  anlageFilter: [] as [],
  typeFilter: [],
  statusFilter: [],
  favoriteFilter: [] as [],
  currentUserId: undefined,
  favoriteIds: [],
  search: '',
};

describe('filterProjects – zuordnungFilter', () => {
  const currentUserId = 'user-1';

  const ownedProject = makeProject({ id: 'owned', owners: [currentUserId] });
  const memberProject = makeProject({ id: 'member', members: [currentUserId] });
  const unrelatedProject = makeProject({
    id: 'unrelated',
    owners: ['other-user'],
  });
  const allProjects = [ownedProject, memberProject, unrelatedProject];

  it('returns all projects for zuordnungFilter "alle"', () => {
    const result = filterProjects({
      ...baseParams,
      projects: allProjects,
      zuordnungFilter: 'alle',
      currentUserId,
    });
    expect(result).toHaveLength(3);
  });

  it('returns only owned/member projects for zuordnungFilter "meine"', () => {
    const result = filterProjects({
      ...baseParams,
      projects: allProjects,
      zuordnungFilter: 'meine',
      currentUserId,
    });
    expect(result.map((p) => p.id)).toEqual(['owned', 'member']);
  });

  it('fails closed and returns no projects when "meine" is active but identity is missing', () => {
    const result = filterProjects({
      ...baseParams,
      projects: allProjects,
      zuordnungFilter: 'meine',
      currentUserId: undefined,
    });
    expect(result).toEqual([]);
  });

  it('still returns all projects for "alle" when identity is missing', () => {
    const result = filterProjects({
      ...baseParams,
      projects: allProjects,
      zuordnungFilter: 'alle',
      currentUserId: undefined,
    });
    expect(result).toHaveLength(3);
  });
});

describe('filterProjects – favoriteFilter', () => {
  const projects = [
    makeProject({ id: 'fav1' }),
    makeProject({ id: 'fav2' }),
    makeProject({ id: 'unfav1' }),
  ];
  const favoriteIds = ['fav1', 'fav2'];

  it('shows only favorited projects when filter is ["favorited"]', () => {
    const result = filterProjects({
      ...baseParams,
      projects,
      zuordnungFilter: 'alle',
      favoriteFilter: ['favorited'],
      favoriteIds,
    });
    expect(result.map((p) => p.id)).toEqual(['fav1', 'fav2']);
  });

  it('shows only non-favorited projects when filter is ["not-favorited"]', () => {
    const result = filterProjects({
      ...baseParams,
      projects,
      zuordnungFilter: 'alle',
      favoriteFilter: ['not-favorited'],
      favoriteIds,
    });
    expect(result.map((p) => p.id)).toEqual(['unfav1']);
  });

  it('shows all projects when both values are selected', () => {
    const result = filterProjects({
      ...baseParams,
      projects,
      zuordnungFilter: 'alle',
      favoriteFilter: ['favorited', 'not-favorited'],
      favoriteIds,
    });
    expect(result).toHaveLength(3);
  });
});

describe('filterProjects – anlageFilter', () => {
  const projects = [
    makeProject({ id: 'fpp', imported: true }),
    makeProject({ id: 'spark-false', imported: false }),
    makeProject({ id: 'spark-null', imported: null }),
    makeProject({ id: 'spark-missing', imported: undefined }),
  ];

  it('shows only imported projects when filter is ["fpp"]', () => {
    const result = filterProjects({
      ...baseParams,
      projects,
      zuordnungFilter: 'alle',
      anlageFilter: ['fpp'],
    });

    expect(result.map((p) => p.id)).toEqual(['fpp']);
  });

  it('shows non-imported projects when filter is ["spark"]', () => {
    const result = filterProjects({
      ...baseParams,
      projects,
      zuordnungFilter: 'alle',
      anlageFilter: ['spark'],
    });

    expect(result.map((p) => p.id)).toEqual([
      'spark-false',
      'spark-null',
      'spark-missing',
    ]);
  });

  it('shows all projects when both values are selected', () => {
    const result = filterProjects({
      ...baseParams,
      projects,
      zuordnungFilter: 'alle',
      anlageFilter: ['spark', 'fpp'],
    });

    expect(result).toHaveLength(4);
  });
});
