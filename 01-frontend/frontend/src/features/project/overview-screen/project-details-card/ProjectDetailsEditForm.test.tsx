import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDetailsEditForm } from './ProjectDetailsEditForm';

const mocks = vi.hoisted(() => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: (...args: unknown[]) => mocks.useLiveQuery(...args),
}));

vi.mock(
  '@/features/project/data/project-types/projectTypes.collection',
  () => ({
    projectTypesCollection: {},
  }),
);

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  projectsCollection: {},
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/ui/select-menu/SelectMenu', () => ({
  SelectMenu: (props: {
    items: { value: string; label: string }[];
    id?: string;
  }) => (
    <ul data-testid={props.id}>
      {props.items.map((item) => (
        <li key={item.value}>{item.label}</li>
      ))}
    </ul>
  ),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.useLiveQuery.mockReset();
  mocks.useLiveQuery.mockImplementation(() => ({ data: [] }));
});

describe('ProjectDetailsEditForm project type options', () => {
  it('keeps the inactive current type visible and labeled', () => {
    mocks.useLiveQuery.mockReturnValue({
      data: [
        { id: 'type-active', name: 'Windpark', active: true },
        { id: 'type-current', name: 'Kohlekraftwerk', active: false },
        { id: 'type-other-inactive', name: 'Kernkraft', active: false },
      ],
    });

    render(
      <ProjectDetailsEditForm
        canMutateProject
        project={{
          id: 'project-1',
          name: 'Test',
          projectTypeId: 'type-current',
          internalProjectNumber: 'AZ-1',
          entryDate: '2026-01-01',
          state: 'Bayern',
        }}
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const typeOptions = screen.getByTestId('edit-project-type');
    expect(typeOptions).toHaveTextContent(
      'ProjectDetails.edit.inactiveType:Kohlekraftwerk',
    );
    expect(typeOptions).toHaveTextContent('Windpark');
    expect(typeOptions).not.toHaveTextContent('Kernkraft');
  });
});
