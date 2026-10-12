import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectForm } from './CreateProjectForm';

const mocks = vi.hoisted(() => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

vi.mock('@/features/ui/dialog/Dialog', () => ({
  Dialog: (props: { children?: React.ReactNode; open: boolean }) =>
    props.open ? <div>{props.children}</div> : null,
  DialogContent: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  DialogDescription: (props: { children?: React.ReactNode; role?: string }) => (
    <p role={props.role}>{props.children}</p>
  ),
  DialogHeader: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  DialogTitle: (props: { children?: React.ReactNode }) => (
    <h2>{props.children}</h2>
  ),
}));

vi.mock('./CreateProjectFormContent', () => ({
  CreateProjectFormContent: (props: {
    defaultProjectTypeId: string;
    projectTypes: { id: string; name: string }[];
  }) => (
    <div>
      <div data-testid="default-project-type-id">
        {props.defaultProjectTypeId}
      </div>
      <ul>
        {props.projectTypes.map((type) => (
          <li key={type.id}>{type.name}</li>
        ))}
      </ul>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.useLiveQuery.mockReset();
});

describe('CreateProjectForm active project types', () => {
  it('explains when configured project types are all inactive', () => {
    mocks.useLiveQuery.mockReturnValue({
      data: [{ id: 'inactive-1', name: 'Kohlekraftwerk', active: false }],
      isLoading: false,
    });

    render(<CreateProjectForm open onOpenChange={vi.fn()} />);

    expect(screen.getByText('noActiveProjectTypes')).toBeInTheDocument();
    expect(screen.queryByText('projectTypesLoadError')).toBeNull();
    expect(screen.queryByTestId('default-project-type-id')).toBeNull();
  });

  it('offers only active types and defaults to the first active type', () => {
    mocks.useLiveQuery.mockReturnValue({
      data: [
        { id: 'inactive-1', name: 'Kohlekraftwerk', active: false },
        { id: 'active-1', name: 'Windpark', active: true },
        { id: 'active-2', name: 'Solarpark', active: true },
      ],
      isLoading: false,
    });

    render(<CreateProjectForm open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('default-project-type-id')).toHaveTextContent(
      'active-1',
    );
    expect(screen.getByText('Windpark')).toBeInTheDocument();
    expect(screen.getByText('Solarpark')).toBeInTheDocument();
    expect(screen.queryByText('Kohlekraftwerk')).toBeNull();
  });
});
